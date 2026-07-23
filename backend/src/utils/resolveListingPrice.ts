/**
 * Resolve a usable quote from TCGPlayer-style listing fields.
 *
 * Two failure modes we see in the wild:
 * 1. Junk/null `market` with a sane `mid`/`low` (Shining Charizard 1st Ed: market $19.99, low $6,165)
 * 2. Ask-wall `mid`/`high` with a sane `market` (Plasma Storm Charizard: market $1,150, mid $19,999)
 *
 * Prefer market when it sits in the low/high band. Never let an inflated mid override a sane market.
 */

export type ListingPriceFields = {
  market?: number | null;
  mid?: number | null;
  low?: number | null;
  high?: number | null;
};

const positive = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Market is usable when it isn't absurdly below low or above high. Mid is ignored here on purpose. */
export function isCoherentMarketPrice(
  market: number | null | undefined,
  low?: number | null,
  _mid?: number | null,
  high?: number | null
): boolean {
  if (!positive(market)) return false;
  if (positive(low) && market < low * 0.5) return false;
  if (positive(high) && market > high * 2) return false;
  return true;
}

/** Mid/high ask walls: far above the floor (and usually far above real market). */
export function isAskWallPrice(
  value: number | null | undefined,
  low?: number | null,
  market?: number | null
): boolean {
  if (!positive(value)) return true;
  if (positive(market) && value > market * 2.5) return true;
  if (positive(low) && value > low * 5) return true;
  return false;
}

export function resolveListingPrice(fields: ListingPriceFields): number {
  const { market = null, mid = null, low = null, high = null } = fields;

  if (isCoherentMarketPrice(market, low, mid, high)) return market as number;

  if (positive(mid) && !isAskWallPrice(mid, low, null)) return mid;

  // Tight low/high band → midpoint is meaningful. Wide band usually means ask-wall high.
  if (positive(low) && positive(high) && high <= low * 5) return (low + high) / 2;
  if (positive(low)) return low;
  if (positive(mid)) return mid;
  if (positive(market)) return market;
  if (positive(high)) return high;
  return 0;
}

/**
 * History rows already store the snapped market quote. Only repair when that quote is
 * incoherent vs the stored low/high band (never invent an ask-wall mid).
 */
export function resolveHistoryPointPrice(point: {
  marketPrice?: number | null;
  price?: number | null;
  lowPrice?: number | null;
  highPrice?: number | null;
  midPrice?: number | null;
}): number {
  return resolveListingPrice({
    market: point.marketPrice ?? point.price,
    mid: point.midPrice,
    low: point.lowPrice,
    high: point.highPrice,
  });
}

const PREMIUM_VARIANT_ORDER = [
  '1stEditionHolofoil',
  '1stEditionNormal',
  'holofoil',
  'unlimitedHolofoil',
  'reverseHolofoil',
  'normal',
  'unlimited',
];

export function extractBestListingPrice(
  prices?: Record<string, ListingPriceFields> | null,
  preferredVariant?: string
): { price: number; variantKey: string | null } {
  if (!prices) return { price: 0, variantKey: null };

  if (preferredVariant && prices[preferredVariant]) {
    const preferredPrice = resolveListingPrice(prices[preferredVariant]);
    if (preferredPrice > 0) {
      return { price: preferredPrice, variantKey: preferredVariant };
    }
  }

  for (const key of PREMIUM_VARIANT_ORDER) {
    const entry = prices[key];
    if (!entry) continue;
    const price = resolveListingPrice(entry);
    if (price > 0) return { price, variantKey: key };
  }

  let best = { price: 0, variantKey: null as string | null };
  for (const [key, entry] of Object.entries(prices)) {
    const price = resolveListingPrice(entry);
    if (price > best.price) best = { price, variantKey: key };
  }
  return best;
}
