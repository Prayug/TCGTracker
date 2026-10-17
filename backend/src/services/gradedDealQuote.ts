import { canonicalGradedHistoryVariantKey } from './gradedPriceService';

/**
 * Holofoil and normal are the same PriceCharting product. Newer scrapes land
 * on `holofoil` while older ones stayed on `normal`, so a deal has to consider
 * both and keep the newer quote.
 */
export function gradedQuoteLookupKeys(variantKey?: string | null): string[] {
  const requested = (variantKey || 'normal').trim().toLowerCase() || 'normal';
  const history = canonicalGradedHistoryVariantKey(variantKey).toLowerCase();
  return [...new Set([requested, history])];
}

export interface GradedQuoteCandidate {
  variantKey: string;
  fetchedAt: string;
  price: number | null;
}

export function pickFreshestGradedQuote<T extends GradedQuoteCandidate>(
  rows: T[],
  variantKey?: string | null
): T | null {
  const allowed = new Set(gradedQuoteLookupKeys(variantKey));
  const requested = gradedQuoteLookupKeys(variantKey)[0];
  const usable = rows.filter((row) => {
    const key = (row.variantKey || '').toLowerCase();
    return allowed.has(key) && row.price != null && Number.isFinite(row.price) && row.price > 0;
  });
  if (usable.length === 0) return null;
  usable.sort((a, b) => {
    if (a.fetchedAt !== b.fetchedAt) return a.fetchedAt < b.fetchedAt ? 1 : -1;
    const aPref = a.variantKey.toLowerCase() === requested ? 0 : 1;
    const bPref = b.variantKey.toLowerCase() === requested ? 0 : 1;
    return aPref - bPref;
  });
  return usable[0];
}

/** Calendar age of a `graded_prices.fetchedAt` timestamp. */
export function gradedQuoteAgeDays(fetchedAt: string, now = Date.now()): number | null {
  const day = fetchedAt.slice(0, 10);
  const ms = new Date(`${day}T00:00:00Z`).getTime();
  if (!Number.isFinite(ms)) return null;
  return (now - ms) / 86400000;
}
