import { Database } from 'sqlite3';
import { allDbRows } from '../utils/dbAsync';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { pokemonApiClient } from './pokemonApiClient';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export interface BinderConstraints {
  pokemonTypes?: string[];
  rarityPreferences?: string[];
  eraBias?: string;
  specificSets?: string[];
  excludeSets?: string[];
  themeKeywords?: string[];
  compositionRules?: string[];
  maxSingleCardPrice?: number;
}

export interface PlannedCard {
  cardId: string;
  cardName: string;
  setId: string;
  setName: string;
  cardNumber: string;
  rarity: string;
  types: string;
  imageSmall: string | null;
  imageLarge: string | null;
  marketPrice: number | null;
  score: number;
}

export interface BinderPlan {
  slots: PlannedCard[];
  totalCost: number;
  remainingBudget: number;
  constraints: BinderConstraints;
  originalPrompt: string;
  filledSlots: number;
  totalSlots: number;
}

/** Pokemon TCG API type names (not video-game types). */
const THEME_TYPE_MAP: Record<string, string[]> = {
  warm: ['Fire', 'Fighting', 'Lightning'],
  sunny: ['Fire', 'Lightning', 'Grass'],
  icy: ['Water', 'Psychic'],
  cool: ['Water', 'Psychic', 'Darkness'],
  earthy: ['Grass', 'Fighting'],
  colorful: ['Psychic', 'Fairy', 'Dragon'],
  dark: ['Darkness', 'Psychic', 'Metal'],
  edgy: ['Darkness', 'Fire', 'Fighting'],
  pastel: ['Fairy', 'Psychic', 'Grass'],
  neon: ['Lightning', 'Psychic', 'Fire'],
  vibrant: ['Fire', 'Lightning', 'Fairy'],
  mystic: ['Psychic', 'Darkness', 'Dragon'],
  nature: ['Grass', 'Water', 'Fighting'],
  royal: ['Psychic', 'Metal', 'Fairy'],
};

/** Map UI / game-type labels → Pokemon TCG API `types:` values. */
const TCG_TYPE_ALIASES: Record<string, string> = {
  fire: 'Fire',
  water: 'Water',
  grass: 'Grass',
  electric: 'Lightning',
  lightning: 'Lightning',
  psychic: 'Psychic',
  fighting: 'Fighting',
  dark: 'Darkness',
  darkness: 'Darkness',
  ghost: 'Psychic',
  steel: 'Metal',
  metal: 'Metal',
  fairy: 'Fairy',
  dragon: 'Dragon',
  ground: 'Fighting',
  ice: 'Water',
  normal: 'Colorless',
  colorless: 'Colorless',
  poison: 'Darkness',
  bug: 'Grass',
  rock: 'Fighting',
  flying: 'Colorless',
};

/** Expand UI rarity chips into exact Pokemon TCG API rarity strings for queries. */
const RARITY_API_VALUES: Record<string, string[]> = {
  common: ['Common'],
  uncommon: ['Uncommon'],
  rare: ['Rare', 'Rare Holo'],
  holo: ['Rare Holo'],
  'reverse holo': ['Rare'], // reverse often shares Rare; filtered client-side loosely
  v: ['Rare Holo V'],
  vmax: ['Rare Holo VMAX'],
  vstar: ['Rare Holo VSTAR'],
  'full art': ['Ultra Rare', 'Rare Ultra', 'Illustration Rare'],
  'alternate art': ['Special Illustration Rare', 'Illustration Rare', 'Amazing Rare'],
  'secret rare': ['Rare Secret', 'Hyper Rare', 'Shiny Ultra Rare', 'Mega Hyper Rare'],
  'ultra rare': ['Ultra Rare', 'Rare Ultra', 'Double Rare'],
  'trainer gallery': ['Trainer Gallery Rare Holo'],
  radiant: ['Radiant Rare'],
  rainbow: ['Rare Rainbow'],
};

function rarityApiQuery(preferences: string[]): string | null {
  const values = new Set<string>();
  for (const pref of preferences) {
    for (const v of RARITY_API_VALUES[pref.toLowerCase()] || []) {
      values.add(v);
    }
  }
  if (values.size === 0) return null;
  return `(${[...values].map((v) => `rarity:"${v}"`).join(' OR ')})`;
}

/** UI rarity chips → substrings that match real catalog/API rarity strings. */
const RARITY_MATCH_PATTERNS: Record<string, string[]> = {
  common: ['^common$'],
  uncommon: ['^uncommon$'],
  rare: ['^rare$', '^rare holo$'],
  holo: ['rare holo', 'holo'],
  'reverse holo': ['reverse'],
  v: ['rare holo v$'],
  vmax: ['vmax'],
  vstar: ['vstar'],
  'full art': ['ultra rare', 'rare ultra', 'illustration rare'],
  'alternate art': ['special illustration rare', 'illustration rare', 'amazing rare'],
  'secret rare': ['rare secret', 'hyper rare', 'shiny ultra rare', 'mega hyper rare'],
  'ultra rare': ['ultra rare', 'rare ultra', 'double rare'],
  'trainer gallery': ['trainer gallery'],
  radiant: ['radiant'],
  rainbow: ['rainbow'],
};

/** Themes that clash with rainbow / pastel card treatments. */
const DARK_AESTHETIC_THEMES = new Set([
  'dark', 'edgy', 'gothic', 'spooky', 'batman', 'noir', 'shadow',
]);

function wantsDarkAesthetic(prompt: string, themeKeywords: string[] = []): boolean {
  const lower = prompt.toLowerCase();
  if (/batman|gotham|noir|shadowy|edgy|gothic|spooky|dark vibe|dark aesthetic/.test(lower)) {
    return true;
  }
  return themeKeywords.some((k) => DARK_AESTHETIC_THEMES.has(k.toLowerCase()));
}

function isRainbowTreatment(rarity: string | null | undefined): boolean {
  const r = (rarity || '').toLowerCase();
  return /rainbow|rare rainbow/.test(r);
}

/** Prompt vibes → Pokemon name hints used for scoring (and soft search). */
const VIBE_NAME_HINTS: Record<string, string[]> = {
  batman: ['Umbreon', 'Darkrai', 'Zoroark', 'Gengar', 'Absol', 'Honchkrow', 'Yveltal', 'Greninja', 'Hydreigon', 'Murkrow'],
  dark: ['Umbreon', 'Darkrai', 'Zoroark', 'Gengar', 'Absol', 'Yveltal', 'Hydreigon', 'Spiritomb'],
  edgy: ['Gengar', 'Darkrai', 'Absol', 'Hydreigon', 'Houndoom'],
  gothic: ['Gengar', 'Mimikyu', 'Banette', 'Misdreavus', 'Sableye'],
  spooky: ['Gengar', 'Mimikyu', 'Banette', 'Pumpkaboo', 'Dusknoir'],
  cool: ['Greninja', 'Lucario', 'Mewtwo', 'Charizard', 'Umbreon'],
  mystic: ['Mewtwo', 'Gardevoir', 'Lugia', 'Xerneas', 'Necrozma'],
};

function toTcgTypes(types: string[]): string[] {
  const out: string[] = [];
  for (const t of types) {
    const mapped = TCG_TYPE_ALIASES[t.trim().toLowerCase()] || t.trim();
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  return out;
}

function rarityMatchesPreference(cardRarity: string, preference: string): boolean {
  const r = (cardRarity || '').toLowerCase().trim();
  if (!r) return false;
  const key = preference.toLowerCase().trim();
  const patterns = RARITY_MATCH_PATTERNS[key] || [key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')];
  return patterns.some((pat) => {
    try {
      return new RegExp(pat, 'i').test(r);
    } catch {
      return r.includes(pat.toLowerCase());
    }
  });
}

function cardMatchesAnyRarity(cardRarity: string, preferences: string[]): boolean {
  return preferences.some((p) => rarityMatchesPreference(cardRarity, p));
}

function vibeHintsFromText(text: string, themeKeywords: string[] = []): string[] {
  const lower = text.toLowerCase();
  const hints: string[] = [];
  for (const [vibe, names] of Object.entries(VIBE_NAME_HINTS)) {
    if (lower.includes(vibe) || themeKeywords.some((k) => k.toLowerCase() === vibe)) {
      hints.push(...names);
    }
  }
  return [...new Set(hints)];
}

function buildConstraintsPrompt(userDescription: string): string {
  return `You are a Pokemon TCG binder planner assistant. Parse the user's binder request and output ONLY valid JSON.

The user wants to fill a 3x3 binder page (9 card slots) with Pokemon TCG cards matching their description.

Output JSON with these fields:
- "pokemonTypes": array of Pokemon TCG types (Fire, Water, Grass, Lightning, Psychic, Fighting, Darkness, Metal, Fairy, Dragon, Colorless) that fit the theme. Never use video-game-only types like Ghost, Steel, Electric, Ground — map those to Psychic/Metal/Lightning/Fighting.
- "rarityPreferences": array of rarities that fit ("V", "VMAX", "VSTAR", "Holo", "Reverse Holo", "Common", "Uncommon", "Rare", "Full Art", "Alternate Art", "Secret Rare", "Ultra Rare", "Trainer Gallery", "Radiant")
- "eraBias": one of "modern" (Sword & Shield onward), "classic" (WOTC era), "mid-era" (EX/Diamond & Pearl through XY), "any"
- "specificSets": array of set IDs if mentioned (e.g., "sv1", "swsh1", "base1"). Empty array if none.
- "excludeSets": array of set IDs to exclude. Empty array if none.
- "themeKeywords": array of 1-3 theme words describing the visual/emotional feel
- "compositionRules": array of rules like "no_duplicate_names", "at_least_2_v", "at_least_1_full_art", "mix_of_types", "single_evolution_line", "all_same_type", "all_different_types"
- "maxSingleCardPrice": maximum price for any single card in dollars (number or null)
- "pokemonNames": specific Pokemon names mentioned (array of strings, empty if none)

User request: "${userDescription}"

Output ONLY valid JSON. No explanation. No markdown. Just the JSON object.`;
}

async function callGroqApi(prompt: string): Promise<string> {
  const apiKey = env.apis.groq;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a Pokemon TCG binder planner. Parse user requests into structured JSON card search filters.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Groq API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string') {
    throw new Error('Groq returned empty or malformed response');
  }
  return text.trim();
}

function cleanJsonResponse(text: string): string {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  return text;
}

export async function translateConstraints(userDescription: string): Promise<BinderConstraints> {
  try {
    const prompt = buildConstraintsPrompt(userDescription);
    const raw = await callGroqApi(prompt);
    const cleaned = cleanJsonResponse(raw);
    const parsed = JSON.parse(cleaned) as BinderConstraints & { maxSingleCardPrice?: number | null; pokemonNames?: string[] };

    if (parsed.maxSingleCardPrice !== undefined && parsed.maxSingleCardPrice !== null) {
      parsed.maxSingleCardPrice = Math.round(parsed.maxSingleCardPrice * 100);
    }

    return parsed;
  } catch (err) {
    logger.warn('LLM constraint translation failed, using fallback:', err);
    return inferConstraintsFromText(userDescription);
  }
}

function inferConstraintsFromText(text: string): BinderConstraints {
  const lower = text.toLowerCase();
  const constraints: BinderConstraints = {};

  // Aesthetic vibes (batman, gothic, etc.) map to dark theme when no explicit theme word.
  if (lower.includes('batman') || lower.includes('gotham') || lower.includes('gothic') || lower.includes('spooky')) {
    constraints.themeKeywords = [...new Set([...(constraints.themeKeywords || []), 'dark'])];
    constraints.pokemonTypes = [...new Set([...(constraints.pokemonTypes || []), ...THEME_TYPE_MAP.dark])];
  }

  const themeMatches: string[] = [];
  for (const [theme, types] of Object.entries(THEME_TYPE_MAP)) {
    if (lower.includes(theme)) {
      themeMatches.push(theme);
      if (!constraints.pokemonTypes) constraints.pokemonTypes = [];
      constraints.pokemonTypes.push(...types);
    }
  }
  if (themeMatches.length > 0) {
    constraints.themeKeywords = [...new Set([...(constraints.themeKeywords || []), ...themeMatches])];
    constraints.pokemonTypes = toTcgTypes(constraints.pokemonTypes || []);
  } else if (constraints.pokemonTypes?.length) {
    constraints.pokemonTypes = toTcgTypes(constraints.pokemonTypes);
  }

  const typeNames = [
    'Fire', 'Water', 'Grass', 'Electric', 'Lightning', 'Psychic', 'Fighting',
    'Dark', 'Darkness', 'Ghost', 'Steel', 'Metal', 'Fairy', 'Dragon', 'Ground', 'Ice',
    'Normal', 'Colorless', 'Poison', 'Bug', 'Rock', 'Flying',
  ];
  for (const t of typeNames) {
    if (lower.includes(t.toLowerCase())) {
      constraints.pokemonTypes = toTcgTypes([...(constraints.pokemonTypes || []), t]);
    }
  }

  const rarityMap: Record<string, string> = {
    'vstar': 'VSTAR',
    'vmax': 'VMAX',
    'full art': 'Full Art',
    'alternate art': 'Alternate Art',
    'alt art': 'Alternate Art',
    'secret rare': 'Secret Rare',
    'trainer gallery': 'Trainer Gallery',
    'ultra rare': 'Ultra Rare',
    'reverse': 'Reverse Holo',
    'radiant': 'Radiant',
    'holo': 'Holo',
  };
  const rarities: string[] = [];
  for (const [keyword, rarity] of Object.entries(rarityMap)) {
    if (lower.includes(keyword)) rarities.push(rarity);
  }
  // Standalone "V" is too noisy — only when phrased as card type.
  if (/\bv[\s-]?cards?\b|\bat least.*\bv\b|\bholo v\b/i.test(lower) && !rarities.includes('V')) {
    rarities.push('V');
  }
  if (rarities.length > 0) constraints.rarityPreferences = rarities;

  // Only treat "$X" as a per-card cap when phrased as max/under/per card — not total budget.
  const maxCardMatch = lower.match(/(?:max|under|upto|up to|per card|each)\s*\$?\s*(\d+(?:\.\d+)?)/);
  if (maxCardMatch) {
    constraints.maxSingleCardPrice = Math.round(parseFloat(maxCardMatch[1]) * 100);
  }

  if (lower.includes('modern') || lower.includes('sword') || lower.includes('scarlet')) {
    constraints.eraBias = 'modern';
  } else if (lower.includes('classic') || lower.includes('base') || lower.includes('wotc')) {
    constraints.eraBias = 'classic';
  }

  const composition: string[] = [];
  if (lower.includes('no duplicate') || lower.includes('no dup')) composition.push('no_duplicate_names');
  if (lower.includes('mix')) composition.push('mix_of_types');
  if (lower.includes('all same') || lower.includes('single type')) composition.push('all_same_type');
  if (lower.includes('evolution')) composition.push('single_evolution_line');
  if (rarities.includes('V') && (lower.includes('v') || lower.includes('at least'))) composition.push('at_least_2_v');
  if (composition.length > 0) constraints.compositionRules = composition;

  return constraints;
}

async function getLatestPrices(db: Database): Promise<Map<string, number>> {
  const rows = await allDbRows<{ uniqueIdentifier: string; marketPrice: number }>(
    db,
    `SELECT ph.uniqueIdentifier, ph.marketPrice
     FROM price_history ph
     INNER JOIN (
       SELECT uniqueIdentifier, MAX(date) AS maxDate
       FROM price_history
       WHERE marketPrice IS NOT NULL AND marketPrice > 0
       GROUP BY uniqueIdentifier
     ) latest ON ph.uniqueIdentifier = latest.uniqueIdentifier AND ph.date = latest.maxDate`
  );

  const priceMap = new Map<string, number>();
  for (const row of rows) {
    priceMap.set(row.uniqueIdentifier, row.marketPrice);
  }
  return priceMap;
}

function computeTypeThemeScore(types: string | null, themeKeywords: string[]): number {
  if (!types || themeKeywords.length === 0) return 0.5;

  const cardTypes = types.split(',').map((t) => t.trim());
  let maxScore = 0;

  for (const keyword of themeKeywords) {
    const themeTypes = toTcgTypes(THEME_TYPE_MAP[keyword.toLowerCase()] || []);
    for (const cardType of cardTypes) {
      if (themeTypes.includes(cardType)) {
        maxScore = Math.max(maxScore, 1);
      }
    }
  }

  return maxScore;
}

function computeNameVibeScore(cardName: string, nameHints: string[]): number {
  if (nameHints.length === 0) return 0;
  const lower = cardName.toLowerCase();
  for (const hint of nameHints) {
    if (lower.includes(hint.toLowerCase())) return 1;
  }
  return 0;
}

function computeRarityScore(rarity: string | null): number {
  if (!rarity) return 0.3;
  const r = rarity.toLowerCase();

  if (/special illustration|hyper rare|mega hyper|shiny ultra|rare rainbow|rare secret/.test(r)) return 1.0;
  if (/illustration rare|amazing rare/.test(r)) return 0.9;
  if (/vstar|vmax/.test(r)) return 0.85;
  if (/ultra rare|rare ultra|double rare/.test(r)) return 0.8;
  if (/trainer gallery/.test(r)) return 0.7;
  if (/radiant/.test(r)) return 0.65;
  if (/holo v$|rare holo v$/.test(r)) return 0.55;
  if (/rare holo|holo/.test(r)) return 0.4;
  if (r === 'rare') return 0.3;
  if (r === 'uncommon') return 0.2;
  if (r === 'common') return 0.1;
  return 0.35;
}

interface CardCandidate {
  cardId: string;
  cardName: string;
  setId: string;
  setName: string;
  cardNumber: string;
  rarity: string;
  types: string;
  imageSmall: string | null;
  imageLarge: string | null;
  marketPrice: number | null;
  uniqueIdentifier: string;
}

async function mapApiCardsToCandidates(
  db: Database,
  cards: Awaited<ReturnType<typeof pokemonApiClient.searchCardsBulk>>['cards'],
  priceMap: Map<string, number>
): Promise<CardCandidate[]> {
  const ids = cards.map((c) => c.id);
  const mappingRows =
    ids.length === 0
      ? []
      : await allDbRows<{ cardId: string; uniqueIdentifier: string }>(
          db,
          `SELECT cardId, uniqueIdentifier FROM card_mappings
           WHERE variantKey = 'normal' AND cardId IN (${ids.map(() => '?').join(',')})`,
          ids
        );
  const uidByCard = new Map(mappingRows.map((r) => [r.cardId, r.uniqueIdentifier]));

  return cards.map((card) => {
    const uid = uidByCard.get(card.id) || '';
    const marketFromMap = uid ? priceMap.get(uid) : undefined;
    const tcgMarket =
      card.tcgplayer?.prices?.holofoil?.market ??
      card.tcgplayer?.prices?.normal?.market ??
      card.tcgplayer?.prices?.reverseHolofoil?.market ??
      card.tcgplayer?.prices?.['1stEditionHolofoil']?.market ??
      null;
    return {
      cardId: card.id,
      cardName: card.name,
      setId: card.set.id,
      setName: card.set.name,
      cardNumber: card.number,
      rarity: card.rarity || '',
      types: (card.types || []).join(', '),
      imageSmall: card.images?.small || null,
      imageLarge: card.images?.large || null,
      marketPrice: marketFromMap ?? tcgMarket,
      uniqueIdentifier: uid,
    };
  });
}

function applyPriceFilter(
  candidates: CardCandidate[],
  constraints: BinderConstraints
): CardCandidate[] {
  return candidates.filter((c) => {
    if (c.marketPrice == null || c.marketPrice <= 0) return false;
    if (
      constraints.maxSingleCardPrice &&
      c.marketPrice > constraints.maxSingleCardPrice / 100
    ) {
      return false;
    }
    return true;
  });
}

async function queryCandidateCards(
  db: Database,
  constraints: BinderConstraints,
  priceMap: Map<string, number>,
  options: { skipTypes?: boolean; skipRarity?: boolean; nameHints?: string[] } = {}
): Promise<CardCandidate[]> {
  const elementalTypes = options.skipTypes
    ? []
    : toTcgTypes(constraints.pokemonTypes?.filter(Boolean) ?? []);
  const rarityPrefs =
    options.skipRarity || !constraints.rarityPreferences?.length
      ? []
      : constraints.rarityPreferences;

  // Prefer live API when we have elemental types or vibe name hints (catalog types are subtypes).
  const shouldUseApi = elementalTypes.length > 0 || (options.nameHints?.length ?? 0) > 0;

  if (shouldUseApi) {
    try {
      const queryParts: string[] = [];
      if (elementalTypes.length > 0) {
        queryParts.push(`(${elementalTypes.map((t) => `types:${t}`).join(' OR ')})`);
      }
      if (rarityPrefs.length > 0) {
        const rq = rarityApiQuery(rarityPrefs);
        if (rq) queryParts.push(rq);
      }
      if (options.nameHints && options.nameHints.length > 0 && elementalTypes.length === 0 && rarityPrefs.length === 0) {
        // Name-only soft search when types/rarities were dropped
        const nameQ = options.nameHints
          .slice(0, 8)
          .map((n) => `name:"${n}"`)
          .join(' OR ');
        queryParts.push(`(${nameQ})`);
      }

      const rawQuery = queryParts.length > 0 ? queryParts.join(' ') : undefined;
      if (rawQuery) {
        const bulk = await pokemonApiClient.searchCardsBulk({
          rawQuery,
          pageSize: 250,
          fetchAll: false,
          maxPages: 2,
        });

        let candidates = await mapApiCardsToCandidates(db, bulk.cards, priceMap);

        if (rarityPrefs.length > 0) {
          candidates = candidates.filter((c) => cardMatchesAnyRarity(c.rarity, rarityPrefs));
        }

        if (constraints.specificSets && constraints.specificSets.length > 0) {
          const setSet = new Set(constraints.specificSets);
          candidates = candidates.filter((c) => setSet.has(c.setId));
        }

        if (constraints.excludeSets && constraints.excludeSets.length > 0) {
          const excl = new Set(constraints.excludeSets);
          candidates = candidates.filter((c) => !excl.has(c.setId));
        }

        const priced = applyPriceFilter(candidates, constraints);
        if (priced.length > 0) return priced;
        // Fall through to catalog if API pool was empty after filters
      }
    } catch (err) {
      logger.warn('Elemental type API candidate fetch failed, falling back to catalog:', err);
    }
  }

  const conditions: string[] = ['cc.cardId IS NOT NULL'];
  const params: unknown[] = [];

  // Catalog types are usually subtypes — only filter when data looks elemental.
  const sample = await allDbRows<{ types: string | null }>(
    db,
    `SELECT types FROM catalog_cards WHERE types IS NOT NULL AND TRIM(types) != '' LIMIT 20`
  );
  const catalogHasElementalTypes = sample.some((row) =>
    /Fire|Water|Grass|Lightning|Electric|Psychic|Fighting|Darkness|Dark|Fairy|Dragon|Metal/i.test(
      row.types || ''
    )
  );

  if (catalogHasElementalTypes && elementalTypes.length > 0) {
    const typeConditions = elementalTypes.map(() => 'cc.types LIKE ?');
    conditions.push(`(${typeConditions.join(' OR ')})`);
    for (const t of elementalTypes) {
      params.push(`%${t}%`);
    }
  }

  if (rarityPrefs.length > 0) {
    // Expand UI rarities into real rarity LIKE patterns
    const likePatterns: string[] = [];
    for (const pref of rarityPrefs) {
      const pats = RARITY_MATCH_PATTERNS[pref.toLowerCase()] || [pref];
      for (const pat of pats) {
        // Convert simple regex anchors to SQL LIKE
        const like = pat.replace(/^\^/, '').replace(/\$$/, '').replace(/\\/g, '');
        likePatterns.push(like);
      }
    }
    const uniqueLikes = [...new Set(likePatterns)];
    const rarityConds = uniqueLikes.map(() => 'LOWER(COALESCE(NULLIF(TRIM(cc.rarity), \'\'), cm.rarity)) LIKE ?');
    conditions.push(`(${rarityConds.join(' OR ')})`);
    for (const like of uniqueLikes) {
      params.push(`%${like.toLowerCase()}%`);
    }
  }

  if (constraints.specificSets && constraints.specificSets.length > 0) {
    const setConds = constraints.specificSets.map(() => 'cc.setId = ?');
    conditions.push(`(${setConds.join(' OR ')})`);
    for (const s of constraints.specificSets) params.push(s);
  }

  if (constraints.excludeSets && constraints.excludeSets.length > 0) {
    const exclConds = constraints.excludeSets.map(() => 'cc.setId != ?');
    conditions.push(...exclConds);
    for (const s of constraints.excludeSets) params.push(s);
  }

  conditions.push('cm.uniqueIdentifier IS NOT NULL');

  const sql = `SELECT cc.cardId, cc.cardName, cc.setId, cc.setName, cc.cardNumber,
                      COALESCE(NULLIF(TRIM(cc.rarity), ''), cm.rarity) AS rarity,
                      cc.types, cc.imageSmall, cc.imageLarge,
                      cm.uniqueIdentifier
               FROM catalog_cards cc
               JOIN card_mappings cm ON cm.cardId = cc.cardId AND cm.variantKey = 'normal'
               WHERE ${conditions.join(' AND ')}
               GROUP BY cc.cardId
               ORDER BY cc.cardName
               LIMIT 800`;

  const rows = await allDbRows<CardCandidate>(db, sql, params);

  return rows
    .filter((candidate) => {
      const price = priceMap.get(candidate.uniqueIdentifier);
      if (price === undefined || price <= 0) return false;
      if (constraints.maxSingleCardPrice && price > constraints.maxSingleCardPrice / 100) return false;
      // Post-filter with precise rarity matchers (SQL LIKE is looser)
      if (rarityPrefs.length > 0 && !cardMatchesAnyRarity(candidate.rarity || '', rarityPrefs)) {
        return false;
      }
      return true;
    })
    .map((c) => ({
      ...c,
      marketPrice: priceMap.get(c.uniqueIdentifier) ?? null,
    }));
}

function selectOptimalCards(
  candidates: CardCandidate[],
  constraints: BinderConstraints,
  budgetCents: number | null,
  totalSlots: number,
  nameHints: string[] = [],
  originalPrompt = ''
): { selected: PlannedCard[]; totalCost: number } {
  const isBudgetMode = budgetCents !== null && budgetCents > 0;
  const budgetPerSlot = isBudgetMode ? budgetCents / totalSlots : Infinity;
  const darkAesthetic = wantsDarkAesthetic(originalPrompt, constraints.themeKeywords || []);
  const allowRainbow =
    constraints.rarityPreferences?.some((r) => r.toLowerCase() === 'rainbow') ?? false;

  const pool = candidates.filter((c) => {
    // Rainbow treatments read pastel/colorful — clash with dark/batman vibes
    if (darkAesthetic && !allowRainbow && isRainbowTreatment(c.rarity)) return false;
    return true;
  });

  const scored = pool.map(c => {
    let score = 0;

    const themeScore = computeTypeThemeScore(c.types, constraints.themeKeywords || []);
    const vibeScore = computeNameVibeScore(c.cardName, nameHints);
    const rarityScore = computeRarityScore(c.rarity);
    const price = c.marketPrice ? c.marketPrice * 100 : 0;
    const matchesRarityPref =
      !constraints.rarityPreferences?.length ||
      cardMatchesAnyRarity(c.rarity, constraints.rarityPreferences);
    const typesLower = (c.types || '').toLowerCase();

    score += themeScore * 0.25;
    score += vibeScore * 0.35; // name vibe matters more for aesthetic prompts
    score += rarityScore * 0.15;
    if (matchesRarityPref && constraints.rarityPreferences?.length) {
      score += 0.4;
    } else if (constraints.rarityPreferences?.length) {
      score -= 0.35;
    }

    if (darkAesthetic) {
      if (typesLower.includes('darkness')) score += 0.35;
      else if (typesLower.includes('psychic') || typesLower.includes('metal')) score -= 0.1;
      if (isRainbowTreatment(c.rarity)) score -= 1;
    }

    if (isBudgetMode && price > 0) {
      const budgetRatio = budgetPerSlot / price;
      score += Math.min(budgetRatio, 3) * 0.08;
    }

    if (c.imageSmall) score += 0.1;

    return { card: c, score, price, matchesRarityPref };
  });

  // Prefer rarity matches first, then fill remaining slots from the rest
  const sorted = [
    ...scored.filter((s) => s.matchesRarityPref).sort((a, b) => b.score - a.score),
    ...scored.filter((s) => !s.matchesRarityPref).sort((a, b) => b.score - a.score),
  ];

  const selected: PlannedCard[] = [];
  const usedNames = new Set<string>();
  let remainingBudget = isBudgetMode ? budgetCents : Infinity;
  const rules = constraints.compositionRules || [];
  const hasNoDupes = rules.includes('no_duplicate_names');
  const needsTypeMix = rules.includes('mix_of_types');
  const needsAllSameType = rules.includes('all_same_type');
  const needsAtLeast2V = rules.includes('at_least_2_v');
  const usedTypes = new Set<string>();
  let vCount = 0;

  for (const item of sorted) {
    if (selected.length >= totalSlots) break;

    if (hasNoDupes) {
      const baseName = item.card.cardName.replace(/[♂♀★]/g, '').trim().split(' ')[0];
      if (usedNames.has(baseName)) continue;
    }

    if (isBudgetMode && item.price > remainingBudget) continue;

    if (needsAllSameType && selected.length > 0) {
      const firstType = selected[0].types;
      if (item.card.types !== firstType) continue;
    }

    selected.push({
      cardId: item.card.cardId,
      cardName: item.card.cardName,
      setId: item.card.setId,
      setName: item.card.setName,
      cardNumber: item.card.cardNumber,
      rarity: item.card.rarity,
      types: item.card.types,
      imageSmall: item.card.imageSmall,
      imageLarge: item.card.imageLarge,
      marketPrice: item.card.marketPrice,
      score: Math.round(item.score * 100),
    });

    if (hasNoDupes) {
      const baseName = item.card.cardName.replace(/[♂♀★]/g, '').trim().split(' ')[0];
      usedNames.add(baseName);
    }

    if (needsTypeMix && item.card.types) {
      for (const t of item.card.types.split(',').map(x => x.trim())) {
        usedTypes.add(t);
      }
    }

    if (item.card.rarity?.includes('V') || item.card.rarity?.includes('VMAX') || item.card.rarity?.includes('VSTAR')) {
      vCount++;
    }

    if (isBudgetMode) {
      remainingBudget -= item.price;
    }
  }

  if (needsAtLeast2V && vCount < 2 && selected.length < totalSlots) {
    const vCards = sorted.filter(
      s => !selected.find(p => p.cardId === s.card.cardId) &&
        (s.card.rarity?.includes('V') || s.card.rarity?.includes('VMAX') || s.card.rarity?.includes('VSTAR')) &&
        (!isBudgetMode || s.price <= remainingBudget)
    );
    for (const vCard of vCards) {
      if (selected.length >= totalSlots || vCount >= 2) break;
      if (isBudgetMode && vCard.price > remainingBudget) continue;
      selected.push({
        cardId: vCard.card.cardId,
        cardName: vCard.card.cardName,
        setId: vCard.card.setId,
        setName: vCard.card.setName,
        cardNumber: vCard.card.cardNumber,
        rarity: vCard.card.rarity,
        types: vCard.card.types,
        imageSmall: vCard.card.imageSmall,
        imageLarge: vCard.card.imageLarge,
        marketPrice: vCard.card.marketPrice,
        score: Math.round(vCard.score * 100),
      });
      if (isBudgetMode) remainingBudget -= vCard.price;
      vCount++;
    }
  }

  const totalCost = selected.reduce((sum, s) => sum + ((s.marketPrice ?? 0) * 100), 0);

  return { selected, totalCost };
}

function hasExplicitFilter(
  explicit?: Partial<BinderConstraints & { budgetDollars?: number }>
): boolean {
  if (!explicit) return false;
  return Boolean(
    (explicit.pokemonTypes && explicit.pokemonTypes.length > 0) ||
      (explicit.rarityPreferences && explicit.rarityPreferences.length > 0) ||
      explicit.eraBias ||
      (explicit.specificSets && explicit.specificSets.length > 0) ||
      (explicit.excludeSets && explicit.excludeSets.length > 0) ||
      (explicit.themeKeywords && explicit.themeKeywords.length > 0) ||
      (explicit.compositionRules && explicit.compositionRules.length > 0) ||
      explicit.maxSingleCardPrice != null
  );
}

export async function generateBinderPlan(
  db: Database,
  _userId: number,
  userDescription: string,
  explicitConstraints?: Partial<BinderConstraints & { budgetDollars?: number }>
): Promise<BinderPlan> {
  // Always parse the free-text prompt (Groq + fallback heuristics), then let UI chips override.
  const fromPrompt = await translateConstraints(userDescription);
  const constraints: BinderConstraints = { ...fromPrompt };

  if (hasExplicitFilter(explicitConstraints)) {
    if (explicitConstraints!.pokemonTypes?.length) {
      constraints.pokemonTypes = explicitConstraints!.pokemonTypes;
    }
    if (explicitConstraints!.rarityPreferences?.length) {
      constraints.rarityPreferences = explicitConstraints!.rarityPreferences;
    }
    if (explicitConstraints!.eraBias) {
      constraints.eraBias = explicitConstraints!.eraBias;
    }
    if (explicitConstraints!.specificSets?.length) {
      constraints.specificSets = explicitConstraints!.specificSets;
    }
    if (explicitConstraints!.excludeSets?.length) {
      constraints.excludeSets = explicitConstraints!.excludeSets;
    }
    if (explicitConstraints!.themeKeywords?.length) {
      constraints.themeKeywords = explicitConstraints!.themeKeywords;
      // Expand theme chips into types when the user didn't pick types explicitly
      if (!explicitConstraints!.pokemonTypes?.length) {
        const fromThemes = explicitConstraints!.themeKeywords.flatMap(
          (k) => THEME_TYPE_MAP[k.toLowerCase()] || []
        );
        if (fromThemes.length > 0) {
          constraints.pokemonTypes = [...new Set([...(constraints.pokemonTypes || []), ...fromThemes])];
        }
      }
    }
    if (explicitConstraints!.compositionRules?.length) {
      constraints.compositionRules = explicitConstraints!.compositionRules;
    }
    if (explicitConstraints!.maxSingleCardPrice != null) {
      constraints.maxSingleCardPrice = explicitConstraints!.maxSingleCardPrice;
    }
  }

  // Normalize game-type labels (Dark/Electric/Steel) → TCG API types (Darkness/Lightning/Metal)
  if (constraints.pokemonTypes?.length) {
    constraints.pokemonTypes = toTcgTypes(constraints.pokemonTypes);
  }

  // Dark/batman aesthetics: prefer Darkness-first pool (Psychic/Metal as soft fallback later)
  if (wantsDarkAesthetic(userDescription, constraints.themeKeywords || [])) {
    const hasDarkness = (constraints.pokemonTypes || []).includes('Darkness');
    if (hasDarkness) {
      constraints.pokemonTypes = [
        'Darkness',
        ...(constraints.pokemonTypes || []).filter((t) => t !== 'Darkness'),
      ];
    }
  }

  const budgetCents = explicitConstraints?.budgetDollars
    ? Math.round(explicitConstraints.budgetDollars * 100)
    : null;

  const totalSlots = 9;
  const nameHints = vibeHintsFromText(userDescription, constraints.themeKeywords || []);
  const darkAesthetic = wantsDarkAesthetic(userDescription, constraints.themeKeywords || []);

  const priceMap = await getLatestPrices(db);

  // First pass: Darkness-only when dark vibe (avoids random Metal/Psychic fillers)
  const primaryConstraints =
    darkAesthetic && (constraints.pokemonTypes || []).includes('Darkness')
      ? { ...constraints, pokemonTypes: ['Darkness'] }
      : constraints;

  let candidates = await queryCandidateCards(db, primaryConstraints, priceMap, { nameHints });

  if (darkAesthetic) {
    candidates = candidates.filter(
      (c) =>
        (constraints.rarityPreferences || []).some((r) => r.toLowerCase() === 'rainbow') ||
        !isRainbowTreatment(c.rarity)
    );
  }

  const allowRainbow =
    constraints.rarityPreferences?.some((r) => r.toLowerCase() === 'rainbow') ?? false;

  const mergeUnique = (extra: CardCandidate[]) => {
    const existingIds = new Set(candidates.map((c) => c.cardId));
    for (const c of extra) {
      if (darkAesthetic && !allowRainbow && isRainbowTreatment(c.rarity)) continue;
      if (!existingIds.has(c.cardId)) {
        candidates.push(c);
        existingIds.add(c.cardId);
      }
    }
  };

  // If Darkness-only is thin, widen to other dark-theme types (still no rainbow)
  if (candidates.length < totalSlots && darkAesthetic && (constraints.pokemonTypes?.length ?? 0) > 1) {
    mergeUnique(await queryCandidateCards(db, constraints, priceMap, { nameHints }));
  }

  // Progressive relaxation so aesthetic prompts still fill a page
  if (candidates.length < totalSlots && constraints.rarityPreferences?.length) {
    mergeUnique(
      await queryCandidateCards(db, primaryConstraints, priceMap, {
        skipRarity: true,
        nameHints,
      })
    );
  }

  if (candidates.length < totalSlots && constraints.pokemonTypes?.length) {
    mergeUnique(
      await queryCandidateCards(db, constraints, priceMap, {
        skipTypes: true,
        nameHints,
      })
    );
  }

  if (candidates.length < totalSlots) {
    mergeUnique(
      await queryCandidateCards(db, constraints, priceMap, {
        skipTypes: true,
        skipRarity: true,
        nameHints,
      })
    );
  }

  const { selected, totalCost } = selectOptimalCards(
    candidates,
    constraints,
    budgetCents,
    totalSlots,
    nameHints,
    userDescription
  );

  const filledSlots = selected.length;
  const totalCostCents = selected.reduce((sum, s) => sum + ((s.marketPrice ?? 0) * 100), 0);
  const remainingBudget = budgetCents !== null ? Math.max(0, budgetCents - totalCostCents) : 0;

  return {
    slots: selected,
    totalCost: totalCostCents,
    remainingBudget,
    constraints,
    originalPrompt: userDescription,
    filledSlots,
    totalSlots,
  };
}
