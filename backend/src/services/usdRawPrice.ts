import { getDb } from '../db/database';
import { expectedPcFinishFamily, type PcFinishFamily } from './priceChartingClient';

/**
 * One trustworthy USD Near Mint price per card, for comparisons against slabs
 * and eBay listings.
 *
 * The canonical series can hold numbers that are not TCGplayer USD at all:
 * - Cardmarket finishes (`|cardmarket`, `|cardmarketholo`) are EUR converted.
 * - TCGdex falls back to Cardmarket when it has no TCGplayer price, and that
 *   fallback was saved under the TCGplayer finish (Rayquaza ★ Deoxys showed
 *   $56 and $65 against a ~$9,400 card).
 * - Some feeds return a market far below their own lowest listing (Pikachu ★
 *   Holon Phantoms: market $207.71, low $6,997.84).
 *
 * So: drop Cardmarket rows and self-contradicting quotes, then check the
 * result against PriceCharting's ungraded price for the same product. When our
 * figure is under a quarter of PriceCharting's, it is the wrong product or the
 * wrong currency, and PriceCharting's figure is used instead.
 */

export interface UsdRawPrice {
  price: number;
  /** canonical source tag, or `pricecharting` when the cross-check replaced it */
  source: string;
  uniqueIdentifier: string | null;
  date: string | null;
  /** True when PriceCharting's ungraded price replaced our own quote. */
  replacedByPriceCharting: boolean;
}

/** Market under this share of the same quote's low listing is not a real market. */
export const MIN_MARKET_TO_LOW_RATIO = 1 / 3;
/** Our raw under this share of PriceCharting ungraded is treated as a wrong match. */
export const MIN_RAW_TO_PC_UNGRADED_RATIO = 0.25;
/** PriceCharting ungraded only overrides when it is at least this much. */
const MIN_PC_UNGRADED_FOR_OVERRIDE = 20;
/** Ignore PriceCharting ungraded quotes older than this. */
const PC_UNGRADED_MAX_AGE_DAYS = 21;
/** Variant quotes this many days older than the card's newest are ignored. */
const VARIANT_STALE_DAYS = 7;

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => (err ? reject(err) : resolve((rows || []) as T[])));
  });

export const isCardmarketVariant = (variantKey?: string | null, uid?: string | null): boolean => {
  const v = (variantKey || '').toLowerCase();
  if (v.includes('cardmarket')) return true;
  const u = (uid || '').toLowerCase();
  return u.endsWith('|cardmarket') || u.endsWith('|cardmarketholo');
};

export const isSelfConsistentQuote = (price: number, lowPrice?: number | null): boolean => {
  if (!(price > 0)) return false;
  if (lowPrice == null || !(lowPrice > 0)) return true;
  return price >= lowPrice * MIN_MARKET_TO_LOW_RATIO;
};

export interface RawCandidate {
  uniqueIdentifier: string;
  variantKey: string | null;
  date: string;
  price: number;
  lowPrice: number | null;
  source: string;
}

export interface PcUngradedQuote {
  variantKey: string | null;
  price: number;
  fetchedAt: string | null;
}

const daysApart = (a: string, b: string): number =>
  Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;

const finishOf = (variantKey?: string | null): PcFinishFamily =>
  expectedPcFinishFamily(variantKey || 'normal');

/**
 * Pure picker, exported for tests. `family` limits the comparison to one
 * print family (a reverse holo slab is compared with the reverse holo raw).
 */
export function pickUsdRawPrice(
  candidates: RawCandidate[],
  pcUngraded: PcUngradedQuote[],
  options?: { family?: PcFinishFamily; now?: Date }
): UsdRawPrice | null {
  const family = options?.family ?? 'standard';
  const now = options?.now ?? new Date();

  const usable = candidates.filter(
    (c) =>
      !isCardmarketVariant(c.variantKey, c.uniqueIdentifier) &&
      c.source !== 'cardmarket' &&
      finishOf(c.variantKey) === family &&
      isSelfConsistentQuote(c.price, c.lowPrice)
  );
  const newest = usable.reduce<string | null>(
    (best, c) => (best == null || c.date > best ? c.date : best),
    null
  );
  const fresh = newest ? usable.filter((c) => daysApart(c.date, newest) <= VARIANT_STALE_DAYS) : [];
  // Latest row per UID, then the strongest finish (holo over a non-holo stub).
  const latestByUid = new Map<string, RawCandidate>();
  for (const c of fresh) {
    const prev = latestByUid.get(c.uniqueIdentifier);
    if (!prev || c.date > prev.date) latestByUid.set(c.uniqueIdentifier, c);
  }
  const best = [...latestByUid.values()].sort((a, b) => b.price - a.price)[0] ?? null;

  const pc = pcUngraded
    .filter((q) => finishOf(q.variantKey) === family && q.price >= MIN_PC_UNGRADED_FOR_OVERRIDE)
    .filter((q) => {
      if (!q.fetchedAt) return false;
      const at = new Date(
        q.fetchedAt.includes('T') ? q.fetchedAt : `${q.fetchedAt.replace(' ', 'T')}Z`
      );
      return (now.getTime() - at.getTime()) / 86_400_000 <= PC_UNGRADED_MAX_AGE_DAYS;
    })
    .sort((a, b) => (b.fetchedAt || '').localeCompare(a.fetchedAt || ''))[0];

  if (pc && (!best || best.price < pc.price * MIN_RAW_TO_PC_UNGRADED_RATIO)) {
    return {
      price: pc.price,
      source: 'pricecharting',
      uniqueIdentifier: best?.uniqueIdentifier ?? null,
      date: pc.fetchedAt ? pc.fetchedAt.slice(0, 10) : null,
      replacedByPriceCharting: true,
    };
  }
  if (!best) return null;
  return {
    price: best.price,
    source: best.source,
    uniqueIdentifier: best.uniqueIdentifier,
    date: best.date,
    replacedByPriceCharting: false,
  };
}

/**
 * Batched lookup: one USD raw price per card for the given print family.
 * Reads the last ~2 weeks of canonical quotes for every mapped finish.
 */
export async function getUsdRawPricesForCards(
  cardIds: string[],
  options?: { family?: PcFinishFamily }
): Promise<Map<string, UsdRawPrice>> {
  const ids = [...new Set(cardIds.filter(Boolean))];
  const out = new Map<string, UsdRawPrice>();
  if (ids.length === 0) return out;

  const CHUNK = 400;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const ph = chunk.map(() => '?').join(',');
    const rows = await all<RawCandidate & { cardId: string }>(
      `SELECT cm.cardId, c.uniqueIdentifier, cm.variantKey, c.date, c.price, c.lowPrice, c.source
       FROM card_mappings cm
       INNER JOIN canonical_price_history c ON c.uniqueIdentifier = cm.uniqueIdentifier
       WHERE cm.cardId IN (${ph})
         AND c.price > 0
         AND c.date >= date((SELECT MAX(c2.date) FROM canonical_price_history c2
                             WHERE c2.uniqueIdentifier = cm.uniqueIdentifier), '-14 days')`,
      chunk
    );
    const pcRows = await all<PcUngradedQuote & { cardId: string }>(
      `SELECT cardId, variantKey, price, fetchedAt
       FROM graded_prices
       WHERE cardId IN (${ph}) AND grader = 'ungraded'
         AND COALESCE(verified, 0) = 1 AND price > 0`,
      chunk
    );

    const byCard = new Map<string, RawCandidate[]>();
    for (const r of rows) {
      const list = byCard.get(r.cardId);
      if (list) list.push(r);
      else byCard.set(r.cardId, [r]);
    }
    const pcByCard = new Map<string, PcUngradedQuote[]>();
    for (const r of pcRows) {
      const list = pcByCard.get(r.cardId);
      if (list) list.push(r);
      else pcByCard.set(r.cardId, [r]);
    }
    for (const cardId of chunk) {
      const picked = pickUsdRawPrice(byCard.get(cardId) || [], pcByCard.get(cardId) || [], {
        family: options?.family,
      });
      if (picked) out.set(cardId, picked);
    }
  }
  return out;
}

export async function getUsdRawPriceForCard(
  cardId: string,
  options?: { family?: PcFinishFamily }
): Promise<UsdRawPrice | null> {
  const map = await getUsdRawPricesForCards([cardId], options);
  return map.get(cardId) ?? null;
}
