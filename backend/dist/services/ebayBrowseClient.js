"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchPsa10ListingQuote = exports.probeEbayBrowseAuth = exports.searchEbayListings = exports.EBAY_BROWSE_MAX_OFFSET = exports.EBAY_BROWSE_PAGE_SIZE = exports.CCG_INDIVIDUAL_CARDS_CATEGORY = exports.summarizeListingPrices = exports.isPsa10ActiveListingTitle = exports.isEbayBrowseConfigured = void 0;
exports.getEbayCooldownRemainingMs = getEbayCooldownRemainingMs;
const promisified_1 = require("../db/promisified");
const env_1 = require("../config/env");
const logger_1 = require("../utils/logger");
const priceChartingClient_1 = require("./priceChartingClient");
const onePiecePriceCharting_1 = require("./onePiecePriceCharting");
const TOKEN_TTL_MS = 1000 * 60 * 110;
const SEARCH_TIMEOUT_MS = 12000;
const MIN_EBAY_INTERVAL_MS = 2000;
const DEFAULT_RETRY_AFTER_MS = 60000;
const RATE_LIMIT_BUFFER_MS = 15000;
const QUOTA_COOLDOWN_MS = 60 * 60 * 1000;
const MAX_RETRY_AFTER_MS = 60 * 60 * 1000;
let cachedToken = null;
let ebayChain = Promise.resolve();
let ebayCooldownUntil = 0;
let cooldownLoaded = false;
let consecutive429 = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const parseRetryAfterMs = (response) => {
    const raw = response.headers.get('retry-after');
    if (!raw)
        return DEFAULT_RETRY_AFTER_MS;
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
function cooldownMsFrom429(response, detail) {
    const header = response.headers.get('retry-after');
    const quota = /request limit has been reached/i.test(detail) || /"errorId"\s*:\s*2001/.test(detail);
    if (quota && !header)
        return QUOTA_COOLDOWN_MS;
    return Math.min(Math.max(parseRetryAfterMs(response) + RATE_LIMIT_BUFFER_MS, 15000), MAX_RETRY_AFTER_MS);
}
async function ensureCooldownLoaded() {
    if (cooldownLoaded)
        return;
    cooldownLoaded = true;
    try {
        await (0, promisified_1.dbRun)(`
      CREATE TABLE IF NOT EXISTS ebay_api_cooldown (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        cooldown_until INTEGER NOT NULL
      )
    `);
        const row = await (0, promisified_1.dbGet)('SELECT cooldown_until FROM ebay_api_cooldown WHERE id = 1');
        if (row && Number.isFinite(row.cooldown_until) && row.cooldown_until > Date.now()) {
            ebayCooldownUntil = row.cooldown_until;
        }
    }
    catch (error) {
        logger_1.logger.warn('Failed to load eBay cooldown', { error: error.message });
    }
}
async function persistCooldown(until) {
    ebayCooldownUntil = until;
    try {
        await (0, promisified_1.dbRun)(`INSERT INTO ebay_api_cooldown (id, cooldown_until) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET cooldown_until = excluded.cooldown_until`, [until]);
    }
    catch (error) {
        logger_1.logger.warn('Failed to persist eBay cooldown', { error: error.message });
    }
}
async function getEbayCooldownRemainingMs() {
    await ensureCooldownLoaded();
    return Math.max(0, ebayCooldownUntil - Date.now());
}
function enqueueEbay(fn) {
    const run = ebayChain.then(fn, fn);
    ebayChain = run.then(() => undefined, () => undefined);
    return run;
}
const isEbayBrowseConfigured = () => Boolean(env_1.env.ebay.clientId && env_1.env.ebay.clientSecret);
exports.isEbayBrowseConfigured = isEbayBrowseConfigured;
const apiHost = () => env_1.env.ebay.sandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
/** Keep lots, wrong grades, and proxies out of the ask sample. */
const isPsa10ActiveListingTitle = (title, input) => {
    const t = title.toLowerCase();
    if (!/\bpsa\s*[-.]?\s*10\b/.test(t))
        return false;
    if (/\b(lot of|lots of|\d+\s*x\s|wholesale lot)\b/.test(t))
        return false;
    if (/\b(proxy|custom|digital|fake)\b/.test(t))
        return false;
    if (/\bpsa\s*9\.5\b/.test(t))
        return false;
    if (/\bpsa\s*9\b/.test(t) && !/\bpsa\s*10\b/.test(t))
        return false;
    const nameForMatch = input.game === 'onepiece' ? (0, onePiecePriceCharting_1.stripOpNameDecorators)(input.cardName) || input.cardName : input.cardName;
    if (!(0, priceChartingClient_1.titleIncludesName)(title, nameForMatch))
        return false;
    if (input.game !== 'onepiece' && !(0, priceChartingClient_1.titleIncludesSet)(title, input.setName))
        return false;
    if (!(0, priceChartingClient_1.titleIncludesNumber)(title, input.cardNumber))
        return false;
    const want = (0, priceChartingClient_1.expectedPcFinishFamily)(input.variant);
    const got = (0, priceChartingClient_1.detectPcFinishFamily)(title, '');
    if (want === 'reverse' && got !== 'reverse' && got !== '1steditionreverse')
        return false;
    if (want === 'standard' && (got === 'reverse' || got === '1steditionreverse'))
        return false;
    if (want === '1stedition' && got !== '1stedition' && got !== '1steditionreverse')
        return false;
    if (input.game === 'onepiece') {
        if (!(0, onePiecePriceCharting_1.opPrintFamiliesMatch)((0, onePiecePriceCharting_1.expectedOpPrintFamily)(input), (0, onePiecePriceCharting_1.detectOpPrintFamily)(title, ''))) {
            return false;
        }
    }
    return true;
};
exports.isPsa10ActiveListingTitle = isPsa10ActiveListingTitle;
const percentile = (sorted, p) => {
    if (sorted.length === 0)
        return 0;
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi)
        return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};
/** Mean of inlier BIN prices + the lowest inlier. Drops moon-asks and $1 bait. */
const summarizeListingPrices = (prices) => {
    const cleaned = prices.filter((p) => Number.isFinite(p) && p >= 1);
    if (cleaned.length === 0)
        return null;
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
exports.summarizeListingPrices = summarizeListingPrices;
const parseMoney = (raw) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0)
        return null;
    return Math.round(n * 100) / 100;
};
const parseItemPrice = (item) => {
    var _a, _b, _c, _d, _e, _f;
    const base = (_b = parseMoney((_a = item.price) === null || _a === void 0 ? void 0 : _a.value)) !== null && _b !== void 0 ? _b : parseMoney((_c = item.currentBidPrice) === null || _c === void 0 ? void 0 : _c.value);
    if (base == null || base <= 0)
        return null;
    const shipRaw = (_f = (_e = (_d = item.shippingOptions) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.shippingCost) === null || _f === void 0 ? void 0 : _f.value;
    const ship = shipRaw != null ? Number(shipRaw) : 0;
    return base + (Number.isFinite(ship) && ship > 0 ? ship : 0);
};
const classifyListingType = (buyingOptions) => {
    const opts = buyingOptions.map((o) => o.toUpperCase());
    const hasAuction = opts.includes('AUCTION');
    const hasBin = opts.includes('FIXED_PRICE');
    if (hasAuction && !hasBin)
        return 'auction';
    return 'bin';
};
const toListingSummary = (item) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u;
    if (!item.itemId || !item.title)
        return null;
    const listingPrice = (_b = parseMoney((_a = item.price) === null || _a === void 0 ? void 0 : _a.value)) !== null && _b !== void 0 ? _b : parseMoney((_c = item.currentBidPrice) === null || _c === void 0 ? void 0 : _c.value);
    if (listingPrice == null || listingPrice <= 0)
        return null;
    const shipRaw = (_f = (_e = (_d = item.shippingOptions) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.shippingCost) === null || _f === void 0 ? void 0 : _f.value;
    const shippingCostType = (((_h = (_g = item.shippingOptions) === null || _g === void 0 ? void 0 : _g[0]) === null || _h === void 0 ? void 0 : _h.shippingCostType) || '').toUpperCase();
    const parsedShip = shipRaw != null ? Number(shipRaw) : 0;
    const shipping = shippingCostType === 'FREE' || !Number.isFinite(parsedShip) || parsedShip < 0
        ? 0
        : Math.round(parsedShip * 100) / 100;
    const buyingOptions = (_j = item.buyingOptions) !== null && _j !== void 0 ? _j : [];
    const feedbackPct = ((_k = item.seller) === null || _k === void 0 ? void 0 : _k.feedbackPercentage)
        ? Number(item.seller.feedbackPercentage)
        : null;
    const descriptors = ((_l = item.conditionDescriptors) !== null && _l !== void 0 ? _l : [])
        .flatMap((descriptor) => {
        var _a;
        return ((_a = descriptor.values) !== null && _a !== void 0 ? _a : []).map((value) => {
            var _a, _b;
            const name = (_a = descriptor.name) === null || _a === void 0 ? void 0 : _a.trim();
            const content = (_b = value.content) === null || _b === void 0 ? void 0 : _b.trim();
            if (!content)
                return '';
            return name ? `${name}: ${content}` : content;
        });
    })
        .filter(Boolean);
    return {
        listingId: item.itemId,
        title: item.title,
        url: item.itemWebUrl || item.itemHref || '',
        imageUrl: ((_m = item.image) === null || _m === void 0 ? void 0 : _m.imageUrl) || ((_p = (_o = item.thumbnailImages) === null || _o === void 0 ? void 0 : _o[0]) === null || _p === void 0 ? void 0 : _p.imageUrl) || null,
        listingPrice,
        shipping,
        currency: ((_q = item.price) === null || _q === void 0 ? void 0 : _q.currency) || ((_r = item.currentBidPrice) === null || _r === void 0 ? void 0 : _r.currency) || 'USD',
        listingType: classifyListingType(buyingOptions),
        buyingOptions,
        endDate: item.itemEndDate || null,
        createdDate: item.itemCreationDate || null,
        condition: item.condition || null,
        conditionId: item.conditionId || null,
        conditionDescription: item.conditionDescription || null,
        conditionDescriptors: descriptors,
        sellerUsername: ((_s = item.seller) === null || _s === void 0 ? void 0 : _s.username) || null,
        sellerFeedbackPct: feedbackPct != null && Number.isFinite(feedbackPct) ? feedbackPct : null,
        sellerFeedbackScore: ((_t = item.seller) === null || _t === void 0 ? void 0 : _t.feedbackScore) != null && Number.isFinite(item.seller.feedbackScore)
            ? item.seller.feedbackScore
            : null,
        shortDescription: item.shortDescription || null,
        itemCountry: ((_u = item.itemLocation) === null || _u === void 0 ? void 0 : _u.country) || null,
    };
};
exports.CCG_INDIVIDUAL_CARDS_CATEGORY = '183454';
exports.EBAY_BROWSE_PAGE_SIZE = 200;
exports.EBAY_BROWSE_MAX_OFFSET = 10000;
const searchEbayListings = async (options) => {
    if (!(0, exports.isEbayBrowseConfigured)()) {
        return { listings: [], total: null, error: 'not_configured' };
    }
    return enqueueEbay(async () => {
        var _a, _b, _c;
        await ensureCooldownLoaded();
        const waitMs = Math.max(0, ebayCooldownUntil - Date.now());
        // Do not spend another Browse call while a quota/throttle window is open.
        // Waiting-then-firing is what kept the 429 loop alive for 20+ minutes.
        if (waitMs > MIN_EBAY_INTERVAL_MS + 500) {
            return { listings: [], total: null, error: 'rate_limited' };
        }
        if (waitMs > 0)
            await sleep(waitMs);
        const token = await fetchAppToken();
        if (!token) {
            return { listings: [], total: null, error: 'unavailable' };
        }
        const limit = Math.min(Math.max((_a = options.limit) !== null && _a !== void 0 ? _a : exports.EBAY_BROWSE_PAGE_SIZE, 1), exports.EBAY_BROWSE_PAGE_SIZE);
        const offset = Math.min(Math.max((_b = options.offset) !== null && _b !== void 0 ? _b : 0, 0), exports.EBAY_BROWSE_MAX_OFFSET);
        const filterParts = ['deliveryCountry:US'];
        if (options.buyingOptions === 'FIXED_PRICE') {
            filterParts.push('buyingOptions:{FIXED_PRICE}');
        }
        else if (options.buyingOptions === 'AUCTION') {
            filterParts.push('buyingOptions:{AUCTION}');
        }
        if (options.priceMin != null || options.priceMax != null) {
            const lo = options.priceMin != null && Number.isFinite(options.priceMin) ? options.priceMin : 0;
            const hi = options.priceMax != null && Number.isFinite(options.priceMax) ? options.priceMax : 1000000;
            filterParts.push(`price:[${lo}..${hi}]`);
            filterParts.push('priceCurrency:USD');
        }
        const params = new URLSearchParams({
            q: options.query.trim(),
            category_ids: options.categoryId || exports.CCG_INDIVIDUAL_CARDS_CATEGORY,
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
                logger_1.logger.warn('eBay Browse search rate limited', {
                    query: options.query,
                    retryMs,
                    consecutive429,
                    retryAfter: response.headers.get('retry-after'),
                    detail: detail.slice(0, 300),
                });
                return { listings: [], total: null, error: 'rate_limited' };
            }
            consecutive429 = 0;
            ebayCooldownUntil = Math.max(ebayCooldownUntil, Date.now() + MIN_EBAY_INTERVAL_MS);
            if (!response.ok) {
                logger_1.logger.warn('eBay Browse search failed', { status: response.status, query: options.query });
                return { listings: [], total: null, error: 'unavailable' };
            }
            const json = (await response.json());
            const listings = [];
            for (const item of (_c = json.itemSummaries) !== null && _c !== void 0 ? _c : []) {
                const summary = toListingSummary(item);
                if (summary)
                    listings.push(summary);
            }
            const total = json.total != null && Number.isFinite(Number(json.total)) ? Number(json.total) : null;
            return { listings, total };
        }
        catch (error) {
            logger_1.logger.warn('eBay Browse search errored', {
                error: error.message,
                query: options.query,
            });
            return { listings: [], total: null, error: 'unavailable' };
        }
    });
};
exports.searchEbayListings = searchEbayListings;
const fetchAppToken = async () => {
    var _a;
    if (!(0, exports.isEbayBrowseConfigured)())
        return null;
    if (cachedToken && cachedToken.expiresAt > Date.now())
        return cachedToken.value;
    const basic = Buffer.from(`${env_1.env.ebay.clientId}:${env_1.env.ebay.clientSecret}`).toString('base64');
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
        logger_1.logger.warn('eBay OAuth token failed', { status: response.status, detail: detail.slice(0, 300) });
        return null;
    }
    const json = (await response.json());
    if (!json.access_token)
        return null;
    cachedToken = {
        value: json.access_token,
        expiresAt: Date.now() + Math.min(((_a = json.expires_in) !== null && _a !== void 0 ? _a : 7200) * 1000, TOKEN_TTL_MS),
    };
    return cachedToken.value;
};
/** Startup / ops check: can we mint an application token with the configured keyset? */
const probeEbayBrowseAuth = async () => {
    if (!(0, exports.isEbayBrowseConfigured)()) {
        return { configured: false, ok: false, sandbox: env_1.env.ebay.sandbox };
    }
    const token = await fetchAppToken();
    if (token)
        return { configured: true, ok: true, sandbox: env_1.env.ebay.sandbox };
    return {
        configured: true,
        ok: false,
        sandbox: env_1.env.ebay.sandbox,
        error: 'eBay rejected the client credentials. Production keysets stay disabled until Marketplace account deletion notifications are configured (or exempted) in the developer portal.',
    };
};
exports.probeEbayBrowseAuth = probeEbayBrowseAuth;
/**
 * Active US BIN PSA 10 listings for a card. Returns null when eBay is not
 * configured or the search fails — sold comps still stand on their own.
 */
const fetchPsa10ListingQuote = async (input) => {
    if (!(0, exports.isEbayBrowseConfigured)())
        return null;
    return enqueueEbay(async () => {
        var _a;
        await ensureCooldownLoaded();
        const waitMs = Math.max(0, ebayCooldownUntil - Date.now());
        if (waitMs > MIN_EBAY_INTERVAL_MS + 500)
            return null;
        const token = await fetchAppToken();
        if (!token)
            return null;
        const opFamily = input.game === 'onepiece' ? (0, onePiecePriceCharting_1.expectedOpPrintFamily)(input) : null;
        const query = [
            input.game === 'onepiece' ? (0, onePiecePriceCharting_1.stripOpNameDecorators)(input.cardName) || input.cardName : input.cardName,
            input.game === 'onepiece' ? (0, onePiecePriceCharting_1.opSearchSetName)(input.setName, opFamily) : input.setName,
            input.cardNumber ? `#${input.cardNumber}` : '',
            input.game === 'onepiece'
                ? (0, onePiecePriceCharting_1.opFamilySearchTerms)(opFamily)
                : (0, priceChartingClient_1.pcFinishSearchTerms)(input.variant),
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
            if (waitMs > 0)
                await sleep(waitMs);
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
                logger_1.logger.warn('eBay Browse PSA 10 quote rate limited', { query, retryMs });
                return null;
            }
            consecutive429 = 0;
            ebayCooldownUntil = Math.max(ebayCooldownUntil, Date.now() + MIN_EBAY_INTERVAL_MS);
            if (!response.ok) {
                logger_1.logger.warn('eBay Browse search failed', { status: response.status, query });
                return null;
            }
            const json = (await response.json());
            const prices = [];
            for (const item of (_a = json.itemSummaries) !== null && _a !== void 0 ? _a : []) {
                if (!item.title || !(0, exports.isPsa10ActiveListingTitle)(item.title, input))
                    continue;
                const price = parseItemPrice(item);
                if (price != null)
                    prices.push(price);
            }
            return (0, exports.summarizeListingPrices)(prices);
        }
        catch (error) {
            logger_1.logger.warn('eBay Browse search errored', { error: error.message, query });
            return null;
        }
    });
};
exports.fetchPsa10ListingQuote = fetchPsa10ListingQuote;
