export interface PokemonSetRef {
  id: string;
  name: string;
  series?: string;
  ptcgoCode?: string;
}

const GENERIC_FOLD_NAMES = new Set([
  'base',
  'promo',
  'promos',
  'promocards',
  'cards',
  'set',
  'ex',
  'gx',
  'v',
  'vmax',
  'and',
]);

/** Strip era codes from PriceCharting slugs: sv05temporalforces → temporalforces. */
const ERA_PREFIX_RE = /^(swsh|hgss|ecard|sv|sm|xy|bw|dp|ex|pl|me|neo|gym)(\d{0,2})/;

const ERA_BASE_SET_ID: Record<string, string> = {
  sm: 'sm1',
  xy: 'xy1',
  swsh: 'swsh1',
  sv: 'sv1',
  bw: 'bw1',
  dp: 'dp1',
  ex: 'ex1',
  hgss: 'hgss1',
  me: 'me1',
  neo: 'neo1',
  gym: 'gym1',
  ecard: 'ecard1',
  pl: 'pl1',
};

/** Promo queries → official Black Star / McDonald's set ids, longest token list first. */
const PROMO_TOKEN_TARGETS: Array<{ tokens: string[]; id: string }> = [
  { tokens: ['mcdonalds', '2011'], id: 'mcd11' },
  { tokens: ['mcdonalds', '2012'], id: 'mcd12' },
  { tokens: ['mcdonalds', '2014'], id: 'mcd14' },
  { tokens: ['mcdonalds', '2015'], id: 'mcd15' },
  { tokens: ['mcdonalds', '2016'], id: 'mcd16' },
  { tokens: ['mcdonalds', '2017'], id: 'mcd17' },
  { tokens: ['mcdonalds', '2018'], id: 'mcd18' },
  { tokens: ['mcdonalds', '2019'], id: 'mcd19' },
  { tokens: ['mcdonalds', '2021'], id: 'mcd21' },
  { tokens: ['mcdonalds', '2022'], id: 'mcd22' },
  { tokens: ['mcdonalds', '25'], id: 'mcd21' },
  { tokens: ['scarletviolet'], id: 'svp' },
  { tokens: ['swordshield'], id: 'swshp' },
  { tokens: ['sunmoon'], id: 'smp' },
  { tokens: ['blackandwhite'], id: 'bwp' },
  { tokens: ['blackwhite'], id: 'bwp' },
  { tokens: ['diamondandpearl'], id: 'dpp' },
  { tokens: ['diamondpearl'], id: 'dpp' },
  { tokens: ['heartgold'], id: 'hsp' },
  { tokens: ['nintendo'], id: 'np' },
  { tokens: ['wizards'], id: 'basep' },
  { tokens: ['wotc'], id: 'basep' },
  { tokens: ['hgss'], id: 'hsp' },
  { tokens: ['swsh'], id: 'swshp' },
  { tokens: ['xy'], id: 'xyp' },
];

const PROMO_ERA_PREFIX: Array<{ prefix: string; id: string }> = [
  { prefix: 'swsh', id: 'swshp' },
  { prefix: 'hgss', id: 'hsp' },
  { prefix: 'sv', id: 'svp' },
  { prefix: 'sm', id: 'smp' },
  { prefix: 'xy', id: 'xyp' },
  { prefix: 'bw', id: 'bwp' },
  { prefix: 'dp', id: 'dpp' },
];

export function foldSetToken(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}

/** Same fold with "and" removed so "Black & White" matches "blackandwhite" and "blackwhite". */
export function foldSetTokenCompact(value: string): string {
  return foldSetToken(value).replace(/and/g, '');
}

function catalogIdLookup(catalogSetIds: Iterable<string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const id of catalogSetIds) {
    if (!id) continue;
    const key = id.toLowerCase();
    if (!map.has(key)) map.set(key, id);
  }
  return map;
}

function stripEraPrefix(slug: string): { era: string | null; rest: string } {
  const match = slug.match(ERA_PREFIX_RE);
  if (!match) return { era: null, rest: slug };
  const rest = slug.slice(match[0].length);
  if (!rest) return { era: null, rest: slug };
  return { era: match[1], rest };
}

function looksLikePromo(slug: string, nameFold: string): boolean {
  return /promo/.test(slug) || /promo/.test(nameFold);
}

function pickKnownId(id: string | undefined, knownIds: Set<string>): string | null {
  if (!id) return null;
  if (knownIds.has(id)) return id;
  const lower = id.toLowerCase();
  for (const known of knownIds) {
    if (known.toLowerCase() === lower) return known;
  }
  return null;
}

function resolvePromoSetId(slug: string, nameFold: string, knownIds: Set<string>): string | null {
  const hay = `${slug}${nameFold}`;
  for (const { tokens, id } of PROMO_TOKEN_TARGETS) {
    if (tokens.every((token) => hay.includes(token))) {
      const hit = pickKnownId(id, knownIds);
      if (hit) return hit;
    }
  }
  for (const { prefix, id } of PROMO_ERA_PREFIX) {
    if (slug.startsWith(prefix) || nameFold.startsWith(prefix)) {
      const hit = pickKnownId(id, knownIds);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Map a PriceCharting / TCGCSV / JP catalog set id onto a Pokemon TCG API set id
 * (sv5, pgo, sm7, …) or a native catalog id (S12a, M2a). Never uses short
 * substring matches — those mapped Celestial Storm onto Celebrations.
 */
export function resolveCatalogSetId(
  setId: string,
  setName: string | undefined,
  apiSets: PokemonSetRef[],
  catalogSetIds: Iterable<string> = []
): string | null {
  if (!setId) return null;

  const catalogByLower = catalogIdLookup(catalogSetIds);
  const catalogHit = catalogByLower.get(setId.toLowerCase());
  if (catalogHit) return catalogHit;

  return resolvePokemonApiSetId(setId, setName, apiSets);
}

export function resolvePokemonApiSetId(
  setId: string,
  setName: string | undefined,
  apiSets: PokemonSetRef[]
): string | null {
  if (!setId || apiSets.length === 0) return null;

  const knownIds = new Set(apiSets.map((set) => set.id));
  const exactFold = new Map<string, string>();
  const suffixNames: Array<{ fold: string; id: string }> = [];

  const addExact = (key: string, id: string) => {
    if (!key || GENERIC_FOLD_NAMES.has(key)) return;
    if (!exactFold.has(key)) exactFold.set(key, id);
  };

  for (const set of apiSets) {
    const foldId = foldSetToken(set.id);
    const foldName = foldSetToken(set.name);
    const foldCompact = foldSetTokenCompact(set.name);
    addExact(foldId, set.id);
    addExact(foldName, set.id);
    addExact(foldCompact, set.id);
    if (set.series) {
      addExact(foldSetToken(set.series + set.name), set.id);
      addExact(foldSetTokenCompact(set.series + set.name), set.id);
    }
    if (set.ptcgoCode) {
      const code = foldSetToken(set.ptcgoCode);
      if (code.length >= 3) addExact(code, set.id);
    }
    if (foldName.length >= 6 && !GENERIC_FOLD_NAMES.has(foldName)) {
      suffixNames.push({ fold: foldName, id: set.id });
    }
    if (foldCompact.length >= 6 && foldCompact !== foldName && !GENERIC_FOLD_NAMES.has(foldCompact)) {
      suffixNames.push({ fold: foldCompact, id: set.id });
    }
  }

  suffixNames.sort((a, b) => b.fold.length - a.fold.length);

  const slug = foldSetToken(setId);
  const slugCompact = foldSetTokenCompact(setId);
  const nameFold = setName ? foldSetToken(setName) : '';
  const nameCompact = setName ? foldSetTokenCompact(setName) : '';

  const exactKeys = [slug, slugCompact, nameFold, nameCompact].filter(Boolean);
  for (const key of exactKeys) {
    const hit = exactFold.get(key);
    if (hit) return hit;
  }

  if (looksLikePromo(slug, nameFold)) {
    const promo = resolvePromoSetId(slug, nameFold, knownIds);
    if (promo) return promo;
  }

  const { era, rest } = stripEraPrefix(slug);
  if (rest && rest !== slug) {
    const restHit = exactFold.get(rest) || exactFold.get(rest.replace(/and/g, ''));
    if (restHit) return restHit;
  }

  for (const { fold, id } of suffixNames) {
    if (slug.endsWith(fold) || slugCompact.endsWith(fold) || nameFold.endsWith(fold) || nameCompact.endsWith(fold)) {
      return id;
    }
    if (rest && rest !== slug && (rest.endsWith(fold) || rest.replace(/and/g, '').endsWith(fold))) {
      return id;
    }
  }

  const baseRest = rest || slug;
  if (/baseset/.test(baseRest) || /baseset/.test(nameFold)) {
    if (era && ERA_BASE_SET_ID[era]) {
      const hit = pickKnownId(ERA_BASE_SET_ID[era], knownIds);
      if (hit) return hit;
    }
    if (!era && (/^baseset\d*$/.test(slug) || slug.includes('shadowless'))) {
      const hit = pickKnownId(slug === 'baseset2' ? 'base4' : 'base1', knownIds);
      if (hit) return hit;
    }
  }

  return null;
}
