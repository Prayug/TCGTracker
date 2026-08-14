/**
 * Deterministic eBay deal math. Listing all-in cost vs TCGTracker market value.
 * Not a prediction, buyout score, or AI recommendation.
 */

export const DEAL_THRESHOLDS = {
  raw: {
    minMarketValue: 10,
    minDiscountPercent: 12,
    minSavings: 5,
  },
  graded: {
    minMarketValue: 30,
    minDiscountPercent: 8,
    minSavings: 10,
  },
} as const;

export type DealCondition = 'raw' | 'graded';

export type MatchConfidenceTier = 'high' | 'medium' | 'low' | 'unresolved';

export type DealRiskFlag =
  | 'possible_wrong_card'
  | 'possible_wrong_grade'
  | 'possible_reprint'
  | 'possible_japanese_english_mismatch'
  | 'possible_proxy_card'
  | 'possible_custom_card'
  | 'possible_empty_box'
  | 'possible_digital_item'
  | 'possible_lot'
  | 'possible_pack'
  | 'possible_case_only'
  | 'possible_damaged'
  | 'possible_authenticity_issue'
  | 'low_match_confidence'
  | 'unusually_low_price'
  | 'low_seller_feedback';

/** Flags that must not appear in the default deal feed. */
export const SERIOUS_RISK_FLAGS: ReadonlySet<DealRiskFlag> = new Set([
  'possible_proxy_card',
  'possible_custom_card',
  'possible_empty_box',
  'possible_digital_item',
  'possible_lot',
  'possible_pack',
  'possible_case_only',
  'possible_authenticity_issue',
  'possible_wrong_grade',
  'possible_wrong_card',
]);

export const DEFAULT_MIN_MATCH_CONFIDENCE = 0.7;

export interface DealEconomics {
  listingPrice: number;
  shipping: number;
  allInCost: number;
  marketValue: number;
  discountAmount: number;
  discountPercent: number;
}

export interface DealThresholds {
  minMarketValue: number;
  minDiscountPercent: number;
  minSavings: number;
}

export interface DealScoreInput {
  discountPercent: number;
  discountAmount: number;
  marketValue: number;
  matchConfidence: number;
  liquidityScore: number | null;
  listingAgeHours: number | null;
  listingType: 'bin' | 'auction';
  hoursRemaining: number | null;
}

export interface DealScoreBreakdown {
  dealScore: number;
  discountComponent: number;
  savingsComponent: number;
  marketValueComponent: number;
  matchComponent: number;
  liquidityComponent: number;
  freshnessComponent: number;
}

const clamp = (n: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, n));

export function calculateAllInCost(listingPrice: number, shipping: number): number {
  const price = Number(listingPrice);
  const ship = Number(shipping);
  if (!Number.isFinite(price) || price < 0) return NaN;
  const shipSafe = Number.isFinite(ship) && ship > 0 ? ship : 0;
  return Math.round((price + shipSafe) * 100) / 100;
}

export function calculateDealEconomics(
  listingPrice: number,
  shipping: number,
  marketValue: number
): DealEconomics | null {
  const allInCost = calculateAllInCost(listingPrice, shipping);
  const market = Number(marketValue);
  if (!Number.isFinite(allInCost) || !Number.isFinite(market) || market <= 0) {
    return null;
  }
  const discountAmount = Math.round((market - allInCost) * 100) / 100;
  const discountPercent = Math.round((discountAmount / market) * 10000) / 100;
  return {
    listingPrice: Math.round(Number(listingPrice) * 100) / 100,
    shipping: Number.isFinite(Number(shipping)) && Number(shipping) > 0 ? Math.round(Number(shipping) * 100) / 100 : 0,
    allInCost,
    marketValue: Math.round(market * 100) / 100,
    discountAmount,
    discountPercent,
  };
}

export function thresholdsFor(condition: DealCondition): DealThresholds {
  return DEAL_THRESHOLDS[condition];
}

export function isEligibleDeal(
  economics: DealEconomics,
  condition: DealCondition,
  overrides?: Partial<DealThresholds>
): boolean {
  const defaults = thresholdsFor(condition);
  const minMarketValue = overrides?.minMarketValue ?? defaults.minMarketValue;
  const minDiscountPercent = overrides?.minDiscountPercent ?? defaults.minDiscountPercent;
  const minSavings = overrides?.minSavings ?? defaults.minSavings;
  if (economics.marketValue < minMarketValue) return false;
  if (economics.discountPercent < minDiscountPercent) return false;
  if (economics.discountAmount < minSavings) return false;
  return true;
}

/**
 * Max bid such that all-in stays `desiredDiscountPercent` below market.
 * maxBid + shipping = market * (1 - margin/100)
 */
export function calculateMaxBid(
  marketValue: number,
  shipping: number,
  desiredDiscountPercent: number
): number | null {
  const market = Number(marketValue);
  const ship = Number.isFinite(Number(shipping)) && Number(shipping) > 0 ? Number(shipping) : 0;
  const margin = Number(desiredDiscountPercent);
  if (!Number.isFinite(market) || market <= 0) return null;
  if (!Number.isFinite(margin) || margin < 0 || margin >= 100) return null;
  const targetAllIn = market * (1 - margin / 100);
  const maxBid = Math.round((targetAllIn - ship) * 100) / 100;
  if (maxBid <= 0) return null;
  return maxBid;
}

export function matchConfidenceTier(confidence: number): MatchConfidenceTier {
  if (!Number.isFinite(confidence) || confidence < 0.45) return 'unresolved';
  if (confidence < 0.7) return 'low';
  if (confidence < 0.85) return 'medium';
  return 'high';
}

export function hasSeriousRisk(flags: DealRiskFlag[]): boolean {
  return flags.some((f) => SERIOUS_RISK_FLAGS.has(f));
}

export function isUnusuallyLowPrice(discountPercent: number, condition: DealCondition): boolean {
  return condition === 'graded' ? discountPercent >= 50 : discountPercent >= 60;
}

/**
 * Explainable 0–100 score. Absolute savings and market value dominate so a
 * 75%-off bulk common cannot outrank a $100 save on a liquid $500 card.
 */
export function computeDealScore(input: DealScoreInput): DealScoreBreakdown {
  const discountComponent =
    Math.round(clamp(input.discountPercent / 40, 0, 1) * 40 * 10) / 10;

  const savingsComponent =
    Math.round(clamp(input.discountAmount / 200, 0, 1) * 25 * 10) / 10;

  let marketValueComponent = 0;
  if (input.marketValue >= 10) {
    const logSpan = Math.log10(input.marketValue / 10) / 3;
    marketValueComponent = Math.round(clamp(logSpan, 0, 1) * 15 * 10) / 10;
  }

  const matchComponent =
    Math.round(clamp(input.matchConfidence, 0, 1) * 15 * 10) / 10;

  const liq = input.liquidityScore != null && Number.isFinite(input.liquidityScore)
    ? input.liquidityScore
    : 35;
  const liquidityComponent = Math.round(clamp(liq / 100, 0, 1) * 10 * 10) / 10;

  let freshnessComponent = 2.5;
  if (input.listingType === 'auction' && input.hoursRemaining != null) {
    if (input.hoursRemaining <= 2) freshnessComponent = 5;
    else if (input.hoursRemaining <= 12) freshnessComponent = 4;
    else if (input.hoursRemaining <= 36) freshnessComponent = 3;
    else freshnessComponent = 1.5;
  } else if (input.listingAgeHours != null) {
    if (input.listingAgeHours <= 6) freshnessComponent = 5;
    else if (input.listingAgeHours <= 24) freshnessComponent = 4;
    else if (input.listingAgeHours <= 72) freshnessComponent = 3;
    else freshnessComponent = 1.5;
  }

  const dealScore = Math.round(
    clamp(
      discountComponent +
        savingsComponent +
        marketValueComponent +
        matchComponent +
        liquidityComponent +
        freshnessComponent,
      0,
      100
    )
  );

  return {
    dealScore,
    discountComponent,
    savingsComponent,
    marketValueComponent,
    matchComponent,
    liquidityComponent,
    freshnessComponent,
  };
}

export function gradesAreCompatible(
  listingGrader: string | null,
  listingGrade: string | null,
  marketGrader: string | null,
  marketGrade: string | null,
  listingIsGraded: boolean
): boolean {
  if (!listingIsGraded) {
    return !marketGrader || marketGrader === 'ungraded';
  }
  if (!listingGrader || !listingGrade || !marketGrader || !marketGrade) return false;
  if (marketGrader === 'ungraded') return false;
  return (
    listingGrader.toLowerCase() === marketGrader.toLowerCase() &&
    normalizeGrade(listingGrade) === normalizeGrade(marketGrade)
  );
}

export function normalizeGrade(grade: string): string {
  return grade.toLowerCase().replace(/\s+/g, ' ').replace(/\./g, '').trim();
}

export function defaultAuctionMargin(condition: DealCondition): number {
  return condition === 'graded' ? 8 : 15;
}

/** Deterministic window into a larger pool so each scan covers a new slice. */
export function rotateSlice<T>(items: T[], size: number, generation: number): T[] {
  if (items.length === 0 || size <= 0) return [];
  if (items.length <= size) return [...items];
  const start = (((generation * size) % items.length) + items.length) % items.length;
  const out: T[] = [];
  for (let i = 0; i < size; i += 1) {
    out.push(items[(start + i) % items.length]);
  }
  return out;
}

/** Catalog placeholders and copy-forward quotes must not mint deals. */
export const UNTRUSTED_DEAL_PRICE_SOURCES = new Set(['catalog_fallback']);

const PLACEHOLDER_MARKS = new Set([25, 50, 75, 100, 150, 200, 250, 500, 1000]);

export function isPlaceholderMarketPrice(
  price: number | null | undefined,
  volume: number | null | undefined
): boolean {
  if (price == null || !Number.isFinite(price)) return false;
  const vol = volume == null ? 0 : Number(volume);
  if (Number.isFinite(vol) && vol > 0) return false;
  return PLACEHOLDER_MARKS.has(Math.round(price));
}

export function isReliableMarketQuote(input: {
  source: string;
  volume: number | null | undefined;
  quoteAgeDays: number | null;
  plateauDays: number | null;
  price?: number | null;
}): boolean {
  if (UNTRUSTED_DEAL_PRICE_SOURCES.has((input.source || '').toLowerCase())) {
    return false;
  }
  if (isPlaceholderMarketPrice(input.price, input.volume)) {
    return false;
  }
  if (input.quoteAgeDays != null && input.quoteAgeDays > 45) {
    return false;
  }
  const plateau = input.plateauDays ?? input.quoteAgeDays;
  const volume = input.volume;
  if (volume == null || !Number.isFinite(Number(volume)) || Number(volume) <= 0) {
    return plateau != null && plateau <= 21;
  }
  return plateau == null || plateau <= 45;
}

/** Keep the strongest listing per card / grade so the feed is not 4x Golbat. */
export function pickBestDealPerCard<T extends {
  cardId: string;
  dealCondition: string;
  gradeLabel: string;
  dealScore: number;
}>(deals: T[]): T[] {
  const best = new Map<string, T>();
  for (const deal of deals) {
    const key = `${deal.cardId}|${deal.dealCondition}|${deal.gradeLabel}`;
    const prev = best.get(key);
    if (!prev || deal.dealScore > prev.dealScore) {
      best.set(key, deal);
    }
  }
  return [...best.values()];
}
