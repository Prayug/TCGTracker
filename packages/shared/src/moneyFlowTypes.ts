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
}

export interface MoneyFlowResponse {
  days: number;
  date: string | null;
  generatedAt: string;
  headline: MoneyFlowHeadline;
  eras: MoneyFlowCohort[];
  finishes: MoneyFlowCohort[];
  eraFinishes: MoneyFlowCohort[];
  specials: MoneyFlowCohort[];
  /** Top INTO / OUT cohorts for the rotation board (already ranked). */
  rotationInto: MoneyFlowCohort[];
  rotationOut: MoneyFlowCohort[];
}
