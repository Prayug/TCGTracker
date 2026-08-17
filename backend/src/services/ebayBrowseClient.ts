import { dbGet, dbRun } from '../db/promisified';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import {
  titleIncludesName,
  titleIncludesNumber,
  titleIncludesSet,
  ProductMatchInput,
  expectedPcFinishFamily,
  detectPcFinishFamily,
  pcFinishSearchTerms,
} from './priceChartingClient';
import {
  detectOpPrintFamily,
  expectedOpPrintFamily,
  opFamilySearchTerms,
  opPrintFamiliesMatch,
  opSearchSetName,
  stripOpNameDecorators,
} from './onePiecePriceCharting';

const TOKEN_TTL_MS = 1000 * 60 * 110;
const SEARCH_TIMEOUT_MS = 12000;
const MIN_EBAY_INTERVAL_MS = 2000;
const DEFAULT_RETRY_AFTER_MS = 60_000;
const RATE_LIMIT_BUFFER_MS = 15_000;
const QUOTA_COOLDOWN_MS = 60 * 60 * 1000;
const MAX_RETRY_AFTER_MS = 60 * 60 * 1000;

let cachedToken: { value: string; expiresAt: number } | null = null;
let ebayChain: Promise<void> = Promise.resolve();
let ebayCooldownUntil = 0;
let cooldownLoaded = false;
let consecutive429 = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfterMs = (response: Response): number => {
  const raw = response.headers.get('retry-after');
  if (!raw) return DEFAULT_RETRY_AFTER_MS;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.max(seconds, 1) * 1000, MAX_RETRY_AFTER_MS);
  }
  const when = Date.parse(raw);
  if (Number.isFinite(when)) {
    return Math.min(Math.max(when - Date.now(), 1000), MAX_RETRY_AFTER_MS);
  }
  return DEFAULT_RETRY_AFTER_MS;
};

function cooldownMsFrom429(response: Response, detail: string): number {
  const header = response.headers.get('retry-after');
  const quota =
    /request limit has been reached/i.test(detail) || /"errorId"\s*:\s*2001/.test(detail);
  if (quota && !header) return QUOTA_COOLDOWN_MS;
  return Math.min(
    Math.max(parseRetryAfterMs(response) + RATE_LIMIT_BUFFER_MS, 15_000),
    MAX_RETRY_AFTER_MS
  );
}

async function ensureCooldownLoaded(): Promise<void> {
  if (cooldownLoaded) return;
  cooldownLoaded = true;
  try {
    await dbRun(`
      CREATE TABLE IF NOT EXISTS ebay_api_cooldown (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        cooldown_until INTEGER NOT NULL
      )
    `);
    const row = await dbGet<{ cooldown_until: number }>(
      'SELECT cooldown_until FROM ebay_api_cooldown WHERE id = 1'
    );
    if (row && Number.isFinite(row.cooldown_until) && row.cooldown_until > Date.now()) {
      ebayCooldownUntil = row.cooldown_until;
    }
  } catch (error) {
    logger.warn('Failed to load eBay cooldown', { error: (error as Error).message });
  }
}

async function persistCooldown(until: number): Promise<void> {
  ebayCooldownUntil = until;
  try {
    await dbRun(
      `INSERT INTO ebay_api_cooldown (id, cooldown_until) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET cooldown_until = excluded.cooldown_until`,
      [until]
    );
  } catch (error) {
    logger.warn('Failed to persist eBay cooldown', { error: (error as Error).message });
  }
}

export async function getEbayCooldownRemainingMs(): Promise<number> {
  await ensureCooldownLoaded();
  return Math.max(0, ebayCooldownUntil - Date.now());
}

function enqueueEbay<T>(fn: () => Promise<T>): Promise<T> {
  const run = ebayChain.then(fn, fn);
  ebayChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export interface Psa10ListingQuote {
  listedLow: number;
  listedAvg: number;
  listedCount: number;
}

export const isEbayBrowseConfigured = (): boolean =>
  Boolean(env.ebay.clientId && env.ebay.clientSecret);

const apiHost = (): string =>
  env.ebay.sandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';

/** Keep lots, wrong grades, and proxies out of the ask sample. */
export const isPsa10ActiveListingTitle = (
  title: string,
  input: ProductMatchInput
): boolean => {
  const t = title.toLowerCase();
  if (!/\bpsa\s*[-.]?\s*10\b/.test(t)) return false;
  if (/\b(lot of|lots of|\d+\s*x\s|wholesale lot)\b/.test(t)) return false;
  if (/\b(proxy|custom|digital|fake)\b/.test(t)) return false;
  if (/\bpsa\s*9\.5\b/.test(t)) return false;
  if (/\bpsa\s*9\b/.test(t) && !/\bpsa\s*10\b/.test(t)) return false;
  const nameForMatch =
    input.game === 'onepiece' ? stripOpNameDecorators(input.cardName) || input.cardName : input.cardName;
  if (!titleIncludesName(title, nameForMatch)) return false;
  if (input.game !== 'onepiece' && !titleIncludesSet(title, input.setName)) return false;
  if (!titleIncludesNumber(title, input.cardNumber)) return false;
  const want = expectedPcFinishFamily(input.variant);
  const got = detectPcFinishFamily(title, '');
  if (want === 'reverse' && got !== 'reverse' && got !== '1steditionreverse') return false;
  if (want === 'standard' && (got === 'reverse' || got === '1steditionreverse')) return false;
  if (want === '1stedition' && got !== '1stedition' && got !== '1steditionreverse') return false;
  if (input.game === 'onepiece') {
    if (!opPrintFamiliesMatch(expectedOpPrintFamily(input), detectOpPrintFamily(title, ''))) {
      return false;
    }
  }
  return true;
};

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};

/** Mean of inlier BIN prices + the lowest inlier. Drops moon-asks and $1 bait. */
export const summarizeListingPrices = (prices: number[]): Psa10ListingQuote | null => {
  const cleaned = prices.filter((p) => Number.isFinite(p) && p >= 1);
  if (cleaned.length === 0) return null;
  const sorted = [...cleaned].sort((a, b) => a - b);
  const med = percentile(sorted, 0.5);
  const inliers = sorted.filter((p) => p >= med / 4 && p <= med * 4);
  const used = inliers.length > 0 ? inliers : sorted;
  const avg = used.reduce((a, b) => a + b, 0) / used.length;
  return {
    listedLow: Math.round(used[0] * 100) / 100,
    listedAvg: Math.round(avg * 100) / 100,
    listedCount: used.length,
  };
};

interface BrowseItemSummary {
  itemId?: string;
  title?: string;
  itemWebUrl?: string;
  itemHref?: string;
  image?: { imageUrl?: string };
  thumbnailImages?: Array<{ imageUrl?: string }>;
  price?: { value?: string; currency?: string };
  currentBidPrice?: { value?: string; currency?: string };
  shippingOptions?: Array<{
    shippingCost?: { value?: string; currency?: string };
    shippingCostType?: string;
  }>;
  buyingOptions?: string[];
  itemEndDate?: string;
  itemCreationDate?: string;
  condition?: string;
  conditionId?: string;
  conditionDescription?: string;
  conditionDescriptors?: Array<{
    name?: string;
    values?: Array<{ content?: string }>;
  }>;
  shortDescription?: string;
  seller?: {
    username?: string;
    feedbackPercentage?: string;
    feedbackScore?: number;
  };
  itemLocation?: {
    country?: string;
    city?: string;
  };
}

export type EbaySearchError = 'not_configured' | 'unavailable' | 'rate_limited';

export type EbayListingType = 'bin' | 'auction';

export interface EbayListingSummary {
  listingId: string;
  title: string;
  url: string;
  imageUrl: string | null;
  listingPrice: number;
  shipping: number;
  currency: string;
  listingType: EbayListingType;
  buyingOptions: string[];
  endDate: string | null;
  createdDate: string | null;
  condition: string | null;
  conditionId: string | null;
  conditionDescription: string | null;
  conditionDescriptors: string[];
  sellerUsername: string | null;
  sellerFeedbackPct: number | null;
  sellerFeedbackScore: number | null;
  shortDescription: string | null;
  itemCountry: string | null;
}

const parseMoney = (raw?: string): number | null => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
};

const parseItemPrice = (item: BrowseItemSummary): number | null => {
  const base = parseMoney(item.price?.value) ?? parseMoney(item.currentBidPrice?.value);
  if (base == null || base <= 0) return null;
  const shipRaw = item.shippingOptions?.[0]?.shippingCost?.value;
  const ship = shipRaw != null ? Number(shipRaw) : 0;
  return base + (Number.isFinite(ship) && ship > 0 ? ship : 0);
};

const classifyListingType = (buyingOptions: string[]): EbayListingType => {
  const opts = buyingOptions.map((o) => o.toUpperCase());
  const hasAuction = opts.includes('AUCTION');
  const hasBin = opts.includes('FIXED_PRICE');
  if (hasAuction && !hasBin) return 'auction';
  return 'bin';
};

const toListingSummary = (item: BrowseItemSummary): EbayListingSummary | null => {
  if (!item.itemId || !item.title) return null;
  const listingPrice =
    parseMoney(item.price?.value) ?? parseMoney(item.currentBidPrice?.value);
  if (listingPrice == null || listingPrice <= 0) return null;
  const shipRaw = item.shippingOptions?.[0]?.shippingCost?.value;
  const shippingCostType = (item.shippingOptions?.[0]?.shippingCostType || '').toUpperCase();
  const parsedShip = shipRaw != null ? Number(shipRaw) : 0;
  const shipping =
    shippingCostType === 'FREE' || !Number.isFinite(parsedShip) || parsedShip < 0
      ? 0
      : Math.round(parsedShip * 100) / 100;
  const buyingOptions = item.buyingOptions ?? [];
  const feedbackPct = item.seller?.feedbackPercentage
    ? Number(item.seller.feedbackPercentage)
    : null;
  const descriptors = (item.conditionDescriptors ?? [])
    .flatMap((descriptor) =>
      (descriptor.values ?? []).map((value) => {
        const name = descriptor.name?.trim();
        const content = value.content?.trim();
        if (!content) return '';
        return name ? `${name}: ${content}` : content;
      })
    )
    .filter(Boolean);
  return {
    listingId: item.itemId,
    title: item.title,
    url: item.itemWebUrl || item.itemHref || '',
    imageUrl: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || null,
    listingPrice,
    shipping,
    currency: item.price?.currency || item.currentBidPrice?.currency || 'USD',
    listingType: classifyListingType(buyingOptions),
    buyingOptions,
    endDate: item.itemEndDate || null,
    createdDate: item.itemCreationDate || null,
    condition: item.condition || null,
    conditionId: item.conditionId || null,
    conditionDescription: item.conditionDescription || null,
    conditionDescriptors: descriptors,
    sellerUsername: item.seller?.username || null,
    sellerFeedbackPct: feedbackPct != null && Number.isFinite(feedbackPct) ? feedbackPct : null,
    sellerFeedbackScore:
      item.seller?.feedbackScore != null && Number.isFinite(item.seller.feedbackScore)
        ? item.seller.feedbackScore
        : null,
    shortDescription: item.shortDescription || null,
    itemCountry: item.itemLocation?.country || null,
  };
};

export const CCG_INDIVIDUAL_CARDS_CATEGORY = '183454';

export interface SearchEbayListingsOptions {
  query: string;
  limit?: number;
  offset?: number;
  categoryId?: string;
  buyingOptions?: 'FIXED_PRICE' | 'AUCTION' | 'ALL';
  sort?: 'newlyListed' | 'price' | 'endingSoonest';
  priceMin?: number;
  priceMax?: number;
}

export const EBAY_BROWSE_PAGE_SIZE = 200;
export const EBAY_BROWSE_MAX_OFFSET = 10_000;

export const searchEbayListings = async (
  options: SearchEbayListingsOptions
): Promise<{ listings: EbayListingSummary[]; total: number | null; error?: EbaySearchError }> => {
  if (!isEbayBrowseConfigured()) {
    return { listings: [], total: null, error: 'not_configured' };
  }

  return enqueueEbay(async () => {
    await ensureCooldownLoaded();
    const waitMs = Math.max(0, ebayCooldownUntil - Date.now());
    // Do not spend another Browse call while a quota/throttle window is open.
    // Waiting-then-firing is what kept the 429 loop alive for 20+ minutes.
    if (waitMs > MIN_EBAY_INTERVAL_MS + 500) {
      return { listings: [], total: null, error: 'rate_limited' as const };
    }
    if (waitMs > 0) await sleep(waitMs);

    const token = await fetchAppToken();
    if (!token) {
      return { listings: [], total: null, error: 'unavailable' as const };
    }

    const limit = Math.min(Math.max(options.limit ?? EBAY_BROWSE_PAGE_SIZE, 1), EBAY_BROWSE_PAGE_SIZE);
    const offset = Math.min(Math.max(options.offset ?? 0, 0), EBAY_BROWSE_MAX_OFFSET);
    const filterParts = ['deliveryCountry:US'];
    if (options.buyingOptions === 'FIXED_PRICE') {
      filterParts.push('buyingOptions:{FIXED_PRICE}');
    } else if (options.buyingOptions === 'AUCTION') {
      filterParts.push('buyingOptions:{AUCTION}');
    }
    if (options.priceMin != null || options.priceMax != null) {
      const lo = options.priceMin != null && Number.isFinite(options.priceMin) ? options.priceMin : 0;
      const hi =
        options.priceMax != null && Number.isFinite(options.priceMax) ? options.priceMax : 1_000_000;
      filterParts.push(`price:[${lo}..${hi}]`);
      filterParts.push('priceCurrency:USD');
    }

    const params = new URLSearchParams({
      q: options.query.trim(),
      category_ids: options.categoryId || CCG_INDIVIDUAL_CARDS_CATEGORY,
      limit: String(limit),
      offset: String(offset),
      sort: options.sort || 'newlyListed',
      filter: filterParts.join(','),
      fieldgroups: 'EXTENDED',
    });

    try {
      const response = await fetch(`${apiHost()}/buy/browse/v1/item_summary/search?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      });
      if (response.status === 429) {
        consecutive429 += 1;
        const detail = await response.text().catch(() => '');
        const retryMs = cooldownMsFrom429(response, detail);
        await persistCooldown(Date.now() + retryMs);
        logger.warn('eBay Browse search rate limited', {
          query: options.query,
          retryMs,
          consecutive429,
          retryAfter: response.headers.get('retry-after'),
          detail: detail.slice(0, 300),
        });
        return { listings: [], total: null, error: 'rate_limited' as const };
      }
      consecutive429 = 0;
      ebayCooldownUntil = Math.max(ebayCooldownUntil, Date.now() + MIN_EBAY_INTERVAL_MS);
      if (!response.ok) {
        logger.warn('eBay Browse search failed', { status: response.status, query: options.query });
        return { listings: [], total: null, error: 'unavailable' as const };
      }
      const json = (await response.json()) as {
        itemSummaries?: BrowseItemSummary[];
        total?: number;
      };
      const listings: EbayListingSummary[] = [];
      for (const item of json.itemSummaries ?? []) {
        const summary = toListingSummary(item);
        if (summary) listings.push(summary);
      }
      const total =
        json.total != null && Number.isFinite(Number(json.total)) ? Number(json.total) : null;
      return { listings, total };
    } catch (error) {
      logger.warn('eBay Browse search errored', {
        error: (error as Error).message,
        query: options.query,
      });
      return { listings: [], total: null, error: 'unavailable' as const };
    }
  });
};

const fetchAppToken = async (): Promise<string | null> => {
  if (!isEbayBrowseConfigured()) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const basic = Buffer.from(`${env.ebay.clientId}:${env.ebay.clientSecret}`).toString('base64');
  const response = await fetch(`${apiHost()}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    logger.warn('eBay OAuth token failed', { status: response.status, detail: detail.slice(0, 300) });
    return null;
  }
  const json = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + Math.min((json.expires_in ?? 7200) * 1000, TOKEN_TTL_MS),
  };
  return cachedToken.value;
};

/** Startup / ops check: can we mint an application token with the configured keyset? */
export const probeEbayBrowseAuth = async (): Promise<{
  configured: boolean;
  ok: boolean;
  sandbox: boolean;
  error?: string;
}> => {
  if (!isEbayBrowseConfigured()) {
    return { configured: false, ok: false, sandbox: env.ebay.sandbox };
  }
  const token = await fetchAppToken();
  if (token) return { configured: true, ok: true, sandbox: env.ebay.sandbox };
  return {
    configured: true,
    ok: false,
    sandbox: env.ebay.sandbox,
    error:
      'eBay rejected the client credentials. Production keysets stay disabled until Marketplace account deletion notifications are configured (or exempted) in the developer portal.',
  };
};

/**
 * Active US BIN PSA 10 listings for a card. Returns null when eBay is not
 * configured or the search fails — sold comps still stand on their own.
 */
export const fetchPsa10ListingQuote = async (
  input: ProductMatchInput
): Promise<Psa10ListingQuote | null> => {
  if (!isEbayBrowseConfigured()) return null;

  return enqueueEbay(async () => {
    await ensureCooldownLoaded();
    const waitMs = Math.max(0, ebayCooldownUntil - Date.now());
    if (waitMs > MIN_EBAY_INTERVAL_MS + 500) return null;

    const token = await fetchAppToken();
    if (!token) return null;

    const opFamily = input.game === 'onepiece' ? expectedOpPrintFamily(input) : null;
    const query = [
      input.game === 'onepiece' ? stripOpNameDecorators(input.cardName) || input.cardName : input.cardName,
      input.game === 'onepiece' ? opSearchSetName(input.setName, opFamily!) : input.setName,
      input.cardNumber ? `#${input.cardNumber}` : '',
      input.game === 'onepiece'
        ? opFamilySearchTerms(opFamily!)
        : pcFinishSearchTerms(input.variant),
      'PSA 10',
    ]
      .filter(Boolean)
      .join(' ')
      .trim();
    const params = new URLSearchParams({
      q: query,
      category_ids: '183454',
      limit: '50',
      sort: 'price',
      filter: 'buyingOptions:{FIXED_PRICE},deliveryCountry:US',
    });

    try {
      if (waitMs > 0) await sleep(waitMs);
      const response = await fetch(`${apiHost()}/buy/browse/v1/item_summary/search?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      });
      if (response.status === 429) {
        consecutive429 += 1;
        const detail = await response.text().catch(() => '');
        const retryMs = cooldownMsFrom429(response, detail);
        await persistCooldown(Date.now() + retryMs);
        logger.warn('eBay Browse PSA 10 quote rate limited', { query, retryMs });
        return null;
      }
      consecutive429 = 0;
      ebayCooldownUntil = Math.max(ebayCooldownUntil, Date.now() + MIN_EBAY_INTERVAL_MS);
      if (!response.ok) {
        logger.warn('eBay Browse search failed', { status: response.status, query });
        return null;
      }
      const json = (await response.json()) as { itemSummaries?: BrowseItemSummary[] };
      const prices: number[] = [];
      for (const item of json.itemSummaries ?? []) {
        if (!item.title || !isPsa10ActiveListingTitle(item.title, input)) continue;
        const price = parseItemPrice(item);
        if (price != null) prices.push(price);
      }
      return summarizeListingPrices(prices);
    } catch (error) {
      logger.warn('eBay Browse search errored', { error: (error as Error).message, query });
      return null;
    }
  });
};
