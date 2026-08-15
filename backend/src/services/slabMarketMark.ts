/**
 * PriceCharting sold-guide is the slab quote.
 * Live BIN asks are context only — never mixed into the main number.
 */

export interface SlabMarketInputs {
  soldGuide: number;
  lastSoldPrice?: number | null;
  lastSoldDate?: string | null;
  listedLow?: number | null;
  listedAvg?: number | null;
  listedCount?: number | null;
  now?: Date;
}

export interface SlabMarketMark {
  mark: number;
  soldGuide: number;
  askWeight: number;
  staleSold: boolean;
  lastSoldAgeDays: number | null;
  listedPremiumPct: number | null;
  reason: string;
}

const STALE_SOLD_DAYS = 90;

export function lastSoldAgeDays(lastSoldDate?: string | null, now = new Date()): number | null {
  if (!lastSoldDate) return null;
  const ms = new Date(`${lastSoldDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round((now.getTime() - ms) / 86400000));
}

const roundMoney = (n: number): number => Math.round(n * 100) / 100;

export function blendSlabMarketMark(input: SlabMarketInputs): SlabMarketMark {
  const soldGuide = Number(input.soldGuide);
  const now = input.now ?? new Date();
  const ageDays = lastSoldAgeDays(input.lastSoldDate, now);
  const staleSold = ageDays != null ? ageDays > STALE_SOLD_DAYS : false;

  const empty = (reason: string): SlabMarketMark => ({
    mark: Number.isFinite(soldGuide) && soldGuide > 0 ? roundMoney(soldGuide) : soldGuide,
    soldGuide,
    askWeight: 0,
    staleSold,
    lastSoldAgeDays: ageDays,
    listedPremiumPct: null,
    reason,
  });

  if (!Number.isFinite(soldGuide) || soldGuide <= 0) {
    return empty('invalid_sold');
  }

  const listedCount = Number(input.listedCount) || 0;
  const listedLow = Number(input.listedLow);
  const hasAsk = listedCount > 0 && Number.isFinite(listedLow) && listedLow > 0;
  const listedPremiumPct = hasAsk ? roundMoney(((listedLow - soldGuide) / soldGuide) * 100) : null;

  let reason: string;
  if (!hasAsk) {
    reason = staleSold ? 'sold_only_stale' : 'sold_only';
  } else {
    reason = staleSold ? 'sold_with_asks_stale' : 'sold_with_asks';
  }

  return {
    mark: roundMoney(soldGuide),
    soldGuide,
    askWeight: 0,
    staleSold,
    lastSoldAgeDays: ageDays,
    listedPremiumPct,
    reason,
  };
}
