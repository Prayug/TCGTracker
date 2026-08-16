import type { LiquidityTier } from './liquidityScore';

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Soft price-tier bulk penalty (points subtracted from opportunity score). */
export function baseBulkPenaltyByPrice(marketPrice: number | null): number {
  if (marketPrice == null || !Number.isFinite(marketPrice) || marketPrice <= 0) return 18;
  if (marketPrice < 0.5) return 38;
  if (marketPrice < 2) return 24;
  if (marketPrice < 5) return 14;
  if (marketPrice < 10) return 5;
  return 0;
}

export interface BulkScoringInput {
  /** Raw NM price preferred; slab price used as fallback. */
  marketPrice: number | null;
  changeAbs: number | null;
  changePct: number | null;
  momentumDays: number;
  soldListings: number;
  liquidityTier: LiquidityTier | null;
  buyoutScore: number;
  velocityRatio: number | null;
  listedCount: number | null;
  listedCountPrev: number | null;
  netSentiment: number | null;
  hasCatalyst: boolean;
  compMomentumPct: number | null;
}

export interface BulkScoringResult {
  /** Points to subtract after base opportunity score. */
  penalty: number;
  /** Points to add for economically meaningful absolute moves. */
  economicBoost: number;
  overrideActive: boolean;
  overrideReasons: string[];
  flags: string[];
}

/**
 * Penalize noise-driven low-dollar moves; boost absolute significance.
 * Cheap cards need stronger evidence to rank highly.
 */
export function applyBulkAndEconomicScoring(input: BulkScoringInput): BulkScoringResult {
  const flags: string[] = [];
  const overrideReasons: string[] = [];
  let penalty = baseBulkPenaltyByPrice(input.marketPrice);
  let evidenceScore = 0;

  const price = input.marketPrice ?? 0;
  const absGain = input.changeAbs ?? 0;
  const pctGain = input.changePct ?? 0;

  // Trivial absolute gain despite large % move.
  if (pctGain > 25 && absGain > 0 && absGain < 0.5) {
    penalty += 18;
    flags.push('trivial_abs_gain');
  } else if (pctGain > 15 && absGain > 0 && absGain < 1 && price < 5) {
    penalty += 10;
    flags.push('low_abs_gain');
  }

  // Thin volume / unreliable price.
  if (input.soldListings < 3) {
    penalty += 14;
    flags.push('thin_volume');
  } else if (input.soldListings < 6) {
    penalty += 6;
  }

  if (input.liquidityTier === 'illiquid') {
    penalty += 12;
    flags.push('illiquid');
  } else if (input.liquidityTier === 'thin') {
    penalty += 7;
  }

  if (input.velocityRatio == null && input.soldListings < 5) {
    penalty += 6;
    flags.push('no_velocity_baseline');
  }

  // Supply drain with demand = strong override evidence.
  if (
    input.listedCount != null &&
    input.listedCountPrev != null &&
    input.listedCountPrev >= 3
  ) {
    const dropPct = ((input.listedCountPrev - input.listedCount) / input.listedCountPrev) * 100;
    if (dropPct >= 40) {
      evidenceScore += 14;
      overrideReasons.push(`listings down ${round1(dropPct)}%`);
    } else if (dropPct >= 25) {
      evidenceScore += 8;
    }
  }

  if (input.velocityRatio != null && input.velocityRatio >= 2) {
    evidenceScore += 14;
    overrideReasons.push(`${round1(input.velocityRatio)}× sales velocity`);
  } else if (input.velocityRatio != null && input.velocityRatio >= 1.5) {
    evidenceScore += 8;
  }

  if (input.soldListings >= 10) {
    evidenceScore += 12;
    overrideReasons.push(`${input.soldListings} recent sales`);
  } else if (input.soldListings >= 6) {
    evidenceScore += 7;
  }

  if (input.buyoutScore >= 50) {
    evidenceScore += 12;
    overrideReasons.push('confirmed buyout pressure');
  } else if (input.buyoutScore >= 35) {
    evidenceScore += 6;
  }

  if (absGain >= 8) {
    evidenceScore += 12;
    overrideReasons.push(`+$${round1(absGain)} absolute move`);
  } else if (absGain >= 3) {
    evidenceScore += 7;
  } else if (absGain >= 1.5 && price < 5) {
    evidenceScore += 5;
    overrideReasons.push(`meaningful $${round1(absGain)} gain for price tier`);
  }

  if (input.hasCatalyst && (input.netSentiment ?? 0) > 0.2) {
    evidenceScore += 10;
    overrideReasons.push('external catalyst with positive sentiment');
  } else if (input.hasCatalyst) {
    evidenceScore += 6;
    overrideReasons.push('identified market catalyst');
  }

  if (input.compMomentumPct != null && input.compMomentumPct > 10) {
    evidenceScore += 6;
    overrideReasons.push('set comps trending');
  }

  if (
    input.liquidityTier === 'strong' ||
    input.liquidityTier === 'ok'
  ) {
    if (input.soldListings >= 5) evidenceScore += 5;
  }

  if (input.momentumDays >= 21 && pctGain > 8) {
    evidenceScore += 5;
    overrideReasons.push(`${input.momentumDays}d sustained trend`);
  }

  // Progressive evidence requirement for cheaper cards.
  if (price > 0 && price < 2) evidenceScore = Math.max(0, evidenceScore - 4);
  if (price > 0 && price < 0.5) evidenceScore = Math.max(0, evidenceScore - 6);

  // Apply evidence-based penalty reduction.
  let overrideActive = false;
  if (evidenceScore >= 22) {
    penalty = Math.round(penalty * 0.15);
    overrideActive = true;
  } else if (evidenceScore >= 14) {
    penalty = Math.round(penalty * 0.45);
    overrideActive = overrideReasons.length >= 2;
  } else if (evidenceScore >= 8) {
    penalty = Math.round(penalty * 0.7);
  }

  penalty = clamp(penalty, 0, 50);

  // Economic significance boost — favor dollar impact over raw %.
  let economicBoost = 0;
  if (absGain > 0) {
    economicBoost += clamp((absGain / 15) * 12, 0, 12);
  }
  if (price >= 10 && pctGain > 5) economicBoost += 3;
  if (input.soldListings >= 8 && absGain >= 2) economicBoost += 4;
  economicBoost = clamp(Math.round(economicBoost), 0, 18);

  return {
    penalty,
    economicBoost,
    overrideActive,
    overrideReasons: [...new Set(overrideReasons)],
    flags,
  };
}

export function buildBulkAwareWhy(input: {
  marketPrice: number | null;
  bulk: BulkScoringResult;
  baseWhy: string;
}): string {
  const price = input.marketPrice;
  const cheap = price != null && price < 5;

  if (cheap && input.bulk.overrideActive && input.bulk.overrideReasons.length > 0) {
    const reasons = input.bulk.overrideReasons.slice(0, 3).join(', ');
    return `Despite its $${round1(price!)} price, this card shows ${reasons}. The move appears demand-driven rather than a low-liquidity spike. ${input.baseWhy}`;
  }

  if (cheap && input.bulk.penalty >= 20 && !input.bulk.overrideActive) {
    return `Low absolute upside at $${round1(price!)} — ranked below higher-dollar moves with similar momentum. ${input.baseWhy}`;
  }

  if (input.bulk.flags.includes('trivial_abs_gain')) {
    return `Large % move but minimal dollar gain — treated as low economic significance. ${input.baseWhy}`;
  }

  return input.baseWhy;
}
