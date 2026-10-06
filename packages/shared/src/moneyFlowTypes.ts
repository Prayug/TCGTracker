/**
 * Shared DTOs for GET /api/prices/money-flow
 */

import type {
  MoneyFlowCohortKind,
  MoneyFlowConfidence,
  MoneyFlowEra,
  MoneyFlowFinish,
  MoneyFlowRotation,
  MoneyFlowSpecial,
} from './moneyFlowCohorts';

export interface MoneyFlowExemplar {
  productName: string;
  changePercent: number;
  currentPrice: number;
  previousPrice: number;
  imageSmall: string | null;
  imageLarge: string | null;
  cardId: string | null;
  setId: string | null;
  setName: string | null;
  rarity: string | null;
  finish: MoneyFlowFinish;
}

export interface MoneyFlowCohort {
  id: string;
  kind: MoneyFlowCohortKind;
  key: string;
  label: string;
  era?: MoneyFlowEra;
  finish?: MoneyFlowFinish;
  special?: MoneyFlowSpecial;
  sampleSize: number;
  medianReturnPct: number | null;
  trimmedMeanReturnPct: number | null;
  breadthUpPct: number | null;
  upCount: number;
  downCount: number;
  confidence: MoneyFlowConfidence;
  /** Fraction of all positive movers that sit in this cohort (0–1). */
  shareOfGainers: number;
  /** Fraction of all negative movers that sit in this cohort (0–1). */
  shareOfLosers: number;
  /** Sum of (current − previous) across members; positive = capital into. */
  netDollarMove: number;
  rotation: MoneyFlowRotation;
  /** Collector-facing one-liner — prefer this over raw stats in UI. */
  story: string;
  /** Honest thin-data copy when confidence is thin / sample is empty. */
  dataNote: string | null;
  exemplars: MoneyFlowExemplar[];
}

export interface MoneyFlowHeadline {
  /** Short collector sentence, e.g. "Vintage PSA 10s are catching bids while modern raw cools." */
  summary: string;
  intoLabels: string[];
  outLabels: string[];
  windowDays: number;
  asOfDate: string | null;
  rawSampleSize: number;
  slabSampleSize: number;
  /** How many movers were dropped as bulk/common/sub-floor before aggregating. */
  filteredOutCount: number;
}

/** Compact header strip numbers derived from the same chase pool. */
export interface MoneyFlowMarketSummary {
  chasedSharePct: number;
  cooledSharePct: number;
  medianMovePct: number | null;
  risingCount: number;
  fallingCount: number;
  flatCount: number;
  trackedCount: number;
  strongestLabel: string | null;
  strongestMovePct: number | null;
  weakestLabel: string | null;
  weakestMovePct: number | null;
}

export interface MoneyFlowBreadthBucket {
  key: string;
  label: string;
  /** Inclusive lower bound; null = −∞ */
  minPct: number | null;
  /** Exclusive upper bound; null = +∞ */
  maxPct: number | null;
  count: number;
  sharePct: number;
}

export interface MoneyFlowInsight {
  id: string;
  text: string;
}

/** Individual chase print for the sortable movers list. */
export interface MoneyFlowMoverRow {
  id: string;
  productName: string;
  changePercent: number;
  currentPrice: number;
  previousPrice: number;
  absDollarMove: number;
  imageSmall: string | null;
  cardId: string | null;
  setName: string | null;
  finish: MoneyFlowFinish;
  era: MoneyFlowEra;
  segmentLabel: string;
}

export interface MoneyFlowResponse {
  days: number;
  date: string | null;
  generatedAt: string;
  headline: MoneyFlowHeadline;
  summary: MoneyFlowMarketSummary;
  breadthBuckets: MoneyFlowBreadthBucket[];
  insights: MoneyFlowInsight[];
  eras: MoneyFlowCohort[];
  finishes: MoneyFlowCohort[];
  eraFinishes: MoneyFlowCohort[];
  specials: MoneyFlowCohort[];
  /** Top INTO / OUT cohorts for the rotation board (already ranked). */
  rotationInto: MoneyFlowCohort[];
  rotationOut: MoneyFlowCohort[];
  /** Highest |median| × sample among non-empty cohorts (most active segments). */
  mostActive: MoneyFlowCohort[];
  topGainers: MoneyFlowMoverRow[];
  topLosers: MoneyFlowMoverRow[];
}

export type MoneyFlowWindowDays = 7 | 30 | 90;

export function normalizeMoneyFlowDays(days: number): MoneyFlowWindowDays {
  if (days === 90) return 90;
  if (days === 30) return 30;
  return 7;
}
