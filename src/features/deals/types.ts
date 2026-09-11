export type DealGame = 'pokemon' | 'onepiece';
export type RawCardCondition = 'nm' | 'lp' | 'mp' | 'hp' | 'damaged' | 'unknown';
export type DealListingType = 'bin' | 'auction';
export type DealCondition = 'raw' | 'graded';
export type DealSort = 'best' | 'discount_pct' | 'savings' | 'price' | 'market' | 'ending';
export type DealFeedTab = 'best' | 'raw' | 'graded' | 'auctions' | 'saved' | 'review';
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

export type MatchEvidenceCode =
  | 'exact_card_number'
  | 'set_match'
  | 'name_match'
  | 'language_match'
  | 'grade_match'
  | 'grading_company_match'
  | 'variant_finish_match';

export interface DealScoreBreakdown {
  dealScore: number;
  discountComponent: number;
  savingsComponent: number;
  marketValueComponent: number;
  matchComponent: number;
  liquidityComponent: number;
  freshnessComponent: number;
}

export interface Deal {
  listingId: string;
  listingUrl: string;
  listingTitle: string;
  listingImage: string | null;
  listingType: DealListingType;
  condition: string | null;
  sellerUsername: string | null;
  sellerFeedbackPct: number | null;
  sellerFeedbackScore: number | null;
  listingPrice: number;
  shipping: number;
  allInCost: number;
  currency: string;
  endDate: string | null;
  hoursRemaining: number | null;
  cardId: string;
  uniqueIdentifier: string;
  cardName: string;
  setId: string;
  setName: string;
  cardNumber: string | null;
  rarity: string | null;
  language: string;
  variantKey: string | null;
  cardImage: string | null;
  dealCondition: DealCondition;
  gradeLabel: string;
  grader: string | null;
  grade: string | null;
  cardCondition?: RawCardCondition;
  cardConditionLabel?: string;
  nmMarketValue?: number | null;
  conditionFactor?: number;
  marketValue: number;
  marketSource: string;
  marketUpdatedAt: string | null;
  marketStale: boolean;
  discountAmount: number;
  discountPercent: number;
  dealScore: number;
  scoreBreakdown: DealScoreBreakdown;
  matchConfidence: number;
  matchConfidenceTier: MatchConfidenceTier;
  matchEvidence: MatchEvidenceCode[];
  riskFlags: DealRiskFlag[];
  liquidityScore: number | null;
  liquidityLabel: string | null;
  maxBid: number | null;
  desiredAuctionMargin: number | null;
  feed: 'deal' | 'review';
  saved?: boolean;
}

export interface DealSummary {
  bestDeal: Deal | null;
  dealsFound: number;
  medianDiscount: number | null;
  potentialSavings: number;
}

export interface DealsMeta {
  ebayConfigured: boolean;
  cached: boolean;
  fetchedAt: string;
  cacheExpiresAt: string | null;
  error: 'not_configured' | 'unavailable' | 'rate_limited' | null;
  candidateStrategy: string;
  listingsScanned: number;
  listingsFetched: number;
  ebayTotal: number | null;
  scanning: boolean;
  retryInMs?: number;
}

export function ebayRetryRemainingMs(meta: DealsMeta | null | undefined, now = Date.now()): number {
  if (!meta?.retryInMs) return 0;
  const fetched = Date.parse(meta.fetchedAt);
  const start = Number.isFinite(fetched) ? fetched : now;
  return Math.max(0, start + meta.retryInMs - now);
}

export function isWaitingOnEbay(meta: DealsMeta | null | undefined, now = Date.now()): boolean {
  if (!meta?.scanning || meta.listingsScanned > 0) return false;
  return ebayRetryRemainingMs(meta, now) > 2_000;
}

export function formatEbayWait(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  if (sec >= 3600) {
    const hours = Math.ceil(sec / 3600);
    return hours === 1 ? 'about 1 hour' : `about ${hours} hours`;
  }
  if (sec >= 60) return `about ${Math.ceil(sec / 60)} min`;
  if (sec <= 0) return 'soon';
  return `${sec}s`;
}

export interface DealsResult {
  deals: Deal[];
  review: Deal[];
  summary: DealSummary;
  meta: DealsMeta;
}

export interface SavedEbayDeal {
  id: number;
  userId: number;
  game: DealGame;
  ebayListingId: string;
  cardId: string;
  uniqueIdentifier: string;
  listingUrl: string;
  listingPrice: number;
  shippingPrice: number;
  marketPriceSnapshot: number;
  discountPercentSnapshot: number;
  matchConfidence: number;
  listingEndTime: string | null;
  status: 'active' | 'ended' | 'sold' | 'dismissed';
  createdAt: string;
  updatedAt: string;
  currentMarketValue: number | null;
}

export interface DealFiltersState {
  minDiscount: number;
  minSavings: number;
  minMarketValue: number;
  listingType: DealListingType | 'all';
  gradingCompany: string;
  grade: string;
  set: string;
  freeShipping: boolean;
  sort: DealSort;
  desiredAuctionMargin: number;
  cardCondition: RawCardCondition | '';
}

export const DEFAULT_DEAL_FILTERS: DealFiltersState = {
  minDiscount: 12,
  minSavings: 5,
  minMarketValue: 10,
  listingType: 'all',
  gradingCompany: '',
  grade: '',
  set: '',
  freeShipping: false,
  sort: 'best',
  desiredAuctionMargin: 15,
  cardCondition: '',
};

export const RISK_FLAG_LABELS: Record<DealRiskFlag, string> = {
  possible_wrong_card: 'Possible wrong card',
  possible_wrong_grade: 'Possible wrong grade',
  possible_reprint: 'Possible reprint',
  possible_japanese_english_mismatch: 'Language mismatch',
  possible_proxy_card: 'Possible proxy',
  possible_custom_card: 'Possible custom card',
  possible_empty_box: 'Possible empty box',
  possible_digital_item: 'Digital item',
  possible_lot: 'Lot / bundle',
  possible_pack: 'Pack / sealed',
  possible_case_only: 'Case only',
  possible_damaged: 'Possible damage',
  possible_authenticity_issue: 'Authenticity warning',
  low_match_confidence: 'Low match confidence',
  unusually_low_price: 'Unusually low price',
  low_seller_feedback: 'Low seller feedback',
};

export const EVIDENCE_LABELS: Record<MatchEvidenceCode, string> = {
  exact_card_number: 'Exact card number',
  set_match: 'Matching set',
  name_match: 'Matching card name',
  language_match: 'Matching language',
  grade_match: 'Matching grade',
  grading_company_match: 'Matching grading company',
  variant_finish_match: 'Matching finish',
};
