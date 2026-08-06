import { logger } from '../../utils/logger';

const TCGCSV_BASE = 'https://tcgcsv.com/tcgplayer';
const ONE_PIECE_CATEGORY = 68;
const CACHE_TTL_MS = 60 * 60 * 1000;

interface TcgcsvGroup {
  groupId: number;
  name: string;
  abbreviation?: string;
}

interface TcgcsvProduct {
  productId: number;
  name: string;
  extendedData?: Array<{ name: string; value: string }>;
}

interface TcgcsvPrice {
  productId: number;
  marketPrice: number | null;
  lowPrice: number | null;
  midPrice: number | null;
  subTypeName: string;
}

export interface TcgPlayerListing {
  productId: number;
  name: string;
  cardNumber: string;
  marketPrice: number | null;
  lowPrice: number | null;
}

interface GroupCacheEntry {
  fetchedAt: number;
  byNumber: Map<string, TcgPlayerListing[]>;
}

let setGroupMap: Map<string, number> | null = null;
let setGroupMapFetchedAt = 0;
const groupCache = new Map<number, GroupCacheEntry>();

async function fetchTcgcsv<T>(path: string): Promise<T> {
  const response = await fetch(`${TCGCSV_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'TCGTracker/1.0 (+https://github.com/tcgtracker)',
    },
  });
  if (!response.ok) {
    throw new Error(`TCGCSV ${response.status}: ${response.statusText}`);
  }
  const payload = (await response.json()) as { results?: T };
  return (payload.results ?? payload) as T;
}

function getProductNumber(product: TcgcsvProduct): string {
  const numberField = product.extendedData?.find((field) => field.name === 'Number');
  return numberField?.value?.trim() ?? '';
}

function pickBestPrice(prices: TcgcsvPrice[]): { marketPrice: number | null; lowPrice: number | null } {
  if (!prices.length) return { marketPrice: null, lowPrice: null };

  const ranked = [...prices].sort((a, b) => {
    const aMarket = a.marketPrice ?? 0;
    const bMarket = b.marketPrice ?? 0;
    if (bMarket !== aMarket) return bMarket - aMarket;
    return (b.lowPrice ?? 0) - (a.lowPrice ?? 0);
  });

  const best = ranked.find((p) => (p.marketPrice ?? 0) > 0) ?? ranked[0];
  return { marketPrice: best.marketPrice, lowPrice: best.lowPrice };
}

async function loadSetGroupMap(forceRefresh = false): Promise<Map<string, number>> {
  if (!forceRefresh && setGroupMap && Date.now() - setGroupMapFetchedAt < CACHE_TTL_MS) {
    return setGroupMap;
  }

  const groups = await fetchTcgcsv<TcgcsvGroup[]>(`/${ONE_PIECE_CATEGORY}/groups`);
  const map = new Map<string, number>();

  for (const group of groups) {
    const abbr = group.abbreviation?.trim();
    if (!abbr) continue;

    const opMatch = abbr.match(/^OP(\d+)$/i);
    if (opMatch) {
      map.set(`OP-${parseInt(opMatch[1], 10).toString().padStart(2, '0')}`, group.groupId);
      continue;
    }

    if (/^ST-\d+$/i.test(abbr)) {
      map.set(abbr.toUpperCase(), group.groupId);
    }
  }

  setGroupMap = map;
  setGroupMapFetchedAt = Date.now();
  return map;
}

async function loadGroupListings(groupId: number, forceRefresh = false): Promise<Map<string, TcgPlayerListing[]>> {
  const cached = groupCache.get(groupId);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.byNumber;
  }

  const [products, prices] = await Promise.all([
    fetchTcgcsv<TcgcsvProduct[]>(`/${ONE_PIECE_CATEGORY}/${groupId}/products`),
    fetchTcgcsv<TcgcsvPrice[]>(`/${ONE_PIECE_CATEGORY}/${groupId}/prices`),
  ]);

  const pricesByProduct = new Map<number, TcgcsvPrice[]>();
  for (const price of prices) {
    const bucket = pricesByProduct.get(price.productId) ?? [];
    bucket.push(price);
    pricesByProduct.set(price.productId, bucket);
  }

  const byNumber = new Map<string, TcgPlayerListing[]>();
  for (const product of products) {
    const cardNumber = getProductNumber(product);
    if (!cardNumber) continue;

    const { marketPrice, lowPrice } = pickBestPrice(pricesByProduct.get(product.productId) ?? []);
    const listing: TcgPlayerListing = {
      productId: product.productId,
      name: product.name,
      cardNumber,
      marketPrice,
      lowPrice,
    };

    const bucket = byNumber.get(cardNumber) ?? [];
    bucket.push(listing);
    byNumber.set(cardNumber, bucket);
  }

  groupCache.set(groupId, { fetchedAt: Date.now(), byNumber });
  return byNumber;
}

function extractVariantLabel(name: string): string | null {
  const match = name.match(/\(([^)]+)\)\s*$/);
  return match ? match[1].trim().toUpperCase() : null;
}

/** Normalize verbose OPTCG / TCGPlayer variant strings for comparison. */
function normalizeVariantKey(variant: string | null): string | null {
  if (!variant) return null;
  const v = variant.toUpperCase().replace(/\s+/g, ' ').trim();
  if (v.includes('RED SUPER')) return 'RED_SUPER_ALT';
  if (v.includes('SUPER ALTERNATE') || v === 'MANGA') return 'SUPER_ALT';
  if (v.includes('WANTED POSTER')) return 'WANTED';
  if (v.includes('ALTERNATE ART') || v === 'PARALLEL' || v === 'BOX TOPPER') return 'PARALLEL';
  if (v === 'SP' || v.endsWith(' SP')) return 'SP';
  if (v === 'TR' || v.includes('TREASURE')) return 'TR';
  return v;
}

const VARIANT_EQUIVALENTS: Record<string, Set<string>> = {
  SP: new Set(['SP']),
  TR: new Set(['TR']),
  PARALLEL: new Set(['PARALLEL']),
  SUPER_ALT: new Set(['SUPER_ALT', 'MANGA']),
  RED_SUPER_ALT: new Set(['RED_SUPER_ALT']),
  WANTED: new Set(['WANTED']),
};

function variantsEquivalent(a: string | null, b: string | null): boolean {
  const na = normalizeVariantKey(a);
  const nb = normalizeVariantKey(b);
  if (!na && !nb) return true;
  if (!na || !nb) return false;
  if (na === nb) return true;
  return VARIANT_EQUIVALENTS[na]?.has(nb) ?? false;
}

function variantsConflict(a: string | null, b: string | null): boolean {
  const na = normalizeVariantKey(a);
  const nb = normalizeVariantKey(b);
  if (!na || !nb) return false;
  return !variantsEquivalent(na, nb);
}

/** Minimum score to accept a TCGPlayer listing; below this we fall back to OPTCG. */
export const MIN_TCG_LISTING_SCORE = 10;

function scoreListingMatch(
  listing: TcgPlayerListing,
  cardName: string,
  cardImageId: string
): number {
  const cardVariant = extractVariantLabel(cardName);
  const listingVariant = extractVariantLabel(listing.name);
  const cardLower = cardName.toLowerCase();
  const listingLower = listing.name.toLowerCase();

  let score = 0;

  // Hard reject: "Sabo (SP)" must never match "Sabo (Red Super Alternate Art)".
  if (variantsConflict(cardVariant, listingVariant)) {
    return -100;
  }

  if (variantsEquivalent(cardVariant, listingVariant)) score += 40;
  if (cardLower.includes('red super') && listingLower.includes('red super')) score += 30;
  // Don't let "Red Super Alternate Art" also score as plain Super Alternate Art.
  if (
    cardLower.includes('super alternate') &&
    listingLower.includes('super alternate') &&
    !cardLower.includes('red super') &&
    !listingLower.includes('red super')
  ) {
    score += 25;
  }
  if (cardLower.includes('wanted poster') && listingLower.includes('wanted poster')) score += 25;
  if (cardLower.includes('parallel') && listingLower.includes('parallel')) score += 15;
  if (cardLower.includes('reprint') && listingLower.includes('reprint')) score += 15;
  if (cardImageId.includes('_p1') && listingLower.includes('parallel')) score += 10;
  if (cardImageId.includes('_p2') && (listingLower.includes('super alternate') || listingLower.includes('manga'))) {
    score += 15;
  }
  if (cardImageId.includes('_p3') && listingLower.includes('red super')) score += 20;
  if (cardImageId.includes('_p4') && listingLower.includes('wanted')) score += 15;
  if (cardImageId.includes('_r') && listingLower.includes('reprint')) score += 10;
  if (!cardVariant && !listingVariant && !cardImageId.match(/_[pr]\d/i)) score += 15;

  return score;
}

/** Exported for unit tests — prefers exact variant match, rejects conflicts. */
export function pickBestListing(
  listings: TcgPlayerListing[],
  cardName: string,
  cardImageId: string
): TcgPlayerListing | null {
  if (!listings.length) return null;

  const ranked = [...listings].sort((a, b) => {
    const scoreDiff = scoreListingMatch(b, cardName, cardImageId) - scoreListingMatch(a, cardName, cardImageId);
    if (scoreDiff !== 0) return scoreDiff;
    // Prefer closer (not higher) prices when scores tie — never jackpot on mismatch.
    return (a.marketPrice ?? 0) - (b.marketPrice ?? 0);
  });

  const best = ranked[0];
  if (!best) return null;
  if (scoreListingMatch(best, cardName, cardImageId) < MIN_TCG_LISTING_SCORE) {
    return null;
  }
  return best;
}

export async function findTcgPlayerListing(input: {
  setId: string;
  cardSetId: string;
  cardName: string;
  cardImageId: string;
}): Promise<TcgPlayerListing | null> {
  try {
    const groupMap = await loadSetGroupMap();
    const groupId = groupMap.get(input.setId);
    if (!groupId) return null;

    const listingsByNumber = await loadGroupListings(groupId);
    const candidates = listingsByNumber.get(input.cardSetId);
    if (!candidates?.length) return null;

    return pickBestListing(candidates, input.cardName, input.cardImageId);
  } catch (error) {
    logger.warn('One Piece TCGPlayer lookup failed', {
      setId: input.setId,
      cardSetId: input.cardSetId,
      error: (error as Error).message,
    });
    return null;
  }
}

export function clearOnePieceTcgPlayerCache(): void {
  setGroupMap = null;
  setGroupMapFetchedAt = 0;
  groupCache.clear();
}
