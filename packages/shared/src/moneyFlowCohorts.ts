/**
 * Money-flow cohort classifiers and pure aggregation helpers.
 * Used by backend capital-flow + frontend types. No fabricated prices —
 * callers pass observed returns from the same mover quality gates as top-movers.
 */

import { packEraBandFromSet, type PackEraBand } from './packEraBand';

export const MONEY_FLOW_ERAS = ['vintage', 'mid', 'modern'] as const;
export type MoneyFlowEra = (typeof MONEY_FLOW_ERAS)[number];

export const MONEY_FLOW_FINISHES = ['raw', 'psa10'] as const;
export type MoneyFlowFinish = (typeof MONEY_FLOW_FINISHES)[number];

export const MONEY_FLOW_SPECIALS = ['gold_star', 'shining', 'sir_alt', 'icon'] as const;
export type MoneyFlowSpecial = (typeof MONEY_FLOW_SPECIALS)[number];

export type MoneyFlowConfidence = 'high' | 'medium' | 'low' | 'thin';
export type MoneyFlowRotation = 'into' | 'out' | 'neutral';

export const MONEY_FLOW_ERA_LABELS: Record<MoneyFlowEra, string> = {
  vintage: 'Vintage',
  mid: 'Mid-era',
  modern: 'Modern',
};

export const MONEY_FLOW_FINISH_LABELS: Record<MoneyFlowFinish, string> = {
  raw: 'Raw',
  psa10: 'PSA 10',
};

export const MONEY_FLOW_SPECIAL_LABELS: Record<MoneyFlowSpecial, string> = {
  gold_star: 'Gold Stars',
  shining: 'Shinings',
  sir_alt: 'SIR / alt-art',
  icon: 'Icons',
};

/** Map pack bands → three hobby eras collectors talk about. */
export function packBandToMoneyFlowEra(band: PackEraBand): MoneyFlowEra {
  switch (band) {
    case 'modern':
      return 'modern';
    case 'sm_xy':
    case 'bw_dp':
      return 'mid';
    default:
      return 'vintage';
  }
}

export function classifyMoneyFlowEra(set: {
  id?: string | null;
  name?: string | null;
}): MoneyFlowEra {
  return packBandToMoneyFlowEra(
    packEraBandFromSet({ id: set.id || undefined, name: set.name || undefined })
  );
}

/** Gold Star prints (☆ / "Gold Star" in name or rarity). */
export function isGoldStarPrint(name?: string | null, rarity?: string | null): boolean {
  const n = (name || '').toLowerCase();
  const r = (rarity || '').toLowerCase();
  if (/\bgold\s*star\b/.test(n) || /\bgold\s*star\b/.test(r)) return true;
  // Unicode star suffix used on many Gold Star titles (e.g. "Rayquaza ☆")
  if (/[☆★]/.test(name || '') && !/\bshiny\b/.test(n)) return true;
  return false;
}

/** Neo / e-Reader era Shining Pokémon (not modern "Shiny"). */
export function isShiningPrint(
  name?: string | null,
  rarity?: string | null,
  era?: MoneyFlowEra
): boolean {
  const n = (name || '').toLowerCase();
  const r = (rarity || '').toLowerCase();
  if (/\bshining\b/.test(n) || /\bshining\b/.test(r)) {
    // Prefer vintage/mid; still allow if rarity explicitly says Shining
    if (!era || era === 'vintage' || era === 'mid') return true;
    if (/\bshining\b/.test(r)) return true;
  }
  return false;
}

/** Special Illustration Rare / Illustration Rare / alt-art chase. */
export function isSirAltPrint(name?: string | null, rarity?: string | null): boolean {
  const blob = `${name || ''} ${rarity || ''}`.toLowerCase();
  return (
    /\bspecial\s*illustration\b/.test(blob) ||
    /\billustration\s*rare\b/.test(blob) ||
    /\bhyper\s*rare\b/.test(blob) ||
    /\balt\s*-?\s*art\b/.test(blob) ||
    /\bsir\b/.test(blob) ||
    /\b\bir\b/.test(blob)
  );
}

/**
 * Icon / chase flags only when rarity/name metadata already marks them —
 * Amazing Rare, Radiant, Gold Rare, ACE SPEC, trainer gallery.
 * Deliberately excludes bare "Secret Rare" (too many modern prints).
 */
export function isIconPrint(name?: string | null, rarity?: string | null): boolean {
  const blob = `${name || ''} ${rarity || ''}`.toLowerCase();
  return (
    /\bamazing\s*rare\b/.test(blob) ||
    /\bradiant\b/.test(blob) ||
    /\bgold\s*rare\b/.test(blob) ||
    /\bace\s*spec\b/.test(blob) ||
    /\btrainer\s*gallery\b/.test(blob)
  );
}

export function detectSpecialCohorts(input: {
  name?: string | null;
  rarity?: string | null;
  era: MoneyFlowEra;
}): MoneyFlowSpecial[] {
  const out: MoneyFlowSpecial[] = [];
  if (isGoldStarPrint(input.name, input.rarity)) out.push('gold_star');
  if (isShiningPrint(input.name, input.rarity, input.era)) out.push('shining');
  if (isSirAltPrint(input.name, input.rarity)) out.push('sir_alt');
  if (isIconPrint(input.name, input.rarity)) out.push('icon');
  return out;
}

export function confidenceFromSample(sampleSize: number): MoneyFlowConfidence {
  if (sampleSize < 8) return 'thin';
  if (sampleSize < 20) return 'low';
  if (sampleSize < 50) return 'medium';
  return 'high';
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return round2((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return round2(sorted[mid]!);
}

/** Drop equal tails (default 10% each side), then mean the rest. */
export function trimmedMean(values: number[], trimRatio = 0.1): number | null {
  if (values.length === 0) return null;
  if (values.length < 5) return round2(values.reduce((a, b) => a + b, 0) / values.length);
  const sorted = [...values].sort((a, b) => a - b);
  const drop = Math.max(1, Math.floor(sorted.length * trimRatio));
  const core = sorted.slice(drop, sorted.length - drop);
  if (core.length === 0) return median(values);
  return round2(core.reduce((a, b) => a + b, 0) / core.length);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface CohortReturnStats {
  sampleSize: number;
  medianReturnPct: number | null;
  trimmedMeanReturnPct: number | null;
  breadthUpPct: number | null;
  upCount: number;
  downCount: number;
  flatCount: number;
  confidence: MoneyFlowConfidence;
  netDollarMove: number;
  absDollarMove: number;
}

export function aggregateCohortReturns(
  returnsPct: number[],
  dollarMoves: number[] = []
): CohortReturnStats {
  const sampleSize = returnsPct.length;
  if (sampleSize === 0) {
    return {
      sampleSize: 0,
      medianReturnPct: null,
      trimmedMeanReturnPct: null,
      breadthUpPct: null,
      upCount: 0,
      downCount: 0,
      flatCount: 0,
      confidence: 'thin',
      netDollarMove: 0,
      absDollarMove: 0,
    };
  }

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  for (const r of returnsPct) {
    if (r > 0) upCount += 1;
    else if (r < 0) downCount += 1;
    else flatCount += 1;
  }

  const netDollarMove = round2(dollarMoves.reduce((a, b) => a + b, 0));
  const absDollarMove = round2(dollarMoves.reduce((a, b) => a + Math.abs(b), 0));

  return {
    sampleSize,
    medianReturnPct: median(returnsPct),
    trimmedMeanReturnPct: trimmedMean(returnsPct),
    breadthUpPct: round2((upCount / sampleSize) * 100),
    upCount,
    downCount,
    flatCount,
    confidence: confidenceFromSample(sampleSize),
    netDollarMove,
    absDollarMove,
  };
}

/**
 * Rotation from share of positive movers vs share of negative movers.
 * INTO = cohort punches above its weight among gainers relative to losers.
 */
export function classifyRotation(input: {
  shareOfGainers: number;
  shareOfLosers: number;
  medianReturnPct: number | null;
  sampleSize: number;
  confidence: MoneyFlowConfidence;
  breadthUpPct?: number | null;
}): MoneyFlowRotation {
  if (input.sampleSize === 0) return 'neutral';
  const median = input.medianReturnPct ?? 0;
  const breadth = input.breadthUpPct;
  // Thin specials can still lean when the move is clear — UI flags the sample.
  if (input.confidence === 'thin') {
    if (median >= 5 && (breadth == null || breadth >= 60)) return 'into';
    if (median <= -5 && (breadth == null || breadth <= 40)) return 'out';
    return 'neutral';
  }
  const edge = input.shareOfGainers - input.shareOfLosers;
  if (edge >= 0.05 && median > 0) return 'into';
  if (edge <= -0.05 && median < 0) return 'out';
  if (
    median >= 2 &&
    (breadth == null || breadth >= 55) &&
    input.shareOfGainers >= input.shareOfLosers
  ) {
    return 'into';
  }
  if (
    median <= -2 &&
    (breadth == null || breadth <= 45) &&
    input.shareOfLosers >= input.shareOfGainers
  ) {
    return 'out';
  }
  return 'neutral';
}

/** Price floors for the money-flow universe (investment-relevant, not bulk). */
export const MONEY_FLOW_RAW_MIN_PRICE = 8;
export const MONEY_FLOW_PSA10_MIN_PRICE = 25;
/** Commons/uncommons need a higher bar to count as capital, not binder fodder. */
export const MONEY_FLOW_BULK_RAW_PRICE_BAR = 40;
export const MONEY_FLOW_BULK_PSA10_PRICE_BAR = 100;

const BULK_RARITY = /^(common|uncommon|c|u)$|^\s*(common|uncommon)\s*$|\b(common|uncommon)\b/i;
const JUNK_NAME =
  /\b(basic\s+energy|energy\s*\(|double\s+colorless|powerful\s+energy|treasure\s+energy|boost\s+energy)\b/i;

export function isBulkRarity(rarity?: string | null): boolean {
  const r = (rarity || '').trim().toLowerCase();
  if (!r) return false;
  if (BULK_RARITY.test(r)) return true;
  // Exact common labels from catalog / TCGPlayer
  return r === 'common' || r === 'uncommon' || r === 'c' || r === 'u';
}

/**
 * Keep chase / investment-relevant prints only.
 * Drops commons/uncommons below a high price bar, junk energy, and sub-floor quotes.
 */
export function isMoneyFlowRelevantPrint(input: {
  rarity?: string | null;
  name?: string | null;
  currentPrice: number;
  finish: MoneyFlowFinish;
}): boolean {
  const price = input.currentPrice;
  if (!(price > 0) || !Number.isFinite(price)) return false;
  if (JUNK_NAME.test(input.name || '')) return false;

  const minFloor = input.finish === 'psa10' ? MONEY_FLOW_PSA10_MIN_PRICE : MONEY_FLOW_RAW_MIN_PRICE;
  if (price < minFloor) return false;

  if (isBulkRarity(input.rarity)) {
    const bar =
      input.finish === 'psa10' ? MONEY_FLOW_BULK_PSA10_PRICE_BAR : MONEY_FLOW_BULK_RAW_PRICE_BAR;
    return price >= bar;
  }
  return true;
}

/** Plain-English collector line for a cohort row. */
export function storyForCohort(input: {
  label: string;
  rotation: MoneyFlowRotation;
  medianReturnPct: number | null;
  breadthUpPct: number | null;
  sampleSize: number;
  confidence: MoneyFlowConfidence;
  exemplarName?: string | null;
}): string {
  if (input.sampleSize === 0) {
    return `Not enough ${input.label.toLowerCase()} movers this window.`;
  }
  const pct =
    input.medianReturnPct == null
      ? null
      : `${input.medianReturnPct > 0 ? '+' : ''}${input.medianReturnPct.toFixed(1)}%`;
  const rising =
    input.breadthUpPct == null ? null : `${Math.round(input.breadthUpPct)}% of prints rising`;
  const tip = input.exemplarName ? ` e.g. ${input.exemplarName}` : '';
  const thin =
    input.confidence === 'thin' || input.confidence === 'low'
      ? ' Small sample — treat as a hint, not a call.'
      : '';

  if (input.rotation === 'into') {
    return `${input.label} is getting chased${pct ? ` (about ${pct} median)` : ''}${
      rising ? ` — ${rising}` : ''
    }.${tip}${thin}`;
  }
  if (input.rotation === 'out') {
    return `${input.label} is cooling${pct ? ` (about ${pct} median)` : ''}${
      rising ? ` — only ${rising}` : ''
    }.${tip}${thin}`;
  }
  return `${input.label} looks mixed${pct ? ` (${pct} median)` : ''}${
    rising ? ` — ${rising}` : ''
  }.${thin}`;
}

export interface MoneyFlowMemberInput {
  changePercent: number;
  currentPrice: number;
  previousPrice: number;
  setId?: string | null;
  setName?: string | null;
  productName?: string | null;
  rarity?: string | null;
  finish: MoneyFlowFinish;
}

export type MoneyFlowCohortKind = 'era' | 'finish' | 'special' | 'era_finish';

export interface MoneyFlowCohortId {
  kind: MoneyFlowCohortKind;
  key: string;
}

export function cohortKey(kind: MoneyFlowCohortKind, key: string): string {
  return `${kind}:${key}`;
}

export function labelForCohort(kind: MoneyFlowCohortKind, key: string): string {
  if (kind === 'era') return MONEY_FLOW_ERA_LABELS[key as MoneyFlowEra] || key;
  if (kind === 'finish') return MONEY_FLOW_FINISH_LABELS[key as MoneyFlowFinish] || key;
  if (kind === 'special') return MONEY_FLOW_SPECIAL_LABELS[key as MoneyFlowSpecial] || key;
  if (kind === 'era_finish') {
    const [era, finish] = key.split('|');
    const eraLabel = MONEY_FLOW_ERA_LABELS[era as MoneyFlowEra] || era;
    const finishLabel = MONEY_FLOW_FINISH_LABELS[finish as MoneyFlowFinish] || finish;
    return `${eraLabel} · ${finishLabel}`;
  }
  return key;
}
