import { buildApiUrl } from '../config/env';

export interface GradedPriceEntry {
  grader: string;
  grade: string;
  price: number | null;
  soldListings: number;
}

export interface GradedPriceResult {
  cardId: string;
  cardName: string;
  setName: string;
  prices: GradedPriceEntry[];
  fetchedAt: string;
  cached: boolean;
  verified?: boolean;
  productId?: string | null;
  matchScore?: number | null;
  stale?: boolean;
  ageHours?: number | null;
}

export interface GradedSpreadRow {
  cardId: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  grader: string;
  grade: string;
  gradedPrice: number;
  rawPrice: number | null;
  premium: number | null;
  premiumPct: number | null;
  soldListings: number;
  fetchedAt: string | null;
  verified?: boolean;
  stale?: boolean;
  ageHours?: number | null;
  netAfterFee?: number | null;
  gradingFee?: number | null;
  matchScore?: number | null;
  historyPoints?: number | null;
  liquidityScore?: number | null;
  liquidityTier?: 'strong' | 'ok' | 'thin' | 'illiquid' | null;
  liquidityLabel?: string | null;
}

export interface GradedSpreadSummary {
  cardId: string;
  cardName: string | null;
  rawPrice: number | null;
  spreads: GradedSpreadRow[];
  psa10PremiumPct: number | null;
  bestPremiumPct: number | null;
}

export const fetchGradedPrices = async (params: {
  cardId: string;
  cardName: string;
  setId?: string;
  setName?: string;
  cardNumber?: string;
}): Promise<GradedPriceResult | null> => {
  const url = new URL(buildApiUrl('/api/cards/graded-prices'));
  url.searchParams.set('cardId', params.cardId);
  url.searchParams.set('cardName', params.cardName);
  if (params.setId) url.searchParams.set('setId', params.setId);
  if (params.setName) url.searchParams.set('setName', params.setName);
  if (params.cardNumber) url.searchParams.set('cardNumber', params.cardNumber);

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const json = await response.json();
    return (json?.data ?? json) as GradedPriceResult;
  } catch {
    return null;
  }
};

export const fetchGradedSpreads = async (cardId: string): Promise<GradedSpreadSummary | null> => {
  const url = new URL(buildApiUrl('/api/cards/graded-spreads'));
  url.searchParams.set('cardId', cardId);
  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const json = await response.json();
    return (json?.data ?? json) as GradedSpreadSummary;
  } catch {
    return null;
  }
};

export const fetchTopGradedPremiums = async (
  limit = 20,
  options?: { tradeableOnly?: boolean }
): Promise<GradedSpreadRow[]> => {
  const url = new URL(buildApiUrl('/api/cards/graded-spreads'));
  url.searchParams.set('limit', String(limit));
  if (options?.tradeableOnly) url.searchParams.set('tradeableOnly', '1');
  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return [];
    const json = await response.json();
    return (json?.data ?? []) as GradedSpreadRow[];
  } catch {
    return [];
  }
};

/** Batch PSA 10 spreads for watchlist / vault card ids. */
export const fetchPsa10SpreadsForCards = async (
  cardIds: string[]
): Promise<GradedSpreadRow[]> => {
  const ids = cardIds.filter(Boolean);
  if (ids.length === 0) return [];
  const url = new URL(buildApiUrl('/api/cards/graded-spreads'));
  url.searchParams.set('cardIds', ids.join(','));
  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return [];
    const json = await response.json();
    return (json?.data ?? []) as GradedSpreadRow[];
  } catch {
    return [];
  }
};

export interface PremiumMoverRow {
  cardId: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  gradedPrice: number;
  rawPrice: number;
  premiumPct: number;
  premiumPctPrev: number;
  premiumPctDelta: number;
  days: number;
  soldListings: number;
  verified: boolean;
  stale: boolean;
  ageHours: number | null;
  direction: 'expanding' | 'compressing';
  liquidityScore?: number;
  liquidityTier?: 'strong' | 'ok' | 'thin' | 'illiquid';
  liquidityLabel?: string;
}

export const fetchPremiumMovers = async (params?: {
  days?: number;
  limit?: number;
}): Promise<PremiumMoverRow[]> => {
  const url = new URL(buildApiUrl('/api/cards/graded-premium-movers'));
  if (params?.days != null) url.searchParams.set('days', String(params.days));
  if (params?.limit != null) url.searchParams.set('limit', String(params.limit));
  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return [];
    const json = await response.json();
    return (json?.data ?? []) as PremiumMoverRow[];
  } catch {
    return [];
  }
};

export interface CrossGraderArbRow {
  cardId: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  psa10: number;
  altGrader: string;
  altGrade: string;
  altPrice: number;
  spread: number;
  spreadPct: number;
  soldListings: number;
  verified: boolean;
  stale: boolean;
  ageHours: number | null;
  liquidityScore?: number;
  liquidityTier?: 'strong' | 'ok' | 'thin' | 'illiquid';
  liquidityLabel?: string;
}

export const fetchCrossGraderArbs = async (limit = 12): Promise<CrossGraderArbRow[]> => {
  const url = new URL(buildApiUrl('/api/cards/cross-grader-arbs'));
  url.searchParams.set('limit', String(limit));
  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return [];
    const json = await response.json();
    return (json?.data ?? []) as CrossGraderArbRow[];
  } catch {
    return [];
  }
};

export interface GradedPriceHistoryPoint {
  date: string;
  price: number;
  soldListings?: number;
}

export interface GradedPriceHistoryResult {
  cardId: string;
  grader: string;
  grade: string;
  points: GradedPriceHistoryPoint[];
}

export const fetchGradedPriceHistory = async (params: {
  cardId: string;
  grader: string;
  grade: string;
  days?: number;
}): Promise<GradedPriceHistoryResult | null> => {
  const url = new URL(buildApiUrl('/api/cards/graded-price-history'));
  url.searchParams.set('cardId', params.cardId);
  url.searchParams.set('grader', params.grader);
  url.searchParams.set('grade', params.grade);
  if (params.days != null) url.searchParams.set('days', String(params.days));

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const json = await response.json();
    return (json?.data ?? json) as GradedPriceHistoryResult;
  } catch {
    return null;
  }
};

export interface GradedPriceHistorySeries extends GradedPriceHistoryResult {
  latestPrice?: number | null;
}

export interface AllGradedPriceHistoryResult {
  cardId: string;
  series: GradedPriceHistorySeries[];
}

/** All grader/grade histories for one card (Collectr-style overlay). */
export const fetchAllGradedPriceHistory = async (params: {
  cardId: string;
  days?: number;
}): Promise<AllGradedPriceHistoryResult | null> => {
  const url = new URL(buildApiUrl('/api/cards/graded-price-history'));
  url.searchParams.set('cardId', params.cardId);
  if (params.days != null) url.searchParams.set('days', String(params.days));

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const json = await response.json();
    return (json?.data ?? json) as AllGradedPriceHistoryResult;
  } catch {
    return null;
  }
};

export interface GradeWorthinessRow {
  cardId: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  era?: string;
  imageSmall?: string | null;
  rawPrice: number;
  psa10Price: number;
  premium: number;
  premiumPct: number;
  multiple: number;
  gradingFee: number;
  gradingTier: string;
  costBasis: number;
  netProfit: number;
  netRoiPct: number;
  psa10Pop: number;
  psa9Pop?: number | null;
  psaTotal: number;
  gemRatePct: number;
  breakEvenGemRatePct?: number;
  soldListings: number;
  score: number;
  upliftScore: number;
  gemEaseScore: number;
  why: string;
  verified?: boolean;
  stale?: boolean;
  ageHours?: number | null;
  fetchedAt?: string | null;
}

export type GradeWorthinessSort =
  | 'score'
  | 'netProfit'
  | 'netRoi'
  | 'gemEase'
  | 'scarce';

export interface GradeWorthinessFeeContext {
  grader: string;
  floorFee: number;
  floorTier: string;
  note: string;
}

export interface GradeWorthinessEraFacet {
  id: string;
  label: string;
  count: number;
}

export interface GradeWorthinessSetFacet {
  setId: string;
  setName: string;
  era: string;
  count: number;
}

export interface GradeWorthinessResult {
  rows: GradeWorthinessRow[];
  count: number;
  candidates: number;
  scope: 'all' | 'vault';
  feeContext?: GradeWorthinessFeeContext;
  facets?: {
    eras: GradeWorthinessEraFacet[];
    sets: GradeWorthinessSetFacet[];
  };
  filters?: {
    eras: string[];
    setIds: string[];
  };
}

/** PSA 10 premium × gem-rate leaderboard. Pass cardIds to scope to a vault. */
export const fetchGradeWorthiness = async (params?: {
  limit?: number;
  cardIds?: string[];
  eras?: string[];
  setIds?: string[];
  sort?: GradeWorthinessSort;
}): Promise<GradeWorthinessResult | null> => {
  const limit = params?.limit ?? 40;
  const cardIds = params?.cardIds?.filter(Boolean) ?? [];
  const eras = params?.eras?.filter(Boolean) ?? [];
  const setIds = params?.setIds?.filter(Boolean) ?? [];
  const sort = params?.sort ?? 'score';

  try {
    if (cardIds.length > 0) {
      const url = new URL(buildApiUrl('/api/cards/grade-worthiness'));
      url.searchParams.set('limit', String(limit));
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cardIds, limit, eras, setIds, sort }),
      });
      if (!response.ok) return null;
      const json = await response.json();
      return (json?.data ?? json) as GradeWorthinessResult;
    }

    const url = new URL(buildApiUrl('/api/cards/grade-worthiness'));
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('sort', sort);
    if (eras.length) url.searchParams.set('eras', eras.join(','));
    if (setIds.length) url.searchParams.set('setIds', setIds.join(','));
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const json = await response.json();
    return (json?.data ?? json) as GradeWorthinessResult;
  } catch {
    return null;
  }
};

export type LiquidityTier = 'strong' | 'ok' | 'thin' | 'illiquid';

export interface SubmitVsBuyRow {
  cardId: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  imageSmall?: string | null;
  rawPrice: number;
  psa10Price: number;
  psa9Price: number | null;
  gemRatePct: number;
  psa10Pop: number;
  psaTotal: number;
  gradingFee: number;
  gradingTier: string;
  buyCost: number;
  submitCost: number;
  submitExpectedValue: number;
  submitEV: number;
  expectedCostPerGem: number | null;
  gemPathAdvantage: number | null;
  turnaroundDays: number;
  recommendation: 'buy' | 'submit' | 'toss_up';
  why: string;
  verified: boolean;
  stale: boolean;
  liquidityScore: number;
  liquidityTier: LiquidityTier;
}

export interface SubmitVsBuyResult {
  rows: SubmitVsBuyRow[];
  count: number;
  assumptions: {
    turnaroundDays: number;
    marketplaceFeePct: number;
    nonGemFallback: string;
  };
}

export const fetchSubmitVsBuy = async (params?: {
  limit?: number;
  cardIds?: string[];
}): Promise<SubmitVsBuyResult | null> => {
  const limit = params?.limit ?? 12;
  const cardIds = params?.cardIds?.filter(Boolean) ?? [];
  try {
    if (cardIds.length > 0) {
      const url = new URL(buildApiUrl('/api/cards/submit-vs-buy'));
      url.searchParams.set('limit', String(limit));
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardIds, limit }),
      });
      if (!response.ok) return null;
      const json = await response.json();
      return (json?.data ?? json) as SubmitVsBuyResult;
    }
    const url = new URL(buildApiUrl('/api/cards/submit-vs-buy'));
    url.searchParams.set('limit', String(limit));
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const json = await response.json();
    return (json?.data ?? json) as SubmitVsBuyResult;
  } catch {
    return null;
  }
};

export interface SetSlabHeatmapRow {
  setId: string;
  setName: string;
  era: string;
  eraLabel: string;
  cardCount: number;
  coveragePct: number;
  medianPremiumPct: number;
  medianPremiumPct30d: number | null;
  premiumPctDelta30d: number | null;
  medianGemRatePct: number | null;
  medianPsa10: number;
  medianRaw: number;
  heatScore: number;
}

export const fetchSetSlabHeatmap = async (params?: {
  limit?: number;
  minCards?: number;
}): Promise<SetSlabHeatmapRow[]> => {
  const url = new URL(buildApiUrl('/api/cards/set-slab-heatmap'));
  if (params?.limit != null) url.searchParams.set('limit', String(params.limit));
  if (params?.minCards != null) url.searchParams.set('minCards', String(params.minCards));
  try {
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!response.ok) return [];
    const json = await response.json();
    return (json?.data?.rows ?? json?.data ?? []) as SetSlabHeatmapRow[];
  } catch {
    return [];
  }
};

export interface PopShockRow {
  cardId: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  psa10Now: number;
  psa10Prev: number;
  psa10Delta: number;
  psa10DeltaPct: number;
  psaTotalNow: number | null;
  psaTotalPrev: number | null;
  premiumPct: number | null;
  premiumPctDelta: number | null;
  days: number;
  direction: 'flooding' | 'tightening';
  regime: 'scarcity_breaking' | 'scarcity_tightening' | 'neutral';
  why: string;
}

export const fetchPopRegime = async (params?: {
  days?: number;
  limit?: number;
}): Promise<PopShockRow[]> => {
  const url = new URL(buildApiUrl('/api/cards/pop-regime'));
  if (params?.days != null) url.searchParams.set('days', String(params.days));
  if (params?.limit != null) url.searchParams.set('limit', String(params.limit));
  try {
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!response.ok) return [];
    const json = await response.json();
    return (json?.data?.rows ?? json?.data ?? []) as PopShockRow[];
  } catch {
    return [];
  }
};

export interface GradeLadderStep {
  grade: string;
  price: number | null;
  premiumPct: number | null;
  popSharePct: number | null;
  popCount: number | null;
}

export interface GradeLadderRow {
  cardId: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  rawPrice: number;
  gradingFee: number;
  steps: GradeLadderStep[];
  expectedSlabValue: number | null;
  expectedNet: number | null;
  psa9Mispriced: boolean;
  psa9MispriceNote: string | null;
  gemRatePct: number | null;
  breakEvenGemRatePct: number | null;
  why: string;
}

export const fetchGradeLadder = async (params?: {
  limit?: number;
}): Promise<GradeLadderRow[]> => {
  const url = new URL(buildApiUrl('/api/cards/grade-ladder'));
  url.searchParams.set('limit', String(params?.limit ?? 12));
  try {
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!response.ok) return [];
    const json = await response.json();
    return (json?.data?.rows ?? json?.data ?? []) as GradeLadderRow[];
  } catch {
    return [];
  }
};

export interface CrackRegradeRow {
  cardId: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  psa10: number;
  altGrader: string;
  altGrade: string;
  altPrice: number;
  spread: number;
  spreadPct: number;
  resubmitFee: number;
  frictionCost: number;
  crossoverRiskPct: number;
  crackEV: number;
  action: 'crack_to_psa' | 'buy_psa' | 'hold_alt';
  why: string;
  soldListings: number;
  verified: boolean;
  stale: boolean;
  liquidityScore: number;
  liquidityTier: LiquidityTier;
}

export const fetchCrackRegrade = async (limit = 10): Promise<CrackRegradeRow[]> => {
  const url = new URL(buildApiUrl('/api/cards/crack-regrade'));
  url.searchParams.set('limit', String(limit));
  try {
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!response.ok) return [];
    const json = await response.json();
    return (json?.data?.rows ?? json?.data ?? []) as CrackRegradeRow[];
  } catch {
    return [];
  }
};

export interface SlabMark {
  cardId: string;
  grader: string;
  grade: string;
  price: number | null;
  rawPrice: number | null;
  premiumPct: number | null;
  verified: boolean;
  stale: boolean;
  liquidityScore: number;
  liquidityTier: LiquidityTier;
  soldListings: number;
}

export const fetchSlabMarks = async (
  lots: Array<{ cardId: string; grader: string; grade: string }>
): Promise<SlabMark[]> => {
  if (lots.length === 0) return [];
  try {
    const response = await fetch(buildApiUrl('/api/cards/slab-marks'), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ lots }),
    });
    if (!response.ok) return [];
    const json = await response.json();
    return (json?.data ?? []) as SlabMark[];
  } catch {
    return [];
  }
};
