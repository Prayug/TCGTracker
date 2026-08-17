import { getDb } from '../db/database';
import { dbAll, dbGet, dbRun } from '../db/promisified';
import { logger } from '../utils/logger';
import { getLatestCanonicalPrice } from './canonicalPriceService';
import {
  canonicalGradedHistoryVariantKey,
  enrichGradedPrice,
  type GradedPrice,
} from './gradedPriceService';
import {
  CCG_INDIVIDUAL_CARDS_CATEGORY,
  EBAY_BROWSE_MAX_OFFSET,
  EBAY_BROWSE_PAGE_SIZE,
  getEbayCooldownRemainingMs,
  isEbayBrowseConfigured,
  searchEbayListings,
  type EbayListingSummary,
  type EbaySearchError,
} from './ebayBrowseClient';
import { formatGradeLabel, listingIsNonEnglish, parseEbayListingTitle } from './ebayListingParser';
import {
  applyConditionToNmMarket,
  formatRawGradeLabel,
  parseRawCardCondition,
} from '../utils/cardCondition';
import {
  pickBestListingMatch,
  isEnglishCatalogCard,
  type CatalogCardRef,
  type ListingMatchResult,
  type MatchEvidenceCode,
} from './ebayDealMatcher';
import { scoreLiquidity } from './liquidityScore';
import {
  calculateDealEconomics,
  calculateMaxBid,
  computeDealScore,
  defaultAuctionMargin,
  hasSeriousRisk,
  isEligibleDeal,
  isReliableMarketQuote,
  isUnusuallyLowPrice,
  matchConfidenceTier,
  pickBestDealPerCard,
  DEAL_THRESHOLDS,
  DEFAULT_MIN_MATCH_CONFIDENCE,
  type DealCondition,
  type DealRiskFlag,
  type DealThresholds,
  type MatchConfidenceTier,
} from '../utils/dealScoring';
import { normalizeCardNumber, pcFinishSearchTerms } from './priceChartingClient';

export type DealGame = 'pokemon' | 'onepiece';
export type DealSort = 'best' | 'discount_pct' | 'savings' | 'price' | 'market' | 'ending';
export type DealListingTypeFilter = 'all' | 'bin' | 'auction';
export type DealConditionFilter = 'all' | 'raw' | 'graded';

const POOL_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_PRICE_AGE_DAYS = 45;
const WARN_PRICE_AGE_DAYS = 14;
const CANDIDATE_POOL_PER_BAND = 30;
const RATE_LIMIT_WAIT_MS = 15_000;
const RATE_LIMIT_CONSECUTIVE_STOP = 3;
const SCAN_CACHE_PERSIST_MS = 30_000;
const SCAN_CACHE_MAX_DEALS = 2500;

export interface DealQuery {
  game: DealGame;
  cardId?: string;
  condition?: DealConditionFilter;
  listingType?: DealListingTypeFilter;
  minDiscount?: number;
  minSavings?: number;
  minMarketValue?: number;
  gradingCompany?: string;
  grade?: string;
  set?: string;
  rarity?: string;
  minPrice?: number;
  maxPrice?: number;
  freeShipping?: boolean;
  language?: 'en' | 'ja';
  sort?: DealSort;
  includeReview?: boolean;
  desiredAuctionMargin?: number;
  refresh?: boolean;
}

export interface DealCardPayload {
  listingId: string;
  listingUrl: string;
  listingTitle: string;
  listingImage: string | null;
  listingType: 'bin' | 'auction';
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
  cardCondition: 'nm' | 'lp' | 'mp' | 'hp' | 'damaged' | 'unknown';
  cardConditionLabel: string;
  nmMarketValue: number | null;
  conditionFactor: number;
  marketValue: number;
  marketSource: string;
  marketUpdatedAt: string | null;
  marketStale: boolean;
  discountAmount: number;
  discountPercent: number;
  dealScore: number;
  scoreBreakdown: ReturnType<typeof computeDealScore>;
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
  bestDeal: DealCardPayload | null;
  dealsFound: number;
  medianDiscount: number | null;
  potentialSavings: number;
}

export interface DealsResult {
  deals: DealCardPayload[];
  review: DealCardPayload[];
  summary: DealSummary;
  meta: {
    ebayConfigured: boolean;
    cached: boolean;
    fetchedAt: string;
    cacheExpiresAt: string | null;
    error: EbaySearchError | null;
    candidateStrategy: string;
    listingsScanned: number;
    listingsFetched: number;
    ebayTotal: number | null;
    scanning: boolean;
    retryInMs?: number;
  };
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

interface EvaluatedListing {
  deal: DealCardPayload;
}

interface CandidateCard extends CatalogCardRef {
  marketHint?: number;
  gradedSearch?: boolean;
}

const recentDealPool = new Map<string, { deal: DealCardPayload; seenAt: number }>();

export async function ensureSavedDealsTable(): Promise<void> {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS saved_ebay_deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      game TEXT NOT NULL,
      ebay_listing_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      unique_identifier TEXT NOT NULL,
      listing_url TEXT NOT NULL,
      listing_price REAL NOT NULL,
      shipping_price REAL NOT NULL DEFAULT 0,
      market_price_snapshot REAL NOT NULL,
      discount_percent_snapshot REAL NOT NULL,
      match_confidence REAL NOT NULL,
      listing_end_time TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, ebay_listing_id)
    )
  `);
  await dbRun(
    'CREATE INDEX IF NOT EXISTS idx_saved_ebay_deals_user ON saved_ebay_deals(user_id, status, updated_at DESC)'
  );
  await ensureDealScanCacheTable();
}

async function ensureDealScanCacheTable(): Promise<void> {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS ebay_deal_scan_cache (
      cache_key TEXT PRIMARY KEY,
      game TEXT NOT NULL,
      card_id TEXT,
      listing_type TEXT NOT NULL,
      deals_json TEXT NOT NULL,
      listings_scanned INTEGER NOT NULL DEFAULT 0,
      listings_fetched INTEGER NOT NULL DEFAULT 0,
      ebay_total INTEGER,
      error TEXT,
      updated_at INTEGER NOT NULL
    )
  `);
}

const daysBetween = (dateIso: string): number | null => {
  const day = dateIso.length >= 10 ? dateIso.slice(0, 10) : dateIso;
  const ms = new Date(`${day}T00:00:00Z`).getTime();
  if (!Number.isFinite(ms)) return null;
  return (Date.now() - ms) / 86400000;
};

const hoursUntil = (iso: string | null): number | null => {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return ms / 3600000;
};

const hoursSince = (iso: string | null): number | null => {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / 3600000;
};

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
  }
  return sorted[mid];
};

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  };
  const count = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: count }, () => worker()));
  return results;
}

function cacheKey(game: DealGame, cardId?: string, listingType?: DealListingTypeFilter): string {
  return `${game}|${cardId || '*'}|${listingType || 'all'}`;
}

function marketPoolKey(game: DealGame, listingId: string): string {
  return `m:${game}:${listingId}`;
}

function cardPoolKey(game: DealGame, cardId: string, listingId: string): string {
  return `c:${game}:${cardId}:${listingId}`;
}

function mergeDealPool(game: DealGame, evaluated: EvaluatedListing[]): EvaluatedListing[] {
  const now = Date.now();
  const prefix = `m:${game}:`;
  for (const row of evaluated) {
    recentDealPool.set(marketPoolKey(game, row.deal.listingId), { deal: row.deal, seenAt: now });
  }
  for (const [key, value] of recentDealPool) {
    if (!key.startsWith(prefix)) continue;
    const ended = value.deal.hoursRemaining != null && value.deal.hoursRemaining < 0;
    if (ended || now - value.seenAt > POOL_TTL_MS) {
      recentDealPool.delete(key);
    }
  }
  const combined = new Map<string, EvaluatedListing>();
  for (const [key, value] of recentDealPool) {
    if (!key.startsWith(prefix)) continue;
    combined.set(value.deal.listingId, { deal: value.deal });
  }
  for (const row of evaluated) {
    combined.set(row.deal.listingId, row);
  }
  return [...combined.values()].sort((a, b) => b.deal.dealScore - a.deal.dealScore);
}

function poolEntriesForState(state: CrawlState): Array<{ deal: DealCardPayload; seenAt: number }> {
  const prefix = state.cardId ? `c:${state.game}:${state.cardId}:` : `m:${state.game}:`;
  const items: Array<{ deal: DealCardPayload; seenAt: number }> = [];
  for (const [key, value] of recentDealPool) {
    if (!key.startsWith(prefix)) continue;
    items.push(value);
  }
  items.sort((a, b) => b.deal.dealScore - a.deal.dealScore);
  return items.slice(0, SCAN_CACHE_MAX_DEALS);
}

async function persistScanCache(state: CrawlState, force = false): Promise<void> {
  if (crawlStates.get(state.key) !== state) return;
  const entries = poolEntriesForState(state);
  if (state.listingsScanned === 0 && entries.length === 0) return;
  const now = Date.now();
  const last = lastScanPersistAt.get(state.key) ?? 0;
  if (!force && now - last < SCAN_CACHE_PERSIST_MS) return;
  lastScanPersistAt.set(state.key, now);
  try {
    await ensureDealScanCacheTable();
    await dbRun(
      `INSERT INTO ebay_deal_scan_cache (
         cache_key, game, card_id, listing_type, deals_json,
         listings_scanned, listings_fetched, ebay_total, error, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         deals_json = excluded.deals_json,
         listings_scanned = excluded.listings_scanned,
         listings_fetched = excluded.listings_fetched,
         ebay_total = excluded.ebay_total,
         error = excluded.error,
         updated_at = excluded.updated_at`,
      [
        state.key,
        state.game,
        state.cardId || null,
        state.listingType,
        JSON.stringify(entries),
        state.listingsScanned,
        state.listingsFetched,
        state.ebayTotal,
        state.error,
        now,
      ]
    );
  } catch (error) {
    logger.warn('Failed to persist eBay deal scan cache', { error: (error as Error).message });
  }
}

interface ScanCacheRow {
  cache_key: string;
  game: DealGame;
  card_id: string | null;
  listing_type: DealListingTypeFilter;
  deals_json: string;
  listings_scanned: number;
  listings_fetched: number;
  ebay_total: number | null;
  error: EbaySearchError | null;
  updated_at: number;
}

async function hydrateScanCache(key: string): Promise<CrawlState | null> {
  await ensureDealScanCacheTable();
  const row = await dbGet<ScanCacheRow>(
    'SELECT * FROM ebay_deal_scan_cache WHERE cache_key = ?',
    [key]
  );
  if (!row || Date.now() - row.updated_at > POOL_TTL_MS) return null;
  let items: Array<{ deal: DealCardPayload; seenAt: number }> = [];
  try {
    const parsed = JSON.parse(row.deals_json) as Array<{ deal: DealCardPayload; seenAt: number }>;
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    return null;
  }
  if (items.length === 0 && (row.listings_scanned || 0) === 0) return null;
  const cardId = row.card_id || undefined;
  for (const item of items) {
    if (!item?.deal?.listingId) continue;
    const poolKey = cardId
      ? cardPoolKey(row.game, cardId, item.deal.listingId)
      : marketPoolKey(row.game, item.deal.listingId);
    recentDealPool.set(poolKey, {
      deal: item.deal,
      seenAt: item.seenAt || row.updated_at,
    });
  }
  const state: CrawlState = {
    key,
    game: row.game,
    cardId,
    listingType: row.listing_type,
    generation: 0,
    running: false,
    done: true,
    error: row.error,
    listingsSeen: new Set(),
    listingsFetched: row.listings_fetched,
    listingsScanned: row.listings_scanned,
    ebayTotal: row.ebay_total,
    startedAt: row.updated_at,
    updatedAt: row.updated_at,
  };
  crawlStates.set(key, state);
  logger.info('Hydrated eBay deal scan cache', {
    key,
    deals: items.length,
    scanned: row.listings_scanned,
  });
  return state;
}

function mappingRowToCard(row: {
  cardId: string;
  cardName: string;
  matchName?: string | null;
  setId: string;
  setName: string;
  cardNumber?: string | null;
  rarity?: string | null;
  variantKey?: string | null;
  uniqueIdentifier: string;
  language?: string | null;
  imageSmall?: string | null;
  imageLarge?: string | null;
}): CatalogCardRef {
  return {
    cardId: row.cardId,
    cardName: row.cardName,
    matchName: row.matchName,
    setId: row.setId,
    setName: row.setName,
    cardNumber: row.cardNumber,
    rarity: row.rarity,
    variantKey: row.variantKey || 'normal',
    uniqueIdentifier: row.uniqueIdentifier,
    language: row.language || 'en',
    imageSmall: row.imageSmall,
    imageLarge: row.imageLarge,
  };
}

const CANDIDATE_CACHE_MS = 10 * 60 * 1000;
let pokemonRawCandidateCache: { at: number; cards: CandidateCard[] } | null = null;
let pokemonGradedCandidateCache: { at: number; cards: CandidateCard[] } | null = null;

async function loadPokemonRawCandidates(limit: number): Promise<CandidateCard[]> {
  if (pokemonRawCandidateCache && Date.now() - pokemonRawCandidateCache.at < CANDIDATE_CACHE_MS) {
    return pokemonRawCandidateCache.cards;
  }
  const sql = `
    SELECT cardId, cardName, matchName, setId, setName, cardNumber, rarity,
           variantKey, uniqueIdentifier, language, imageSmall, imageLarge, marketHint
    FROM (
      SELECT cm.cardId, cm.cardName, cm.matchName, cm.setId, cm.setName, cm.cardNumber,
             cm.rarity, cm.variantKey, cm.uniqueIdentifier, cm.language,
             cm.imageSmall, cm.imageLarge, c.price AS marketHint, c.volume,
             ROW_NUMBER() OVER (
               PARTITION BY cm.cardId
               ORDER BY CASE
                 WHEN LOWER(COALESCE(cm.variantKey, 'normal')) IN ('normal', 'holofoil', 'holo') THEN 0
                 ELSE 1
               END, c.price DESC
             ) AS rn
      FROM card_mappings cm
      INNER JOIN (
        SELECT uniqueIdentifier, price, volume, source,
               ROW_NUMBER() OVER (PARTITION BY uniqueIdentifier ORDER BY date DESC) AS prn
        FROM canonical_price_history
      ) c ON c.uniqueIdentifier = cm.uniqueIdentifier AND c.prn = 1
      WHERE c.price >= ? AND c.price <= ?
        AND COALESCE(cm.language, 'en') = 'en'
        AND COALESCE(cm.cardNumber, '') != ''
        AND c.source != 'catalog_fallback'
        AND NOT (
          COALESCE(c.volume, 0) <= 0
          AND c.price IN (25, 50, 75, 100, 150, 200, 250, 500, 1000)
        )
    )
    AS ranked
    WHERE rn = 1
    ORDER BY COALESCE(volume, 0) DESC, marketHint DESC
    LIMIT ?`;

  const bands = await Promise.all([
    dbAll<CandidateCard>(sql, [15, 50, CANDIDATE_POOL_PER_BAND]),
    dbAll<CandidateCard>(sql, [50, 150, CANDIDATE_POOL_PER_BAND]),
    dbAll<CandidateCard>(sql, [150, 600, CANDIDATE_POOL_PER_BAND]),
  ]);
  const seen = new Set<string>();
  const pooled: CandidateCard[] = [];
  for (const row of bands.flat()) {
    const card = mappingRowToCard(row);
    if (seen.has(card.cardId)) continue;
    seen.add(card.cardId);
    pooled.push(card);
  }
  if (pooled.length < limit) {
    const fallback = await dbAll<CandidateCard>(sql, [
      DEAL_THRESHOLDS.raw.minMarketValue,
      2000,
      limit,
    ]);
    for (const row of fallback) {
      const card = mappingRowToCard(row);
      if (seen.has(card.cardId)) continue;
      seen.add(card.cardId);
      pooled.push(card);
    }
  }
  pokemonRawCandidateCache = { at: Date.now(), cards: pooled };
  return pooled;
}

async function loadPokemonGradedCandidates(limit: number): Promise<CandidateCard[]> {
  if (pokemonGradedCandidateCache && Date.now() - pokemonGradedCandidateCache.at < CANDIDATE_CACHE_MS) {
    return pokemonGradedCandidateCache.cards;
  }
  const rows = await dbAll<CandidateCard>(
    `SELECT cardId, cardName, matchName, setId, setName, cardNumber, rarity,
            variantKey, uniqueIdentifier, language, imageSmall, imageLarge, marketHint
     FROM (
       SELECT cm.cardId, cm.cardName, cm.matchName, cm.setId, cm.setName, cm.cardNumber,
              cm.rarity, cm.variantKey, cm.uniqueIdentifier, cm.language,
              cm.imageSmall, cm.imageLarge, gp.price AS marketHint,
              ROW_NUMBER() OVER (
                PARTITION BY cm.cardId
                ORDER BY CASE
                  WHEN LOWER(COALESCE(cm.variantKey, 'normal')) IN ('normal', 'holofoil', 'holo') THEN 0
                  ELSE 1
                END
              ) AS rn
       FROM card_mappings cm
       INNER JOIN (
         SELECT cardId, MAX(price) AS price
         FROM graded_prices
         WHERE COALESCE(verified, 0) = 1
           AND LOWER(grader) = 'psa'
           AND LOWER(grade) = '10'
           AND price >= 40 AND price <= 2500
         GROUP BY cardId
       ) gp ON gp.cardId = cm.cardId
       WHERE COALESCE(cm.language, 'en') = 'en'
         AND COALESCE(cm.cardNumber, '') != ''
     )
     AS ranked
     WHERE rn = 1
     ORDER BY marketHint DESC
     LIMIT ?`,
    [limit]
  );
  const cards = rows.map((row) => ({ ...mappingRowToCard(row), gradedSearch: true }));
  pokemonGradedCandidateCache = { at: Date.now(), cards };
  return cards;
}

async function loadPokemonCandidates(): Promise<CandidateCard[]> {
  const rawPool = await loadPokemonRawCandidates(40);
  const gradedPool = await loadPokemonGradedCandidates(20);
  const seen = new Set<string>();
  const out: CandidateCard[] = [];
  for (const card of [...rawPool, ...gradedPool]) {
    if (seen.has(card.cardId)) continue;
    seen.add(card.cardId);
    out.push(card);
  }
  return out;
}

async function loadPokemonCardTargets(cardId: string): Promise<CandidateCard[]> {
  const rows = await dbAll<CandidateCard>(
    `SELECT cardId, cardName, matchName, setId, setName, cardNumber, rarity,
            variantKey, uniqueIdentifier, language, imageSmall, imageLarge
     FROM card_mappings
     WHERE cardId = ?
     ORDER BY updatedAt DESC
     LIMIT 12`,
    [cardId]
  );
  return rows.map(mappingRowToCard);
}

const pokemonLookupMemo = new Map<string, Promise<CatalogCardRef[]>>();

async function lookupPokemonByNumber(collectorNumber: string, language?: string | null): Promise<CatalogCardRef[]> {
  const normalized = normalizeCardNumber(collectorNumber);
  if (!normalized) return [];
  const lang = language && language !== 'unknown' ? language : null;
  const memoKey = `${normalized}::${lang || ''}`;
  const cached = pokemonLookupMemo.get(memoKey);
  if (cached) return cached;
  const pending = lookupPokemonByNumberUncached(normalized, collectorNumber, lang);
  pokemonLookupMemo.set(memoKey, pending);
  return pending;
}

async function lookupPokemonByNumberUncached(
  normalized: string,
  collectorNumber: string,
  lang: string | null
): Promise<CatalogCardRef[]> {
  const rows = await dbAll<CatalogCardRef>(
    `SELECT cardId, cardName, matchName, setId, setName, cardNumber, rarity,
            variantKey, uniqueIdentifier, language, imageSmall, imageLarge
     FROM card_mappings
     WHERE (
       REPLACE(LOWER(COALESCE(cardNumber, '')), '-', '') = ?
       OR LOWER(COALESCE(cardNumber, '')) LIKE ?
       OR LOWER(COALESCE(cardNumber, '')) = ?
     )
       AND (? IS NULL OR COALESCE(language, 'en') = ?)
     LIMIT 80`,
    [normalized, `${normalized}/%`, collectorNumber.toLowerCase(), lang, lang]
  );
  return rows
    .filter((row) => normalizeCardNumber(row.cardNumber || '') === normalized)
    .map(mappingRowToCard);
}

async function loadOnePieceCandidates(limit: number): Promise<CandidateCard[]> {
  const rows = await dbAll<{
    catalogId: string;
    cardName: string;
    setId: string;
    setName: string;
    cardSetId: string;
    rarity: string | null;
    imageUrl: string | null;
    marketPrice: number | null;
  }>(
    `SELECT catalogId, cardName, setId, setName, cardSetId, rarity, imageUrl, marketPrice
     FROM onepiece_catalog
     WHERE marketPrice >= ? AND marketPrice <= ?
       AND COALESCE(cardSetId, '') != ''
     ORDER BY marketPrice DESC
     LIMIT ?`,
    [15, 400, Math.max(limit, 40)]
  );
  return rows.map((row) => ({
    cardId: row.catalogId,
    cardName: row.cardName,
    setId: row.setId,
    setName: row.setName,
    cardNumber: row.cardSetId,
    rarity: row.rarity,
    variantKey: 'normal',
    uniqueIdentifier: row.catalogId,
    language: 'en',
    imageSmall: row.imageUrl,
    imageLarge: row.imageUrl,
    marketHint: row.marketPrice ?? undefined,
  }));
}

async function loadOnePieceCardTargets(cardId: string): Promise<CandidateCard[]> {
  const row = await dbGet<{
    catalogId: string;
    cardName: string;
    setId: string;
    setName: string;
    cardSetId: string;
    rarity: string | null;
    imageUrl: string | null;
    marketPrice: number | null;
  }>(
    `SELECT catalogId, cardName, setId, setName, cardSetId, rarity, imageUrl, marketPrice
     FROM onepiece_catalog WHERE catalogId = ?`,
    [cardId]
  );
  if (!row) return [];
  return [
    {
      cardId: row.catalogId,
      cardName: row.cardName,
      setId: row.setId,
      setName: row.setName,
      cardNumber: row.cardSetId,
      rarity: row.rarity,
      variantKey: 'normal',
      uniqueIdentifier: row.catalogId,
      language: 'en',
      imageSmall: row.imageUrl,
      imageLarge: row.imageUrl,
      marketHint: row.marketPrice ?? undefined,
    },
  ];
}

const onePieceLookupMemo = new Map<string, Promise<CatalogCardRef[]>>();

async function lookupOnePieceByNumber(cardSetId: string): Promise<CatalogCardRef[]> {
  const memoKey = cardSetId.toUpperCase();
  const cached = onePieceLookupMemo.get(memoKey);
  if (cached) return cached;
  const pending = lookupOnePieceByNumberUncached(memoKey);
  onePieceLookupMemo.set(memoKey, pending);
  return pending;
}

async function lookupOnePieceByNumberUncached(cardSetId: string): Promise<CatalogCardRef[]> {
  const rows = await dbAll<{
    catalogId: string;
    cardName: string;
    setId: string;
    setName: string;
    cardSetId: string;
    rarity: string | null;
    imageUrl: string | null;
  }>(
    `SELECT catalogId, cardName, setId, setName, cardSetId, rarity, imageUrl
     FROM onepiece_catalog
     WHERE UPPER(cardSetId) = ?
     LIMIT 12`,
    [cardSetId.toUpperCase()]
  );
  return rows.map((row) => ({
    cardId: row.catalogId,
    cardName: row.cardName,
    setId: row.setId,
    setName: row.setName,
    cardNumber: row.cardSetId,
    rarity: row.rarity,
    variantKey: 'normal',
    uniqueIdentifier: row.catalogId,
    language: 'en',
    imageSmall: row.imageUrl,
    imageLarge: row.imageUrl,
  }));
}

function buildSearchQuery(card: CandidateCard, game: DealGame): string {
  const name = card.matchName || card.cardName;
  const finish = game === 'pokemon' ? pcFinishSearchTerms(card.variantKey) : '';
  const gameWord = game === 'onepiece' ? 'One Piece' : 'Pokemon';
  return [
    gameWord,
    name,
    card.setName,
    card.cardNumber ? `#${card.cardNumber}` : '',
    finish,
    card.gradedSearch ? 'PSA 10' : '',
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const POKEMON_DISCOVERY_POOL = [
  'Pokemon TCG',
  'Pokemon VMAX',
  'Pokemon VSTAR',
  'Pokemon illustration rare',
  'Pokemon special illustration rare',
  'Pokemon alt art',
  'Pokemon gold star',
  'Pokemon full art',
  'Pokemon secret rare',
  'Pokemon rainbow rare',
  'Pokemon 1st edition holo',
  'Pokemon trainer gallery',
  'Pokemon promo holo',
  'Pokemon shining',
  'Pokemon radiant rare',
  'Pokemon character rare',
];

const ONEPIECE_DISCOVERY_POOL = [
  'One Piece TCG',
  'One Piece alternate art',
  'One Piece manga rare',
  'One Piece SEC',
  'One Piece SP card',
  'One Piece parallel',
  'One Piece treasure rare',
  'One Piece super rare',
  'One Piece leader alternate',
  'One Piece promo foil',
];

interface CrawlQuery {
  query: string;
  sort: 'newlyListed' | 'price' | 'endingSoonest';
  buyingOptions: 'FIXED_PRICE' | 'AUCTION' | 'ALL';
  priceMin?: number;
  priceMax?: number;
  targets?: CandidateCard[] | null;
}

interface CrawlState {
  key: string;
  game: DealGame;
  cardId?: string;
  listingType: DealListingTypeFilter;
  generation: number;
  running: boolean;
  done: boolean;
  error: EbaySearchError | null;
  listingsSeen: Set<string>;
  listingsFetched: number;
  listingsScanned: number;
  ebayTotal: number | null;
  startedAt: number;
  updatedAt: number;
}

const PRICE_BANDS: Array<{ min: number; max?: number }> = [
  { min: 10, max: 25 },
  { min: 25, max: 50 },
  { min: 50, max: 100 },
  { min: 100, max: 250 },
  { min: 250, max: 500 },
  { min: 500, max: 2000 },
  { min: 2000 },
  { min: 0, max: 10 },
];

const crawlStates = new Map<string, CrawlState>();
const crawlRuns = new Map<string, Promise<void>>();
const lastScanPersistAt = new Map<string, number>();
const scheduledStarts = new Map<string, ReturnType<typeof setTimeout>>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function marketplaceQueryPlan(
  game: DealGame,
  listingType: DealListingTypeFilter
): CrawlQuery[] {
  const gameWord = game === 'onepiece' ? 'One Piece' : 'Pokemon';
  const plan: CrawlQuery[] = [];
  const includeBin = listingType !== 'auction';
  const includeAuction = listingType !== 'bin';

  // BIN first: those listings can actually clear the deal bar. Auctions and
  // discovery queries come after so a rate limit doesn't burn the budget on
  // $0–$10 junk and keyword extras.
  if (includeBin) {
    for (const band of PRICE_BANDS) {
      plan.push({
        query: gameWord,
        sort: 'newlyListed',
        buyingOptions: 'FIXED_PRICE',
        priceMin: band.min,
        priceMax: band.max,
      });
    }
  }
  if (includeAuction) {
    for (const band of PRICE_BANDS) {
      plan.push({
        query: gameWord,
        sort: 'endingSoonest',
        buyingOptions: 'AUCTION',
        priceMin: band.min,
        priceMax: band.max,
      });
    }
  }

  const extras = game === 'onepiece' ? ONEPIECE_DISCOVERY_POOL : POKEMON_DISCOVERY_POOL;
  for (const query of extras) {
    plan.push({
      query,
      sort: 'newlyListed',
      buyingOptions: listingType === 'bin' ? 'FIXED_PRICE' : listingType === 'auction' ? 'AUCTION' : 'ALL',
    });
  }

  if (game === 'pokemon') {
    for (const query of ['Pokemon PSA', 'Pokemon BGS', 'Pokemon CGC']) {
      plan.push({ query, sort: 'newlyListed', buyingOptions: 'ALL' });
    }
  }

  return plan;
}

async function cardWatchQueryPlan(game: DealGame, cardId: string): Promise<CrawlQuery[]> {
  const targets =
    game === 'onepiece' ? await loadOnePieceCardTargets(cardId) : await loadPokemonCardTargets(cardId);
  const englishTargets = targets.filter(isEnglishCatalogCard);
  if (englishTargets.length === 0) return [];
  return englishTargets.map((card) => ({
    query: buildSearchQuery(card, game),
    sort: 'newlyListed' as const,
    buyingOptions: 'ALL' as const,
    targets: englishTargets,
  }));
}

function emptyCrawlState(
  key: string,
  game: DealGame,
  cardId: string | undefined,
  listingType: DealListingTypeFilter
): CrawlState {
  return {
    key,
    game,
    cardId,
    listingType,
    generation: (crawlStates.get(key)?.generation ?? 0) + 1,
    running: true,
    done: false,
    error: null,
    listingsSeen: new Set(),
    listingsFetched: 0,
    listingsScanned: 0,
    ebayTotal: null,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
}

async function evaluatePage(
  state: CrawlState,
  listings: EbayListingSummary[],
  targets: CandidateCard[] | null
): Promise<void> {
  const fresh = listings.filter((listing) => !state.listingsSeen.has(listing.listingId));
  for (const listing of fresh) state.listingsSeen.add(listing.listingId);
  state.listingsFetched += fresh.length;
  state.updatedAt = Date.now();

  await mapPool(fresh, 6, async (listing) => {
    if (!state.running) return null;
    try {
      const deal = await evaluateListing(listing, state.game, targets, undefined);
      if (deal) {
        if (state.cardId) {
          recentDealPool.set(cardPoolKey(state.game, state.cardId, deal.listingId), {
            deal,
            seenAt: Date.now(),
          });
        } else {
          mergeDealPool(state.game, [{ deal }]);
        }
      }
      return deal;
    } catch (err) {
      logger.warn('Deal evaluation failed', {
        listingId: listing.listingId,
        error: (err as Error).message,
      });
      return null;
    } finally {
      state.listingsScanned += 1;
      state.updatedAt = Date.now();
    }
  });
  await persistScanCache(state);
}

async function fetchBrowsePage(
  query: CrawlQuery,
  offset: number,
  state: CrawlState
): Promise<{ listings: EbayListingSummary[]; total: number | null; error?: EbaySearchError }> {
  if (!state.running) return { listings: [], total: null };
  const result = await searchEbayListings({
    query: query.query,
    limit: EBAY_BROWSE_PAGE_SIZE,
    offset,
    categoryId: CCG_INDIVIDUAL_CARDS_CATEGORY,
    buyingOptions: query.buyingOptions,
    sort: query.sort,
    priceMin: query.priceMin,
    priceMax: query.priceMax,
  });
  if (result.error) {
    state.error = result.error;
    state.updatedAt = Date.now();
  } else {
    state.error = null;
  }
  return result;
}

async function runMarketplaceCrawl(state: CrawlState): Promise<void> {
  rawMarketMemo.clear();
  pokemonLookupMemo.clear();
  onePieceLookupMemo.clear();

  const plan = state.cardId
    ? await cardWatchQueryPlan(state.game, state.cardId)
    : marketplaceQueryPlan(state.game, state.listingType);

  if (state.cardId && plan.length === 0) {
    state.error = null;
    state.done = true;
    state.running = false;
    state.updatedAt = Date.now();
    return;
  }

  logger.info('eBay marketplace crawl started', {
    game: state.game,
    cardId: state.cardId,
    queries: plan.length,
    generation: state.generation,
  });

  let consecutiveRateLimits = 0;
  crawl: for (const query of plan) {
    if (!state.running) break;
    let offset = 0;
    while (state.running && offset <= EBAY_BROWSE_MAX_OFFSET) {
      const page = await fetchBrowsePage(query, offset, state);
      if (!state.running) break crawl;
      if (page.error === 'rate_limited') {
        consecutiveRateLimits += 1;
        const cooldownMs = await getEbayCooldownRemainingMs();
        const waitMs = Math.max(
          cooldownMs + 750,
          consecutiveRateLimits >= RATE_LIMIT_CONSECUTIVE_STOP ? 45_000 : RATE_LIMIT_WAIT_MS
        );
        logger.warn('eBay marketplace crawl backing off', {
          game: state.game,
          waitMs,
          scanned: state.listingsScanned,
        });
        if (consecutiveRateLimits >= RATE_LIMIT_CONSECUTIVE_STOP) consecutiveRateLimits = 0;
        await sleep(waitMs);
        continue;
      }
      if (page.error === 'unavailable') {
        await sleep(8_000);
        continue;
      }
      consecutiveRateLimits = 0;
      if (page.error && page.listings.length === 0) break;
      if (page.total != null && offset === 0) {
        const reachable = Math.min(page.total, EBAY_BROWSE_MAX_OFFSET);
        state.ebayTotal = (state.ebayTotal ?? 0) + reachable;
      }
      if (page.listings.length === 0) break;
      await evaluatePage(state, page.listings, query.targets ?? null);
      if (page.listings.length < EBAY_BROWSE_PAGE_SIZE) break;
      offset += page.listings.length;
      if (offset >= EBAY_BROWSE_MAX_OFFSET) break;
    }
  }

  if (crawlStates.get(state.key) !== state) {
    logger.info('eBay marketplace crawl superseded', {
      game: state.game,
      generation: state.generation,
    });
    return;
  }
  if (!state.running) {
    state.updatedAt = Date.now();
    await persistScanCache(state, true);
    logger.info('eBay marketplace crawl paused', {
      game: state.game,
      cardId: state.cardId,
      scanned: state.listingsScanned,
      generation: state.generation,
    });
    return;
  }

  state.running = false;
  state.done = true;
  state.updatedAt = Date.now();
  await persistScanCache(state, true);
  logger.info('eBay marketplace crawl finished', {
    game: state.game,
    cardId: state.cardId,
    fetched: state.listingsFetched,
    scanned: state.listingsScanned,
    generation: state.generation,
  });
}

function startCrawl(state: CrawlState): void {
  const run = runMarketplaceCrawl(state)
    .catch((err) => {
      logger.error('eBay marketplace crawl crashed', { error: (err as Error).message });
      if (crawlStates.get(state.key) !== state) return;
      state.error = 'unavailable';
      state.running = false;
      state.done = true;
      void persistScanCache(state, true);
    })
    .finally(() => {
      if (crawlRuns.get(state.key) === run) crawlRuns.delete(state.key);
    });
  crawlRuns.set(state.key, run);
}

function stopOtherCrawls(keepKey: string): void {
  for (const [key, other] of crawlStates) {
    if (key === keepKey || !other.running) continue;
    other.running = false;
    const scheduled = scheduledStarts.get(key);
    if (scheduled) {
      clearTimeout(scheduled);
      scheduledStarts.delete(key);
    }
    logger.info('Paused eBay crawl so another scan can use the Browse budget', {
      paused: key,
      keep: keepKey,
    });
  }
}

function maybeStartCrawl(state: CrawlState): void {
  if (crawlRuns.has(state.key)) return;
  const existing = scheduledStarts.get(state.key);
  if (existing) {
    clearTimeout(existing);
    scheduledStarts.delete(state.key);
  }
  void getEbayCooldownRemainingMs().then((wait) => {
    if (!state.running || state.done || crawlRuns.has(state.key)) return;
    if (wait <= 0) {
      startCrawl(state);
      return;
    }
    if (wait > 5_000) state.error = 'rate_limited';
    state.updatedAt = Date.now();
    logger.info('Delaying eBay crawl until Browse cooldown ends', {
      key: state.key,
      waitMs: wait,
    });
    const timer = setTimeout(() => {
      scheduledStarts.delete(state.key);
      if (!state.running || state.done || crawlRuns.has(state.key)) return;
      startCrawl(state);
    }, wait + 3_000);
    scheduledStarts.set(state.key, timer);
  });
}

async function ensureMarketplaceCrawl(query: DealQuery): Promise<CrawlState> {
  const key = cacheKey(query.game, query.cardId, query.listingType);
  let state = crawlStates.get(key);
  stopOtherCrawls(key);

  if (query.refresh) {
    const cooldownMs = await getEbayCooldownRemainingMs();
    const alreadyQueued = Boolean(
      state && (state.running || crawlRuns.has(key) || scheduledStarts.has(key))
    );
    if (state && cooldownMs > 5_000 && alreadyQueued) {
      state.error = 'rate_limited';
      state.updatedAt = Date.now();
      logger.info('Ignored eBay crawl refresh during Browse cooldown', {
        key,
        cooldownMs,
      });
      return state;
    }
    if (state?.running) state.running = false;
    const scheduled = scheduledStarts.get(key);
    if (scheduled) {
      clearTimeout(scheduled);
      scheduledStarts.delete(key);
    }
    state = emptyCrawlState(key, query.game, query.cardId, query.listingType || 'all');
    crawlStates.set(key, state);
    maybeStartCrawl(state);
    return state;
  }

  if (!state) {
    const hydrated = await hydrateScanCache(key);
    if (hydrated) return hydrated;
    state = emptyCrawlState(key, query.game, query.cardId, query.listingType || 'all');
    crawlStates.set(key, state);
    maybeStartCrawl(state);
    return state;
  }

  if (!state.running && !state.done) {
    state.running = true;
    maybeStartCrawl(state);
  }

  return state;
}

function dealsFromPool(game: DealGame, cardId?: string): EvaluatedListing[] {
  const now = Date.now();
  const prefix = cardId ? `c:${game}:${cardId}:` : `m:${game}:`;
  const out: EvaluatedListing[] = [];
  for (const [key, value] of recentDealPool) {
    if (!key.startsWith(prefix)) continue;
    const ended = value.deal.hoursRemaining != null && value.deal.hoursRemaining < 0;
    if (ended || now - value.seenAt > POOL_TTL_MS) {
      recentDealPool.delete(key);
      continue;
    }
    out.push({ deal: value.deal });
  }
  return out.sort((a, b) => b.deal.dealScore - a.deal.dealScore);
}

const rawMarketMemo = new Map<
  string,
  Promise<{
    value: number;
    source: string;
    updatedAt: string | null;
    volume: number | null;
  } | null>
>();

async function resolveRawMarket(card: CatalogCardRef): Promise<{
  value: number;
  source: string;
  updatedAt: string | null;
  volume: number | null;
} | null> {
  const memoKey = card.uniqueIdentifier;
  const cached = rawMarketMemo.get(memoKey);
  if (cached) return cached;
  const pending = resolveRawMarketUncached(card);
  rawMarketMemo.set(memoKey, pending);
  return pending;
}

async function resolveRawMarketUncached(card: CatalogCardRef): Promise<{
  value: number;
  source: string;
  updatedAt: string | null;
  volume: number | null;
} | null> {
  if (card.uniqueIdentifier.includes('::')) {
    const row = await dbGet<{ marketPrice: number | null; date: string | null; source: string | null }>(
      `SELECT marketPrice, date, source FROM onepiece_price_history
       WHERE catalogId = ? AND marketPrice > 0
       ORDER BY date DESC LIMIT 1`,
      [card.cardId]
    );
    if (row?.marketPrice && row.marketPrice > 0) {
      return {
        value: row.marketPrice,
        source: `TCGTracker canonical raw price (${row.source || 'optcg'})`,
        updatedAt: row.date,
        volume: null,
      };
    }
    const catalog = await dbGet<{ marketPrice: number | null }>(
      `SELECT marketPrice FROM onepiece_catalog WHERE catalogId = ?`,
      [card.cardId]
    );
    if (catalog?.marketPrice && catalog.marketPrice > 0) {
      return {
        value: catalog.marketPrice,
        source: 'TCGTracker canonical raw price (optcg)',
        updatedAt: null,
        volume: null,
      };
    }
    return null;
  }

  const canonical = await getLatestCanonicalPrice(card.uniqueIdentifier);
  if (!canonical || !(canonical.price > 0)) return null;

  const plateau = await rawPricePlateau(card.uniqueIdentifier, canonical.price);
  const quoteAgeDays = canonical.date ? daysBetween(canonical.date) : null;
  if (
    !isReliableMarketQuote({
      source: canonical.source,
      volume: canonical.volume,
      quoteAgeDays,
      plateauDays: plateau.days,
      price: canonical.price,
    })
  ) {
    return null;
  }

  return {
    value: canonical.price,
    source: `TCGTracker canonical raw price (${canonical.source})`,
    updatedAt: plateau.startedAt || canonical.date,
    volume: canonical.volume,
  };
}

async function rawPricePlateau(
  uniqueIdentifier: string,
  price: number
): Promise<{ startedAt: string | null; days: number | null }> {
  const lastDifferent = await dbGet<{ date: string | null }>(
    `SELECT MAX(date) AS date FROM canonical_price_history
     WHERE uniqueIdentifier = ? AND ABS(price - ?) > 0.005`,
    [uniqueIdentifier, price]
  );
  const start = await dbGet<{ date: string | null }>(
    `SELECT MIN(date) AS date FROM canonical_price_history
     WHERE uniqueIdentifier = ?
       AND ABS(price - ?) <= 0.005
       AND date > ?`,
    [uniqueIdentifier, price, lastDifferent?.date || '0000-01-01']
  );
  const startedAt = start?.date || null;
  return { startedAt, days: startedAt ? daysBetween(startedAt) : null };
}

async function resolveGradedMarket(
  card: CatalogCardRef,
  grader: string,
  grade: string
): Promise<{
  value: number;
  source: string;
  updatedAt: string | null;
  soldListings: number;
  verified: boolean;
  matchScore: number | null;
  stale: boolean;
} | null> {
  const variantKey = canonicalGradedHistoryVariantKey(card.variantKey);
  const row = await dbGet<{
    price: number | null;
    soldListings: number | null;
    fetchedAt: string;
    verified: number | null;
    matchScore: number | null;
    lastSoldDate: string | null;
    lastSoldPrice: number | null;
    listedLow: number | null;
    listedAvg: number | null;
    listedCount: number | null;
  }>(
    `SELECT price, soldListings, fetchedAt, verified, matchScore,
            lastSoldDate, lastSoldPrice, listedLow, listedAvg, listedCount
     FROM graded_prices
     WHERE cardId = ? AND LOWER(grader) = ? AND LOWER(grade) = ? AND variantKey = ?
       AND COALESCE(verified, 0) = 1
     ORDER BY fetchedAt DESC
     LIMIT 1`,
    [card.cardId, grader.toLowerCase(), grade.toLowerCase(), variantKey]
  );
  if (!row || row.price == null || !(row.price > 0)) return null;

  const enriched: GradedPrice = enrichGradedPrice({
    grader,
    grade,
    price: row.price,
    soldListings: row.soldListings || 0,
    lastSoldDate: row.lastSoldDate,
    lastSoldPrice: row.lastSoldPrice,
    listedLow: row.listedLow,
    listedAvg: row.listedAvg,
    listedCount: row.listedCount,
  });

  const ageHours = hoursSince(row.fetchedAt.includes('T') ? row.fetchedAt : `${row.fetchedAt}Z`);
  return {
    value: enriched.price as number,
    source: `${grader.toUpperCase()} ${grade} reference`,
    updatedAt: row.fetchedAt,
    soldListings: row.soldListings || 0,
    verified: row.verified === 1,
    matchScore: row.matchScore,
    stale: ageHours != null && ageHours > 24,
  };
}

async function matchListing(
  listing: EbayListingSummary,
  game: DealGame,
  targets: CandidateCard[] | null
): Promise<{ card: CatalogCardRef; match: ListingMatchResult } | null> {
  const parsed = parseEbayListingTitle(
    listing.title,
    `${listing.shortDescription || ''} ${listing.conditionDescription || ''}`,
    { itemCountry: listing.itemCountry }
  );
  if (parsed.language === 'ja' || parsed.language === 'other') return null;

  const englishTargets = (targets || []).filter(isEnglishCatalogCard);

  if (targets && targets.length > 0) {
    if (englishTargets.length === 0) return null;
    const match = pickBestListingMatch(listing.title, parsed, englishTargets);
    if (!match) return null;
    return { card: match.card, match };
  }

  if (game === 'onepiece') {
    const number = parsed.onePieceNumber;
    if (!number) return null;
    const cards = (await lookupOnePieceByNumber(number)).filter(isEnglishCatalogCard);
    const match = pickBestListingMatch(listing.title, parsed, cards);
    if (!match) return null;
    return { card: match.card, match };
  }

  const collector = parsed.collectorNumber || parsed.cardNumber;
  if (!collector) return null;
  const cards = (await lookupPokemonByNumber(collector, 'en')).filter(isEnglishCatalogCard);
  const match = pickBestListingMatch(listing.title, parsed, cards);
  if (!match) return null;
  return { card: match.card, match };
}

async function evaluateListing(
  listing: EbayListingSummary,
  game: DealGame,
  targets: CandidateCard[] | null,
  desiredAuctionMargin: number | undefined
): Promise<DealCardPayload | null> {
  const parsed = parseEbayListingTitle(
    listing.title,
    `${listing.shortDescription || ''} ${listing.conditionDescription || ''}`,
    { itemCountry: listing.itemCountry }
  );
  if (parsed.language === 'ja' || parsed.language === 'other') return null;
  const matched = await matchListing(listing, game, targets);
  if (!matched) return null;
  if (!isEnglishCatalogCard(matched.card)) return null;

  const { card, match } = matched;
  const riskFlags: DealRiskFlag[] = [...parsed.riskFlags];

  if (match.languageMismatch) riskFlags.push('possible_japanese_english_mismatch');
  if (match.finishMismatch) riskFlags.push('possible_wrong_card');
  if (match.reprintRisk) riskFlags.push('possible_reprint');
  if (match.confidenceTier === 'low' || match.confidenceTier === 'unresolved') {
    riskFlags.push('low_match_confidence');
  }

  if (
    listing.sellerFeedbackScore != null &&
    (listing.sellerFeedbackScore < 5 ||
      (listing.sellerFeedbackPct != null && listing.sellerFeedbackPct < 90))
  ) {
    riskFlags.push('low_seller_feedback');
  }

  const dealCondition: DealCondition = parsed.isGraded ? 'graded' : 'raw';
  const rawCondition = parsed.isGraded
    ? null
    : parseRawCardCondition({
        title: listing.title,
        description: listing.shortDescription || listing.conditionDescription,
        ebayCondition: listing.condition,
        ebayConditionId: listing.conditionId,
        conditionDescriptors: listing.conditionDescriptors,
      });
  if (rawCondition?.condition === 'damaged' && !riskFlags.includes('possible_damaged')) {
    riskFlags.push('possible_damaged');
  }

  let marketValue: number | null = null;
  let marketSource = '';
  let marketUpdatedAt: string | null = null;
  let marketStale = false;
  let liquidityScore: number | null = null;
  let liquidityLabel: string | null = null;
  let nmMarketValue: number | null = null;
  let conditionFactor = 1;

  if (parsed.isGraded) {
    if (!parsed.grade) return null;
    const graded = await resolveGradedMarket(card, parsed.grade.grader, parsed.grade.grade);
    if (!graded) return null;
    marketValue = graded.value;
    marketSource = `TCGTracker ${graded.source}`;
    marketUpdatedAt = graded.updatedAt;
    marketStale = graded.stale;
    const liq = scoreLiquidity({
      soldListings: graded.soldListings,
      verified: graded.verified,
      stale: graded.stale,
      matchScore: graded.matchScore,
    });
    liquidityScore = liq.score;
    liquidityLabel = liq.label;
  } else {
    const raw = await resolveRawMarket(card);
    if (!raw) return null;
    const ageDays = raw.updatedAt ? daysBetween(raw.updatedAt) : null;
    if (ageDays != null && ageDays > MAX_PRICE_AGE_DAYS) return null;
    const adjusted = applyConditionToNmMarket(raw.value, rawCondition!);
    marketValue = adjusted.marketValue;
    nmMarketValue = adjusted.nmMarketValue;
    conditionFactor = adjusted.factor;
    marketSource =
      adjusted.factor < 1
        ? `${raw.source} · ${rawCondition!.label} (${Math.round(adjusted.factor * 100)}% of NM)`
        : raw.source;
    marketUpdatedAt = raw.updatedAt;
    marketStale = ageDays != null && ageDays > WARN_PRICE_AGE_DAYS;
    const liq = scoreLiquidity({
      soldListings: raw.volume,
      stale: marketStale,
      ageHours: ageDays != null ? ageDays * 24 : null,
    });
    liquidityScore = liq.score;
    liquidityLabel = liq.label;
  }

  const economics = calculateDealEconomics(listing.listingPrice, listing.shipping, marketValue);
  if (!economics) return null;

  if (isUnusuallyLowPrice(economics.discountPercent, dealCondition)) {
    riskFlags.push('unusually_low_price');
  }

  const hoursRemaining = hoursUntil(listing.endDate);
  const listingAgeHours = hoursSince(listing.createdDate);
  const breakdown = computeDealScore({
    discountPercent: economics.discountPercent,
    discountAmount: economics.discountAmount,
    marketValue: economics.marketValue,
    matchConfidence: match.confidence,
    liquidityScore,
    listingAgeHours,
    listingType: listing.listingType,
    hoursRemaining,
  });

  const margin =
    listing.listingType === 'auction'
      ? desiredAuctionMargin ?? defaultAuctionMargin(dealCondition)
      : null;
  const maxBid =
    listing.listingType === 'auction' && margin != null
      ? calculateMaxBid(economics.marketValue, economics.shipping, margin)
      : null;

  const uniqueFlags = [...new Set(riskFlags)];
  const reviewReasons =
    hasSeriousRisk(uniqueFlags) ||
    uniqueFlags.includes('unusually_low_price') ||
    uniqueFlags.includes('possible_damaged') ||
    uniqueFlags.includes('possible_reprint') ||
    uniqueFlags.includes('possible_japanese_english_mismatch') ||
    match.confidence < DEFAULT_MIN_MATCH_CONFIDENCE;

  return {
    listingId: listing.listingId,
    listingUrl: listing.url,
    listingTitle: listing.title,
    listingImage: listing.imageUrl || card.imageLarge || card.imageSmall || null,
    listingType: listing.listingType,
    condition: listing.condition,
    sellerUsername: listing.sellerUsername,
    sellerFeedbackPct: listing.sellerFeedbackPct,
    sellerFeedbackScore: listing.sellerFeedbackScore,
    listingPrice: economics.listingPrice,
    shipping: economics.shipping,
    allInCost: economics.allInCost,
    currency: listing.currency,
    endDate: listing.endDate,
    hoursRemaining,
    cardId: card.cardId,
    uniqueIdentifier: card.uniqueIdentifier,
    cardName: card.cardName,
    setId: card.setId,
    setName: card.setName,
    cardNumber: card.cardNumber || null,
    rarity: card.rarity || null,
    language: parsed.language === 'en' || parsed.language === 'unknown' ? 'en' : parsed.language,
    variantKey: card.variantKey || null,
    cardImage: card.imageSmall || card.imageLarge || null,
    dealCondition,
    gradeLabel: parsed.isGraded
      ? formatGradeLabel(parsed.grade, parsed.isGraded)
      : formatRawGradeLabel(rawCondition!),
    grader: parsed.grade?.grader || null,
    grade: parsed.grade?.grade || null,
    cardCondition: rawCondition?.condition || 'unknown',
    cardConditionLabel: parsed.isGraded
      ? formatGradeLabel(parsed.grade, parsed.isGraded)
      : rawCondition!.label,
    nmMarketValue,
    conditionFactor,
    marketValue: economics.marketValue,
    marketSource,
    marketUpdatedAt,
    marketStale,
    discountAmount: economics.discountAmount,
    discountPercent: economics.discountPercent,
    dealScore: breakdown.dealScore,
    scoreBreakdown: breakdown,
    matchConfidence: match.confidence,
    matchConfidenceTier: match.confidenceTier,
    matchEvidence: match.evidence,
    riskFlags: uniqueFlags,
    liquidityScore,
    liquidityLabel,
    maxBid,
    desiredAuctionMargin: margin,
    feed: reviewReasons ? 'review' : 'deal',
  };
}

function sortDeals(deals: DealCardPayload[], sort: DealSort): DealCardPayload[] {
  const copy = [...deals];
  switch (sort) {
    case 'discount_pct':
      return copy.sort((a, b) => b.discountPercent - a.discountPercent);
    case 'savings':
      return copy.sort((a, b) => b.discountAmount - a.discountAmount);
    case 'price':
      return copy.sort((a, b) => a.allInCost - b.allInCost);
    case 'market':
      return copy.sort((a, b) => b.marketValue - a.marketValue);
    case 'ending':
      return copy.sort((a, b) => {
        const ah = a.hoursRemaining;
        const bh = b.hoursRemaining;
        if (ah == null && bh == null) return b.dealScore - a.dealScore;
        if (ah == null) return 1;
        if (bh == null) return -1;
        return ah - bh;
      });
    default:
      return copy.sort((a, b) => b.dealScore - a.dealScore);
  }
}

function applyFilters(deals: DealCardPayload[], query: DealQuery): DealCardPayload[] {
  return deals.filter((deal) => {
    if (query.condition === 'raw' && deal.dealCondition !== 'raw') return false;
    if (query.condition === 'graded' && deal.dealCondition !== 'graded') return false;
    if (query.listingType === 'bin' && deal.listingType !== 'bin') return false;
    if (query.listingType === 'auction' && deal.listingType !== 'auction') return false;
    if (query.gradingCompany && deal.grader !== query.gradingCompany.toLowerCase()) return false;
    if (query.grade && (deal.grade || '').toLowerCase() !== query.grade.toLowerCase()) return false;
    if (query.set && !deal.setName.toLowerCase().includes(query.set.toLowerCase()) && deal.setId !== query.set) {
      return false;
    }
    if (query.rarity && (deal.rarity || '').toLowerCase() !== query.rarity.toLowerCase()) return false;
    if (listingIsNonEnglish(deal.listingTitle)) return false;
    if ((deal.language || 'en') !== 'en') return false;
    if (query.language && deal.language !== query.language) return false;
    if (query.freeShipping && deal.shipping > 0) return false;
    if (query.minPrice != null && deal.allInCost < query.minPrice) return false;
    if (query.maxPrice != null && deal.allInCost > query.maxPrice) return false;

    const overrides: Partial<DealThresholds> = {};
    if (query.minDiscount != null) overrides.minDiscountPercent = query.minDiscount;
    if (query.minSavings != null) overrides.minSavings = query.minSavings;
    if (query.minMarketValue != null) overrides.minMarketValue = query.minMarketValue;
    if (query.cardId) {
      overrides.minDiscountPercent = query.minDiscount ?? 0;
      overrides.minSavings = query.minSavings ?? 0;
      overrides.minMarketValue = query.minMarketValue ?? 0;
    }

    return isEligibleDeal(
      {
        listingPrice: deal.listingPrice,
        shipping: deal.shipping,
        allInCost: deal.allInCost,
        marketValue: deal.marketValue,
        discountAmount: deal.discountAmount,
        discountPercent: deal.discountPercent,
      },
      deal.dealCondition,
      overrides
    );
  });
}

function summarize(deals: DealCardPayload[]): DealSummary {
  const best = deals[0] ?? null;
  const discounts = deals.map((d) => d.discountPercent);
  const savings = deals.reduce((sum, d) => sum + Math.max(0, d.discountAmount), 0);
  return {
    bestDeal: best,
    dealsFound: deals.length,
    medianDiscount: median(discounts),
    potentialSavings: Math.round(savings * 100) / 100,
  };
}

export async function getDeals(query: DealQuery, userId?: number): Promise<DealsResult> {
  try {
    return await getDealsUnsafe(query, userId);
  } catch (error) {
    logger.error('getDeals failed', { error: (error as Error).message });
    return {
      deals: [],
      review: [],
      summary: summarize([]),
      meta: {
        ebayConfigured: isEbayBrowseConfigured(),
        cached: false,
        fetchedAt: new Date().toISOString(),
        cacheExpiresAt: null,
        error: 'unavailable',
        candidateStrategy: 'get_deals_error',
        listingsScanned: 0,
        listingsFetched: 0,
        ebayTotal: null,
        scanning: false,
      },
    };
  }
}

async function getDealsUnsafe(query: DealQuery, userId?: number): Promise<DealsResult> {
  await ensureSavedDealsTable();

  if (!isEbayBrowseConfigured()) {
    return {
      deals: [],
      review: [],
      summary: summarize([]),
      meta: {
        ebayConfigured: false,
        cached: false,
        fetchedAt: new Date().toISOString(),
        cacheExpiresAt: null,
        error: 'not_configured',
        candidateStrategy: 'ebay_not_configured',
        listingsScanned: 0,
        listingsFetched: 0,
        ebayTotal: null,
        scanning: false,
      },
    };
  }

  if (query.cardId) {
    const targets =
      query.game === 'onepiece'
        ? await loadOnePieceCardTargets(query.cardId)
        : await loadPokemonCardTargets(query.cardId);
    if (targets.length === 0) {
      return {
        deals: [],
        review: [],
        summary: summarize([]),
        meta: {
          ebayConfigured: true,
          cached: false,
          fetchedAt: new Date().toISOString(),
          cacheExpiresAt: null,
          error: null,
          candidateStrategy: 'card_not_found',
          listingsScanned: 0,
          listingsFetched: 0,
          ebayTotal: null,
          scanning: false,
        },
      };
    }
  }

  const crawl = await ensureMarketplaceCrawl(query);
  const retryInMs = await getEbayCooldownRemainingMs();
  const waitingOnEbay = retryInMs > 5_000 && crawl.running && crawl.listingsScanned === 0;
  const all = dealsFromPool(query.game, query.cardId).map((e) => e.deal);

  const dealFeed = applyFilters(
    all.filter((d) => d.feed === 'deal'),
    query
  );
  const reviewFeed = applyFilters(
    all.filter((d) => d.feed === 'review'),
    { ...query, minDiscount: query.minDiscount ?? 0, minSavings: query.minSavings ?? 0, minMarketValue: query.minMarketValue ?? 0 }
  );
  const uniqueDeals = query.cardId ? dealFeed : pickBestDealPerCard(dealFeed);
  const uniqueReview = query.cardId ? reviewFeed : pickBestDealPerCard(reviewFeed);

  let savedIds = new Set<string>();
  let dismissedIds = new Set<string>();
  if (userId) {
    savedIds = new Set(await listSavedListingIds(userId, query.game));
    dismissedIds = new Set(await listDismissedListingIds(userId, query.game));
  }

  const decorate = (rows: DealCardPayload[]) =>
    rows
      .filter((d) => !dismissedIds.has(d.listingId))
      .map((d) => ({ ...d, saved: savedIds.has(d.listingId) }));

  const sort = query.sort || 'best';
  const deals = decorate(sortDeals(uniqueDeals, sort));
  const review = decorate(sortDeals(uniqueReview, sort));
  const strategy = query.cardId
    ? crawl.done
      ? `card_watch:${query.cardId}`
      : `card_watch:${query.cardId}:running`
    : crawl.done
      ? 'full_marketplace_crawl'
      : 'full_marketplace_crawl:running';

  return {
    deals,
    review,
    summary: summarize(deals),
    meta: {
      ebayConfigured: true,
      cached: !crawl.running && crawl.done,
      fetchedAt: new Date(crawl.updatedAt).toISOString(),
      cacheExpiresAt: null,
      error: waitingOnEbay ? 'rate_limited' : crawl.error,
      candidateStrategy: strategy,
      listingsScanned: crawl.listingsScanned,
      listingsFetched: crawl.listingsFetched,
      ebayTotal: crawl.ebayTotal,
      scanning: crawl.running,
      retryInMs: retryInMs > 5_000 ? retryInMs : undefined,
    },
  };
}

export async function getDealsForCard(
  cardId: string,
  query: Omit<DealQuery, 'cardId'>
): Promise<DealsResult> {
  return getDeals({ ...query, cardId });
}

interface SavedRow {
  id: number;
  user_id: number;
  game: DealGame;
  ebay_listing_id: string;
  card_id: string;
  unique_identifier: string;
  listing_url: string;
  listing_price: number;
  shipping_price: number;
  market_price_snapshot: number;
  discount_percent_snapshot: number;
  match_confidence: number;
  listing_end_time: string | null;
  status: SavedEbayDeal['status'];
  created_at: string;
  updated_at: string;
}

function mapSaved(row: SavedRow, currentMarketValue: number | null): SavedEbayDeal {
  return {
    id: row.id,
    userId: row.user_id,
    game: row.game,
    ebayListingId: row.ebay_listing_id,
    cardId: row.card_id,
    uniqueIdentifier: row.unique_identifier,
    listingUrl: row.listing_url,
    listingPrice: row.listing_price,
    shippingPrice: row.shipping_price,
    marketPriceSnapshot: row.market_price_snapshot,
    discountPercentSnapshot: row.discount_percent_snapshot,
    matchConfidence: row.match_confidence,
    listingEndTime: row.listing_end_time,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    currentMarketValue,
  };
}

async function listSavedListingIds(userId: number, game: DealGame): Promise<string[]> {
  const rows = await dbAll<{ ebay_listing_id: string }>(
    `SELECT ebay_listing_id FROM saved_ebay_deals
     WHERE user_id = ? AND game = ? AND status = 'active'`,
    [userId, game]
  );
  return rows.map((r) => r.ebay_listing_id);
}

async function listDismissedListingIds(userId: number, game: DealGame): Promise<string[]> {
  const rows = await dbAll<{ ebay_listing_id: string }>(
    `SELECT ebay_listing_id FROM saved_ebay_deals
     WHERE user_id = ? AND game = ? AND status = 'dismissed'`,
    [userId, game]
  );
  return rows.map((r) => r.ebay_listing_id);
}

export async function saveDeal(
  userId: number,
  listingId: string,
  snapshot: {
    game: DealGame;
    cardId: string;
    uniqueIdentifier: string;
    listingUrl: string;
    listingPrice: number;
    shippingPrice: number;
    marketPriceSnapshot: number;
    discountPercentSnapshot: number;
    matchConfidence: number;
    listingEndTime?: string | null;
  }
): Promise<SavedEbayDeal> {
  await ensureSavedDealsTable();
  await dbRun(
    `INSERT INTO saved_ebay_deals (
       user_id, game, ebay_listing_id, card_id, unique_identifier, listing_url,
       listing_price, shipping_price, market_price_snapshot, discount_percent_snapshot,
       match_confidence, listing_end_time, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
     ON CONFLICT(user_id, ebay_listing_id) DO UPDATE SET
       card_id = excluded.card_id,
       unique_identifier = excluded.unique_identifier,
       listing_url = excluded.listing_url,
       listing_price = excluded.listing_price,
       shipping_price = excluded.shipping_price,
       market_price_snapshot = excluded.market_price_snapshot,
       discount_percent_snapshot = excluded.discount_percent_snapshot,
       match_confidence = excluded.match_confidence,
       listing_end_time = excluded.listing_end_time,
       status = 'active',
       updated_at = datetime('now')`,
    [
      userId,
      snapshot.game,
      listingId,
      snapshot.cardId,
      snapshot.uniqueIdentifier,
      snapshot.listingUrl,
      snapshot.listingPrice,
      snapshot.shippingPrice,
      snapshot.marketPriceSnapshot,
      snapshot.discountPercentSnapshot,
      snapshot.matchConfidence,
      snapshot.listingEndTime || null,
    ]
  );
  const row = await dbGet<SavedRow>(
    `SELECT * FROM saved_ebay_deals WHERE user_id = ? AND ebay_listing_id = ?`,
    [userId, listingId]
  );
  if (!row) throw new Error('Failed to save deal');
  return mapSaved(row, snapshot.marketPriceSnapshot);
}

export async function unsaveDeal(userId: number, listingId: string): Promise<boolean> {
  await ensureSavedDealsTable();
  const result = await dbRun(
    `DELETE FROM saved_ebay_deals WHERE user_id = ? AND ebay_listing_id = ?`,
    [userId, listingId]
  );
  return result.changes > 0;
}

export async function dismissDeal(userId: number, listingId: string, game: DealGame): Promise<void> {
  await ensureSavedDealsTable();
  await dbRun(
    `INSERT INTO saved_ebay_deals (
       user_id, game, ebay_listing_id, card_id, unique_identifier, listing_url,
       listing_price, shipping_price, market_price_snapshot, discount_percent_snapshot,
       match_confidence, status, created_at, updated_at
     ) VALUES (?, ?, ?, '', '', '', 0, 0, 0, 0, 0, 'dismissed', datetime('now'), datetime('now'))
     ON CONFLICT(user_id, ebay_listing_id) DO UPDATE SET
       status = 'dismissed',
       updated_at = datetime('now')`,
    [userId, game, listingId]
  );
}

export async function listSavedDeals(userId: number, game?: DealGame): Promise<SavedEbayDeal[]> {
  await ensureSavedDealsTable();
  const rows = await dbAll<SavedRow>(
    game
      ? `SELECT * FROM saved_ebay_deals WHERE user_id = ? AND game = ? AND status != 'dismissed'
         ORDER BY updated_at DESC`
      : `SELECT * FROM saved_ebay_deals WHERE user_id = ? AND status != 'dismissed'
         ORDER BY updated_at DESC`,
    game ? [userId, game] : [userId]
  );

  const result: SavedEbayDeal[] = [];
  for (const row of rows) {
    let current: number | null = null;
    try {
      if (row.unique_identifier.includes('::')) {
        const live = await resolveRawMarket({
          cardId: row.card_id,
          cardName: '',
          setId: '',
          setName: '',
          uniqueIdentifier: row.unique_identifier,
        });
        current = live?.value ?? null;
      } else {
        const live = await getLatestCanonicalPrice(row.unique_identifier);
        current = live?.price ?? null;
      }
    } catch {
      current = null;
    }
    const endMs = row.listing_end_time ? new Date(row.listing_end_time).getTime() : null;
    let status = row.status;
    if (status === 'active' && endMs != null && Number.isFinite(endMs) && endMs < Date.now()) {
      status = 'ended';
    }
    result.push(mapSaved({ ...row, status }, current));
  }
  return result;
}

export { DEAL_THRESHOLDS, DEFAULT_MIN_MATCH_CONFIDENCE };
