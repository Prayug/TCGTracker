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

const VARIANT_EQUIVALENTS: Record<string, Set<string>> = {
  SP: new Set(['SP', 'TR']),
  TR: new Set(['TR', 'SP']),
};

function variantsEquivalent(a: string | null, b: string | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a === b) return true;
  return VARIANT_EQUIVALENTS[a]?.has(b) ?? false;
}

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

  if (variantsEquivalent(cardVariant, listingVariant)) score += 20;
  if (cardLower.includes('parallel') && listingLower.includes('parallel')) score += 15;
  if (cardLower.includes('reprint') && listingLower.includes('reprint')) score += 15;
  if (cardImageId.includes('_p1') && listingLower.includes('parallel')) score += 10;
  if (cardImageId.includes('_p2') && (listingVariant === 'TR' || listingVariant === 'SP')) score += 10;
  if (cardImageId.includes('_r') && listingLower.includes('reprint')) score += 10;
  if (!cardVariant && !listingVariant && !cardImageId.match(/_[pr]\d/i)) score += 5;

  return score;
}

function pickBestListing(
  listings: TcgPlayerListing[],
  cardName: string,
  cardImageId: string
): TcgPlayerListing | null {
  if (!listings.length) return null;
  if (listings.length === 1) return listings[0];

  const ranked = [...listings].sort((a, b) => {
    const scoreDiff = scoreListingMatch(b, cardName, cardImageId) - scoreListingMatch(a, cardName, cardImageId);
    if (scoreDiff !== 0) return scoreDiff;
    return (b.marketPrice ?? 0) - (a.marketPrice ?? 0);
  });

  return ranked[0] ?? null;
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
