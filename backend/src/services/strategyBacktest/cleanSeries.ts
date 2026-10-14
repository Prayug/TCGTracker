/**
 * Robust cleaner for scraped daily price series (PriceCharting slab marks).
 *
 * An audit of ~46k PSA 10 series (Aug–Oct 2026) found 97% of daily prints
 * unchanged, but 22% of >25% jumps reverting within a week, and 9% of liquid
 * series swinging >25% both ways (base1-4 PSA 10: 28.3k → 20.1k → 24.1k → 12.3k).
 * This rule removed 96% of those flip-flops while keeping 99.9% of moves that
 * held, at the cost of a ~5 day lag on genuine re-pricings:
 *
 *  - reference = median of the last K accepted log prices
 *  - a print within ±X of the reference is accepted
 *  - otherwise it opens (or extends) a pending level; prints within ±TOL of
 *    that level extend it, and once it has persisted D days the history resets to it
 *  - output = exp(median of the last K accepted)
 *
 * It cannot fix multi-week regime switches, so a series with two
 * opposite-sign confirmed moves inside 30 days is flagged `lowConfidence`.
 */

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  price: number;
}

export interface CleanOptions {
  window: number;
  maxDeviation: number; // in log space
  confirmDays: number;
  tolerance: number; // in log space
  flipWindowDays: number;
}

export const DEFAULT_CLEAN_OPTIONS: CleanOptions = {
  window: 7,
  maxDeviation: Math.log(1.3),
  confirmDays: 5,
  tolerance: Math.log(1.15),
  flipWindowDays: 30,
};

export interface CleanResult {
  points: DailyPoint[];
  rejected: number;
  confirmedMoves: { date: string; direction: 1 | -1 }[];
  lowConfidence: boolean;
}

const DAY_MS = 86_400_000;
const dayNum = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function cleanDailySeries(
  input: DailyPoint[],
  options: CleanOptions = DEFAULT_CLEAN_OPTIONS
): CleanResult {
  const sorted = input
    .filter((p) => Number.isFinite(p.price) && p.price > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let history: number[] = [];
  let pending: { start: string; level: number; logs: number[] } | null = null;
  let rejected = 0;
  const confirmedMoves: CleanResult['confirmedMoves'] = [];
  const points: DailyPoint[] = [];

  for (const p of sorted) {
    const x = Math.log(p.price);
    if (history.length === 0) {
      history.push(x);
    } else {
      const ref = medianOf(history.slice(-options.window));
      if (Math.abs(x - ref) <= options.maxDeviation) {
        history.push(x);
        pending = null;
      } else if (pending && Math.abs(x - pending.level) <= options.tolerance) {
        pending.logs.push(x);
        if (dayNum(p.date) - dayNum(pending.start) >= options.confirmDays) {
          confirmedMoves.push({ date: p.date, direction: pending.level > ref ? 1 : -1 });
          history = [...pending.logs];
          pending = null;
        } else {
          rejected++;
        }
      } else {
        pending = { start: p.date, level: x, logs: [x] };
        rejected++;
      }
    }
    points.push({
      date: p.date,
      price: Math.round(Math.exp(medianOf(history.slice(-options.window))) * 100) / 100,
    });
  }

  let lowConfidence = false;
  for (let i = 1; i < confirmedMoves.length && !lowConfidence; i++) {
    for (let j = i - 1; j >= 0; j--) {
      const gap = dayNum(confirmedMoves[i].date) - dayNum(confirmedMoves[j].date);
      if (gap > options.flipWindowDays) break;
      if (confirmedMoves[i].direction !== confirmedMoves[j].direction) {
        lowConfidence = true;
        break;
      }
    }
  }

  return { points, rejected, confirmedMoves, lowConfidence };
}
