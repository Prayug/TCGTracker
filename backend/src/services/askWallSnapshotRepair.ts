import { JUNK_MARKET_FLOOR_RATIO } from '../utils/resolveListingPrice';

/**
 * Until PR #47 the catalog snapshot threw out any TCGplayer market under half of the
 * cheapest ask and saved the mid (or the low/high average) instead. On thin cards that
 * stored an ask as the day's price: Plasma Storm Lugia-EX went $1,344 → $3,999.99.
 *
 * The real market for those days was never saved, so a repaired day carries forward the
 * last trusted price. A day is only touched when it carries that rule's signature:
 * the last trusted price sat between the junk floor and half of the day's low, and the
 * stored price is at or above the low and more than double the last trusted price.
 */
export const OLD_REJECT_RATIO = 0.5;
export const JUMP_RATIO = 2;

export interface SnapshotRow {
  date: string;
  price: number;
  lowPrice: number | null;
}

export interface SnapshotRepair {
  date: string;
  from: number;
  to: number;
}

export function findAskWallRepairs(rows: SnapshotRow[]): SnapshotRepair[] {
  const repairs: SnapshotRepair[] = [];
  let lastTrusted: number | null = null;
  for (const row of rows) {
    const low = row.lowPrice ?? 0;
    const looksLikeAsk =
      lastTrusted != null &&
      low > 0 &&
      row.price >= low &&
      row.price > lastTrusted * JUMP_RATIO &&
      lastTrusted < low * OLD_REJECT_RATIO &&
      lastTrusted >= low * JUNK_MARKET_FLOOR_RATIO;
    if (looksLikeAsk) {
      repairs.push({ date: row.date, from: row.price, to: lastTrusted as number });
    } else if (row.price > 0) {
      lastTrusted = row.price;
    }
  }
  return repairs;
}
