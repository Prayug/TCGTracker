"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateConstraints = translateConstraints;
exports.generateBinderPlan = generateBinderPlan;
const dbAsync_1 = require("../utils/dbAsync");
const env_1 = require("../config/env");
const logger_1 = require("../utils/logger");
const pokemonApiClient_1 = require("./pokemonApiClient");
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
/** Pokemon TCG API type names (not video-game types). */
const THEME_TYPE_MAP = {
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
const TCG_TYPE_ALIASES = {
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
const RARITY_API_VALUES = {
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
function rarityApiQuery(preferences) {
    const values = new Set();
    for (const pref of preferences) {
        for (const v of RARITY_API_VALUES[pref.toLowerCase()] || []) {
            values.add(v);
        }
    }
    if (values.size === 0)
        return null;
    return `(${[...values].map((v) => `rarity:"${v}"`).join(' OR ')})`;
}
/** UI rarity chips → substrings that match real catalog/API rarity strings. */
const RARITY_MATCH_PATTERNS = {
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
function wantsDarkAesthetic(prompt, themeKeywords = []) {
    const lower = prompt.toLowerCase();
    if (/batman|gotham|noir|shadowy|edgy|gothic|spooky|dark vibe|dark aesthetic/.test(lower)) {
        return true;
    }
    return themeKeywords.some((k) => DARK_AESTHETIC_THEMES.has(k.toLowerCase()));
}
function isRainbowTreatment(rarity) {
    const r = (rarity || '').toLowerCase();
    return /rainbow|rare rainbow/.test(r);
}
/** Prompt vibes → Pokemon name hints used for scoring (and soft search). */
const VIBE_NAME_HINTS = {
    batman: ['Umbreon', 'Darkrai', 'Zoroark', 'Gengar', 'Absol', 'Honchkrow', 'Yveltal', 'Greninja', 'Hydreigon', 'Murkrow'],
    dark: ['Umbreon', 'Darkrai', 'Zoroark', 'Gengar', 'Absol', 'Yveltal', 'Hydreigon', 'Spiritomb'],
    edgy: ['Gengar', 'Darkrai', 'Absol', 'Hydreigon', 'Houndoom'],
    gothic: ['Gengar', 'Mimikyu', 'Banette', 'Misdreavus', 'Sableye'],
    spooky: ['Gengar', 'Mimikyu', 'Banette', 'Pumpkaboo', 'Dusknoir'],
    cool: ['Greninja', 'Lucario', 'Mewtwo', 'Charizard', 'Umbreon'],
    mystic: ['Mewtwo', 'Gardevoir', 'Lugia', 'Xerneas', 'Necrozma'],
};
function toTcgTypes(types) {
    const out = [];
    for (const t of types) {
        const mapped = TCG_TYPE_ALIASES[t.trim().toLowerCase()] || t.trim();
        if (mapped && !out.includes(mapped))
            out.push(mapped);
    }
    return out;
}
function rarityMatchesPreference(cardRarity, preference) {
    const r = (cardRarity || '').toLowerCase().trim();
    if (!r)
        return false;
    const key = preference.toLowerCase().trim();
    const patterns = RARITY_MATCH_PATTERNS[key] || [key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')];
    return patterns.some((pat) => {
        try {
            return new RegExp(pat, 'i').test(r);
        }
        catch (_a) {
            return r.includes(pat.toLowerCase());
        }
    });
}
function cardMatchesAnyRarity(cardRarity, preferences) {
    return preferences.some((p) => rarityMatchesPreference(cardRarity, p));
}
function vibeHintsFromText(text, themeKeywords = []) {
    const lower = text.toLowerCase();
    const hints = [];
    for (const [vibe, names] of Object.entries(VIBE_NAME_HINTS)) {
        if (lower.includes(vibe) || themeKeywords.some((k) => k.toLowerCase() === vibe)) {
            hints.push(...names);
        }
    }
    return [...new Set(hints)];
}
function buildConstraintsPrompt(userDescription) {
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
async function callGroqApi(prompt) {
    var _a, _b, _c;
    const apiKey = env_1.env.apis.groq;
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
    const text = (_c = (_b = (_a = data === null || data === void 0 ? void 0 : data.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content;
    if (!text || typeof text !== 'string') {
        throw new Error('Groq returned empty or malformed response');
    }
    return text.trim();
}
function cleanJsonResponse(text) {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch)
        return jsonMatch[0];
    return text;
}
async function translateConstraints(userDescription) {
    try {
        const prompt = buildConstraintsPrompt(userDescription);
        const raw = await callGroqApi(prompt);
        const cleaned = cleanJsonResponse(raw);
        const parsed = JSON.parse(cleaned);
        if (parsed.maxSingleCardPrice !== undefined && parsed.maxSingleCardPrice !== null) {
            parsed.maxSingleCardPrice = Math.round(parsed.maxSingleCardPrice * 100);
        }
        return parsed;
    }
    catch (err) {
        logger_1.logger.warn('LLM constraint translation failed, using fallback:', err);
        return inferConstraintsFromText(userDescription);
    }
}
function inferConstraintsFromText(text) {
    var _a;
    const lower = text.toLowerCase();
    const constraints = {};
    // Aesthetic vibes (batman, gothic, etc.) map to dark theme when no explicit theme word.
    if (lower.includes('batman') || lower.includes('gotham') || lower.includes('gothic') || lower.includes('spooky')) {
        constraints.themeKeywords = [...new Set([...(constraints.themeKeywords || []), 'dark'])];
        constraints.pokemonTypes = [...new Set([...(constraints.pokemonTypes || []), ...THEME_TYPE_MAP.dark])];
    }
    const themeMatches = [];
    for (const [theme, types] of Object.entries(THEME_TYPE_MAP)) {
        if (lower.includes(theme)) {
            themeMatches.push(theme);
            if (!constraints.pokemonTypes)
                constraints.pokemonTypes = [];
            constraints.pokemonTypes.push(...types);
        }
    }
    if (themeMatches.length > 0) {
        constraints.themeKeywords = [...new Set([...(constraints.themeKeywords || []), ...themeMatches])];
        constraints.pokemonTypes = toTcgTypes(constraints.pokemonTypes || []);
    }
    else if ((_a = constraints.pokemonTypes) === null || _a === void 0 ? void 0 : _a.length) {
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
    const rarityMap = {
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
    const rarities = [];
    for (const [keyword, rarity] of Object.entries(rarityMap)) {
        if (lower.includes(keyword))
            rarities.push(rarity);
    }
    // Standalone "V" is too noisy — only when phrased as card type.
    if (/\bv[\s-]?cards?\b|\bat least.*\bv\b|\bholo v\b/i.test(lower) && !rarities.includes('V')) {
        rarities.push('V');
    }
    if (rarities.length > 0)
        constraints.rarityPreferences = rarities;
    // Only treat "$X" as a per-card cap when phrased as max/under/per card — not total budget.
    const maxCardMatch = lower.match(/(?:max|under|upto|up to|per card|each)\s*\$?\s*(\d+(?:\.\d+)?)/);
    if (maxCardMatch) {
        constraints.maxSingleCardPrice = Math.round(parseFloat(maxCardMatch[1]) * 100);
    }
    if (lower.includes('modern') || lower.includes('sword') || lower.includes('scarlet')) {
        constraints.eraBias = 'modern';
    }
    else if (lower.includes('classic') || lower.includes('base') || lower.includes('wotc')) {
        constraints.eraBias = 'classic';
    }
    const composition = [];
    if (lower.includes('no duplicate') || lower.includes('no dup'))
        composition.push('no_duplicate_names');
    if (lower.includes('mix'))
        composition.push('mix_of_types');
    if (lower.includes('all same') || lower.includes('single type'))
        composition.push('all_same_type');
    if (lower.includes('evolution'))
        composition.push('single_evolution_line');
    if (rarities.includes('V') && (lower.includes('v') || lower.includes('at least')))
        composition.push('at_least_2_v');
    if (composition.length > 0)
        constraints.compositionRules = composition;
    return constraints;
}
async function getLatestPrices(db) {
    const rows = await (0, dbAsync_1.allDbRows)(db, `SELECT ph.uniqueIdentifier, ph.marketPrice
     FROM price_history ph
     INNER JOIN (
       SELECT uniqueIdentifier, MAX(date) AS maxDate
       FROM price_history
       WHERE marketPrice IS NOT NULL AND marketPrice > 0
       GROUP BY uniqueIdentifier
     ) latest ON ph.uniqueIdentifier = latest.uniqueIdentifier AND ph.date = latest.maxDate`);
    const priceMap = new Map();
    for (const row of rows) {
        priceMap.set(row.uniqueIdentifier, row.marketPrice);
    }
    return priceMap;
}
function computeTypeThemeScore(types, themeKeywords) {
    if (!types || themeKeywords.length === 0)
        return 0.5;
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
function computeNameVibeScore(cardName, nameHints) {
    if (nameHints.length === 0)
        return 0;
    const lower = cardName.toLowerCase();
    for (const hint of nameHints) {
        if (lower.includes(hint.toLowerCase()))
            return 1;
    }
    return 0;
}
function computeRarityScore(rarity) {
    if (!rarity)
        return 0.3;
    const r = rarity.toLowerCase();
    if (/special illustration|hyper rare|mega hyper|shiny ultra|rare rainbow|rare secret/.test(r))
        return 1.0;
    if (/illustration rare|amazing rare/.test(r))
        return 0.9;
    if (/vstar|vmax/.test(r))
        return 0.85;
    if (/ultra rare|rare ultra|double rare/.test(r))
        return 0.8;
    if (/trainer gallery/.test(r))
        return 0.7;
    if (/radiant/.test(r))
        return 0.65;
    if (/holo v$|rare holo v$/.test(r))
        return 0.55;
    if (/rare holo|holo/.test(r))
        return 0.4;
    if (r === 'rare')
        return 0.3;
    if (r === 'uncommon')
        return 0.2;
    if (r === 'common')
        return 0.1;
    return 0.35;
}
async function mapApiCardsToCandidates(db, cards, priceMap) {
    const ids = cards.map((c) => c.id);
    const mappingRows = ids.length === 0
        ? []
        : await (0, dbAsync_1.allDbRows)(db, `SELECT cardId, uniqueIdentifier FROM card_mappings
           WHERE variantKey = 'normal' AND cardId IN (${ids.map(() => '?').join(',')})`, ids);
    const uidByCard = new Map(mappingRows.map((r) => [r.cardId, r.uniqueIdentifier]));
    return cards.map((card) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
        const uid = uidByCard.get(card.id) || '';
        const marketFromMap = uid ? priceMap.get(uid) : undefined;
        const tcgMarket = (_r = (_m = (_h = (_d = (_c = (_b = (_a = card.tcgplayer) === null || _a === void 0 ? void 0 : _a.prices) === null || _b === void 0 ? void 0 : _b.holofoil) === null || _c === void 0 ? void 0 : _c.market) !== null && _d !== void 0 ? _d : (_g = (_f = (_e = card.tcgplayer) === null || _e === void 0 ? void 0 : _e.prices) === null || _f === void 0 ? void 0 : _f.normal) === null || _g === void 0 ? void 0 : _g.market) !== null && _h !== void 0 ? _h : (_l = (_k = (_j = card.tcgplayer) === null || _j === void 0 ? void 0 : _j.prices) === null || _k === void 0 ? void 0 : _k.reverseHolofoil) === null || _l === void 0 ? void 0 : _l.market) !== null && _m !== void 0 ? _m : (_q = (_p = (_o = card.tcgplayer) === null || _o === void 0 ? void 0 : _o.prices) === null || _p === void 0 ? void 0 : _p['1stEditionHolofoil']) === null || _q === void 0 ? void 0 : _q.market) !== null && _r !== void 0 ? _r : null;
        return {
            cardId: card.id,
            cardName: card.name,
            setId: card.set.id,
            setName: card.set.name,
            cardNumber: card.number,
            rarity: card.rarity || '',
            types: (card.types || []).join(', '),
            imageSmall: ((_s = card.images) === null || _s === void 0 ? void 0 : _s.small) || null,
            imageLarge: ((_t = card.images) === null || _t === void 0 ? void 0 : _t.large) || null,
            marketPrice: marketFromMap !== null && marketFromMap !== void 0 ? marketFromMap : tcgMarket,
            uniqueIdentifier: uid,
        };
    });
}
function applyPriceFilter(candidates, constraints) {
    return candidates.filter((c) => {
        if (c.marketPrice == null || c.marketPrice <= 0)
            return false;
        if (constraints.maxSingleCardPrice &&
            c.marketPrice > constraints.maxSingleCardPrice / 100) {
            return false;
        }
        return true;
    });
}
async function queryCandidateCards(db, constraints, priceMap, options = {}) {
    var _a, _b, _c, _d, _e;
    const elementalTypes = options.skipTypes
        ? []
        : toTcgTypes((_b = (_a = constraints.pokemonTypes) === null || _a === void 0 ? void 0 : _a.filter(Boolean)) !== null && _b !== void 0 ? _b : []);
    const rarityPrefs = options.skipRarity || !((_c = constraints.rarityPreferences) === null || _c === void 0 ? void 0 : _c.length)
        ? []
        : constraints.rarityPreferences;
    // Prefer live API when we have elemental types or vibe name hints (catalog types are subtypes).
    const shouldUseApi = elementalTypes.length > 0 || ((_e = (_d = options.nameHints) === null || _d === void 0 ? void 0 : _d.length) !== null && _e !== void 0 ? _e : 0) > 0;
    if (shouldUseApi) {
        try {
            const queryParts = [];
            if (elementalTypes.length > 0) {
                queryParts.push(`(${elementalTypes.map((t) => `types:${t}`).join(' OR ')})`);
            }
            if (rarityPrefs.length > 0) {
                const rq = rarityApiQuery(rarityPrefs);
                if (rq)
                    queryParts.push(rq);
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
                const bulk = await pokemonApiClient_1.pokemonApiClient.searchCardsBulk({
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
                if (priced.length > 0)
                    return priced;
                // Fall through to catalog if API pool was empty after filters
            }
        }
        catch (err) {
            logger_1.logger.warn('Elemental type API candidate fetch failed, falling back to catalog:', err);
        }
    }
    const conditions = ['cc.cardId IS NOT NULL'];
    const params = [];
    // Catalog types are usually subtypes — only filter when data looks elemental.
    const sample = await (0, dbAsync_1.allDbRows)(db, `SELECT types FROM catalog_cards WHERE types IS NOT NULL AND TRIM(types) != '' LIMIT 20`);
    const catalogHasElementalTypes = sample.some((row) => /Fire|Water|Grass|Lightning|Electric|Psychic|Fighting|Darkness|Dark|Fairy|Dragon|Metal/i.test(row.types || ''));
    if (catalogHasElementalTypes && elementalTypes.length > 0) {
        const typeConditions = elementalTypes.map(() => 'cc.types LIKE ?');
        conditions.push(`(${typeConditions.join(' OR ')})`);
        for (const t of elementalTypes) {
            params.push(`%${t}%`);
        }
    }
    if (rarityPrefs.length > 0) {
        // Expand UI rarities into real rarity LIKE patterns
        const likePatterns = [];
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
        for (const s of constraints.specificSets)
            params.push(s);
    }
    if (constraints.excludeSets && constraints.excludeSets.length > 0) {
        const exclConds = constraints.excludeSets.map(() => 'cc.setId != ?');
        conditions.push(...exclConds);
        for (const s of constraints.excludeSets)
            params.push(s);
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
    const rows = await (0, dbAsync_1.allDbRows)(db, sql, params);
    return rows
        .filter((candidate) => {
        const price = priceMap.get(candidate.uniqueIdentifier);
        if (price === undefined || price <= 0)
            return false;
        if (constraints.maxSingleCardPrice && price > constraints.maxSingleCardPrice / 100)
            return false;
        // Post-filter with precise rarity matchers (SQL LIKE is looser)
        if (rarityPrefs.length > 0 && !cardMatchesAnyRarity(candidate.rarity || '', rarityPrefs)) {
            return false;
        }
        return true;
    })
        .map((c) => {
        var _a;
        return ({
            ...c,
            marketPrice: (_a = priceMap.get(c.uniqueIdentifier)) !== null && _a !== void 0 ? _a : null,
        });
    });
}
function selectOptimalCards(candidates, constraints, budgetCents, totalSlots, nameHints = [], originalPrompt = '') {
    var _a, _b, _c, _d, _e;
    const isBudgetMode = budgetCents !== null && budgetCents > 0;
    const budgetPerSlot = isBudgetMode ? budgetCents / totalSlots : Infinity;
    const darkAesthetic = wantsDarkAesthetic(originalPrompt, constraints.themeKeywords || []);
    const allowRainbow = (_b = (_a = constraints.rarityPreferences) === null || _a === void 0 ? void 0 : _a.some((r) => r.toLowerCase() === 'rainbow')) !== null && _b !== void 0 ? _b : false;
    const pool = candidates.filter((c) => {
        // Rainbow treatments read pastel/colorful — clash with dark/batman vibes
        if (darkAesthetic && !allowRainbow && isRainbowTreatment(c.rarity))
            return false;
        return true;
    });
    const scored = pool.map(c => {
        var _a, _b, _c;
        let score = 0;
        const themeScore = computeTypeThemeScore(c.types, constraints.themeKeywords || []);
        const vibeScore = computeNameVibeScore(c.cardName, nameHints);
        const rarityScore = computeRarityScore(c.rarity);
        const price = c.marketPrice ? c.marketPrice * 100 : 0;
        const matchesRarityPref = !((_a = constraints.rarityPreferences) === null || _a === void 0 ? void 0 : _a.length) ||
            cardMatchesAnyRarity(c.rarity, constraints.rarityPreferences);
        const typesLower = (c.types || '').toLowerCase();
        score += themeScore * 0.25;
        score += vibeScore * 0.35; // name vibe matters more for aesthetic prompts
        score += rarityScore * 0.15;
        if (matchesRarityPref && ((_b = constraints.rarityPreferences) === null || _b === void 0 ? void 0 : _b.length)) {
            score += 0.4;
        }
        else if ((_c = constraints.rarityPreferences) === null || _c === void 0 ? void 0 : _c.length) {
            score -= 0.35;
        }
        if (darkAesthetic) {
            if (typesLower.includes('darkness'))
                score += 0.35;
            else if (typesLower.includes('psychic') || typesLower.includes('metal'))
                score -= 0.1;
            if (isRainbowTreatment(c.rarity))
                score -= 1;
        }
        if (isBudgetMode && price > 0) {
            const budgetRatio = budgetPerSlot / price;
            score += Math.min(budgetRatio, 3) * 0.08;
        }
        if (c.imageSmall)
            score += 0.1;
        return { card: c, score, price, matchesRarityPref };
    });
    // Prefer rarity matches first, then fill remaining slots from the rest
    const sorted = [
        ...scored.filter((s) => s.matchesRarityPref).sort((a, b) => b.score - a.score),
        ...scored.filter((s) => !s.matchesRarityPref).sort((a, b) => b.score - a.score),
    ];
    const selected = [];
    const usedNames = new Set();
    let remainingBudget = isBudgetMode ? budgetCents : Infinity;
    const rules = constraints.compositionRules || [];
    const hasNoDupes = rules.includes('no_duplicate_names');
    const needsTypeMix = rules.includes('mix_of_types');
    const needsAllSameType = rules.includes('all_same_type');
    const needsAtLeast2V = rules.includes('at_least_2_v');
    const usedTypes = new Set();
    let vCount = 0;
    for (const item of sorted) {
        if (selected.length >= totalSlots)
            break;
        if (hasNoDupes) {
            const baseName = item.card.cardName.replace(/[♂♀★]/g, '').trim().split(' ')[0];
            if (usedNames.has(baseName))
                continue;
        }
        if (isBudgetMode && item.price > remainingBudget)
            continue;
        if (needsAllSameType && selected.length > 0) {
            const firstType = selected[0].types;
            if (item.card.types !== firstType)
                continue;
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
        if (((_c = item.card.rarity) === null || _c === void 0 ? void 0 : _c.includes('V')) || ((_d = item.card.rarity) === null || _d === void 0 ? void 0 : _d.includes('VMAX')) || ((_e = item.card.rarity) === null || _e === void 0 ? void 0 : _e.includes('VSTAR'))) {
            vCount++;
        }
        if (isBudgetMode) {
            remainingBudget -= item.price;
        }
    }
    if (needsAtLeast2V && vCount < 2 && selected.length < totalSlots) {
        const vCards = sorted.filter(s => {
            var _a, _b, _c;
            return !selected.find(p => p.cardId === s.card.cardId) &&
                (((_a = s.card.rarity) === null || _a === void 0 ? void 0 : _a.includes('V')) || ((_b = s.card.rarity) === null || _b === void 0 ? void 0 : _b.includes('VMAX')) || ((_c = s.card.rarity) === null || _c === void 0 ? void 0 : _c.includes('VSTAR'))) &&
                (!isBudgetMode || s.price <= remainingBudget);
        });
        for (const vCard of vCards) {
            if (selected.length >= totalSlots || vCount >= 2)
                break;
            if (isBudgetMode && vCard.price > remainingBudget)
                continue;
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
            if (isBudgetMode)
                remainingBudget -= vCard.price;
            vCount++;
        }
    }
    const totalCost = selected.reduce((sum, s) => { var _a; return sum + (((_a = s.marketPrice) !== null && _a !== void 0 ? _a : 0) * 100); }, 0);
    return { selected, totalCost };
}
function hasExplicitFilter(explicit) {
    if (!explicit)
        return false;
    return Boolean((explicit.pokemonTypes && explicit.pokemonTypes.length > 0) ||
        (explicit.rarityPreferences && explicit.rarityPreferences.length > 0) ||
        explicit.eraBias ||
        (explicit.specificSets && explicit.specificSets.length > 0) ||
        (explicit.excludeSets && explicit.excludeSets.length > 0) ||
        (explicit.themeKeywords && explicit.themeKeywords.length > 0) ||
        (explicit.compositionRules && explicit.compositionRules.length > 0) ||
        explicit.maxSingleCardPrice != null);
}
async function generateBinderPlan(db, _userId, userDescription, explicitConstraints) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    // Always parse the free-text prompt (Groq + fallback heuristics), then let UI chips override.
    const fromPrompt = await translateConstraints(userDescription);
    const constraints = { ...fromPrompt };
    if (hasExplicitFilter(explicitConstraints)) {
        if ((_a = explicitConstraints.pokemonTypes) === null || _a === void 0 ? void 0 : _a.length) {
            constraints.pokemonTypes = explicitConstraints.pokemonTypes;
        }
        if ((_b = explicitConstraints.rarityPreferences) === null || _b === void 0 ? void 0 : _b.length) {
            constraints.rarityPreferences = explicitConstraints.rarityPreferences;
        }
        if (explicitConstraints.eraBias) {
            constraints.eraBias = explicitConstraints.eraBias;
        }
        if ((_c = explicitConstraints.specificSets) === null || _c === void 0 ? void 0 : _c.length) {
            constraints.specificSets = explicitConstraints.specificSets;
        }
        if ((_d = explicitConstraints.excludeSets) === null || _d === void 0 ? void 0 : _d.length) {
            constraints.excludeSets = explicitConstraints.excludeSets;
        }
        if ((_e = explicitConstraints.themeKeywords) === null || _e === void 0 ? void 0 : _e.length) {
            constraints.themeKeywords = explicitConstraints.themeKeywords;
            // Expand theme chips into types when the user didn't pick types explicitly
            if (!((_f = explicitConstraints.pokemonTypes) === null || _f === void 0 ? void 0 : _f.length)) {
                const fromThemes = explicitConstraints.themeKeywords.flatMap((k) => THEME_TYPE_MAP[k.toLowerCase()] || []);
                if (fromThemes.length > 0) {
                    constraints.pokemonTypes = [...new Set([...(constraints.pokemonTypes || []), ...fromThemes])];
                }
            }
        }
        if ((_g = explicitConstraints.compositionRules) === null || _g === void 0 ? void 0 : _g.length) {
            constraints.compositionRules = explicitConstraints.compositionRules;
        }
        if (explicitConstraints.maxSingleCardPrice != null) {
            constraints.maxSingleCardPrice = explicitConstraints.maxSingleCardPrice;
        }
    }
    // Normalize game-type labels (Dark/Electric/Steel) → TCG API types (Darkness/Lightning/Metal)
    if ((_h = constraints.pokemonTypes) === null || _h === void 0 ? void 0 : _h.length) {
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
    const budgetCents = (explicitConstraints === null || explicitConstraints === void 0 ? void 0 : explicitConstraints.budgetDollars)
        ? Math.round(explicitConstraints.budgetDollars * 100)
        : null;
    const totalSlots = 9;
    const nameHints = vibeHintsFromText(userDescription, constraints.themeKeywords || []);
    const darkAesthetic = wantsDarkAesthetic(userDescription, constraints.themeKeywords || []);
    const priceMap = await getLatestPrices(db);
    // First pass: Darkness-only when dark vibe (avoids random Metal/Psychic fillers)
    const primaryConstraints = darkAesthetic && (constraints.pokemonTypes || []).includes('Darkness')
        ? { ...constraints, pokemonTypes: ['Darkness'] }
        : constraints;
    let candidates = await queryCandidateCards(db, primaryConstraints, priceMap, { nameHints });
    if (darkAesthetic) {
        candidates = candidates.filter((c) => (constraints.rarityPreferences || []).some((r) => r.toLowerCase() === 'rainbow') ||
            !isRainbowTreatment(c.rarity));
    }
    const allowRainbow = (_k = (_j = constraints.rarityPreferences) === null || _j === void 0 ? void 0 : _j.some((r) => r.toLowerCase() === 'rainbow')) !== null && _k !== void 0 ? _k : false;
    const mergeUnique = (extra) => {
        const existingIds = new Set(candidates.map((c) => c.cardId));
        for (const c of extra) {
            if (darkAesthetic && !allowRainbow && isRainbowTreatment(c.rarity))
                continue;
            if (!existingIds.has(c.cardId)) {
                candidates.push(c);
                existingIds.add(c.cardId);
            }
        }
    };
    // If Darkness-only is thin, widen to other dark-theme types (still no rainbow)
    if (candidates.length < totalSlots && darkAesthetic && ((_m = (_l = constraints.pokemonTypes) === null || _l === void 0 ? void 0 : _l.length) !== null && _m !== void 0 ? _m : 0) > 1) {
        mergeUnique(await queryCandidateCards(db, constraints, priceMap, { nameHints }));
    }
    // Progressive relaxation so aesthetic prompts still fill a page
    if (candidates.length < totalSlots && ((_o = constraints.rarityPreferences) === null || _o === void 0 ? void 0 : _o.length)) {
        mergeUnique(await queryCandidateCards(db, primaryConstraints, priceMap, {
            skipRarity: true,
            nameHints,
        }));
    }
    if (candidates.length < totalSlots && ((_p = constraints.pokemonTypes) === null || _p === void 0 ? void 0 : _p.length)) {
        mergeUnique(await queryCandidateCards(db, constraints, priceMap, {
            skipTypes: true,
            nameHints,
        }));
    }
    if (candidates.length < totalSlots) {
        mergeUnique(await queryCandidateCards(db, constraints, priceMap, {
            skipTypes: true,
            skipRarity: true,
            nameHints,
        }));
    }
    const { selected, totalCost } = selectOptimalCards(candidates, constraints, budgetCents, totalSlots, nameHints, userDescription);
    const filledSlots = selected.length;
    const totalCostCents = selected.reduce((sum, s) => { var _a; return sum + (((_a = s.marketPrice) !== null && _a !== void 0 ? _a : 0) * 100); }, 0);
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
