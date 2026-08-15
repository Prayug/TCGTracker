"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyProductPage = exports.isProductPageHtml = exports.buildDirectProductUrl = exports.cardSlug = exports.consoleSlug = exports.slugify = exports.fetchProductPageData = exports.parseLastSoldByGrade = exports.parseFullPrices = exports.parsePopData = exports.searchBestProduct = exports.isAcceptableMatch = exports.selectBestProductMatch = exports.primaryCollectorNumber = exports.looksLikeSealedSku = exports.scoreCandidate = exports.titleIncludesNumber = exports.titleIncludesName = exports.titleIncludesSet = exports.parseSearchRows = exports.fetchPriceChartingHtml = exports.finishesMatch = exports.inferVariantKeyFromPc = exports.pcFinishSearchTerms = exports.pcFinishSlug = exports.expectedPcFinishFamily = exports.detectPcFinishFamily = exports.COMPANY_LABELS = exports.extractCardNumbers = exports.normalizeCardNumber = exports.normalize = exports.decodeHtmlEntities = void 0;
const setPrintFamily_1 = require("../utils/setPrintFamily");
const onePiecePriceCharting_1 = require("./onePiecePriceCharting");
const REQUEST_TIMEOUT_MS = 20000;
const REQUEST_DELAY_MS = 1500;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = async (promise, ms) => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('request_timeout')), ms);
    });
    try {
        return await Promise.race([promise, timeoutPromise]);
    }
    finally {
        if (timeoutId)
            clearTimeout(timeoutId);
    }
};
/** Decode common HTML entities found in PriceCharting meta/title attributes. */
const decodeHtmlEntities = (value) => (value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
exports.decodeHtmlEntities = decodeHtmlEntities;
const normalize = (value) => (0, exports.decodeHtmlEntities)(value).toLowerCase().replace(/[^a-z0-9]/g, '');
exports.normalize = normalize;
/**
 * Collector numbers for equality checks: "034"→"34", "212/203"→"212", "gg44" stays.
 * Do NOT use raw substring includes() against normalized titles — "34" matches inside "114".
 */
const normalizeCardNumber = (cardNumber) => {
    if (!cardNumber)
        return '';
    let s = (0, exports.decodeHtmlEntities)(cardNumber).toLowerCase().trim();
    if (s.includes('/'))
        s = s.split('/')[0].trim();
    s = s.replace(/^#/, '').trim();
    const hyphenated = s.replace(/\s+/g, '');
    // One Piece codes: OP01-003, ST01-001, P-001. Keep the prefix so "003" ≠ OP01-003.
    if (/^[a-z]+\d*-\d+[a-z]*$/i.test(hyphenated)) {
        return hyphenated.replace(/[^a-z0-9]/g, '');
    }
    s = hyphenated.replace(/[^a-z0-9]/g, '');
    if (/^\d+$/.test(s))
        return String(parseInt(s, 10));
    return s;
};
exports.normalizeCardNumber = normalizeCardNumber;
/** Collector numbers explicitly marked in a PC title (#34) or URL slug (...-34). */
const extractCardNumbers = (text) => {
    if (!text)
        return [];
    const t = (0, exports.decodeHtmlEntities)(text).toLowerCase();
    const found = new Set();
    const add = (raw) => {
        const n = (0, exports.normalizeCardNumber)(raw);
        if (n)
            found.add(n);
    };
    // Hyphenated TCG codes first so #OP01-003 is not truncated to OP01.
    for (const m of t.matchAll(/#\s*([a-z]+\d*-\d+[a-z]*)/g))
        add(m[1]);
    for (const m of t.matchAll(/-([a-z]+\d+-\d+[a-z]*)(?:\?|#|$|\/)/g))
        add(m[1]);
    for (const m of t.matchAll(/\b([a-z]+\d+-\d+[a-z]*)\b/g))
        add(m[1]);
    for (const m of t.matchAll(/#\s*([a-z]*\d+[a-z]*)/g))
        add(m[1]);
    for (const m of t.matchAll(/-([a-z]*\d+[a-z]*)(?:\?|#|$|\/)/g))
        add(m[1]);
    return [...found];
};
exports.extractCardNumbers = extractCardNumbers;
const cleanSetName = (value) => (0, exports.decodeHtmlEntities)(value)
    .toLowerCase()
    .replace(/[^a-z0-9&']/g, ' ');
/**
 * Company-graded condition labels present on PriceCharting product pages.
 * Plain "Grade N" rows are a generic price-by-condition guide, NOT company
 * slab prices — we deliberately exclude them so we never present them as real
 * PSA/CGC slab values.
 */
exports.COMPANY_LABELS = [
    { label: 'Ungraded', grader: 'ungraded', grade: 'ungraded' },
    { label: 'PSA 10', grader: 'psa', grade: '10' },
    { label: 'CGC 10', grader: 'cgc', grade: '10' },
    { label: 'CGC 10 Pristine', grader: 'cgc', grade: '10 pristine' },
    { label: 'CGC 10 Prist.', grader: 'cgc', grade: '10 pristine' },
    { label: 'BGS 10', grader: 'bgs', grade: '10' },
    { label: 'BGS 10 Black', grader: 'bgs', grade: '10 black' },
    { label: 'SGC 10', grader: 'sgc', grade: '10' },
    { label: 'TAG 10', grader: 'tag', grade: '10' },
    { label: 'ACE 10', grader: 'ace', grade: '10' },
];
const hasReverseFinish = (hay) => /reverse[\s\-]*holo/.test(hay);
const hasFirstEditionFinish = (hay) => /1st[\s\-]*edition/.test(hay) || /first[\s\-]*edition/.test(hay);
const detectPcFinishFamily = (title, url) => {
    const hay = `${title || ''} ${url || ''}`.toLowerCase();
    const reverse = hasReverseFinish(hay);
    const firstEd = hasFirstEditionFinish(hay);
    if (reverse && firstEd)
        return '1steditionreverse';
    if (reverse)
        return 'reverse';
    if (firstEd)
        return '1stedition';
    return 'standard';
};
exports.detectPcFinishFamily = detectPcFinishFamily;
const expectedPcFinishFamily = (variant) => {
    const v = (variant || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const reverse = v.includes('reverse');
    const firstEd = v.includes('1stedition') || v.includes('firstedition');
    if (reverse && firstEd)
        return '1steditionreverse';
    if (reverse)
        return 'reverse';
    if (firstEd)
        return '1stedition';
    return 'standard';
};
exports.expectedPcFinishFamily = expectedPcFinishFamily;
const pcFinishSlug = (family) => {
    switch (family) {
        case 'reverse':
            return 'reverse-holo';
        case '1stedition':
            return '1st-edition';
        case '1steditionreverse':
            return '1st-edition-reverse-holo';
        default:
            return '';
    }
};
exports.pcFinishSlug = pcFinishSlug;
const pcFinishSearchTerms = (variant) => {
    const family = (0, exports.expectedPcFinishFamily)(variant);
    switch (family) {
        case 'reverse':
            return 'reverse holo';
        case '1stedition':
            return '1st edition';
        case '1steditionreverse':
            return '1st edition reverse holo';
        default:
            return '';
    }
};
exports.pcFinishSearchTerms = pcFinishSearchTerms;
/** Map a PriceCharting product back onto our variantKey vocabulary. */
const inferVariantKeyFromPc = (title, url) => {
    switch ((0, exports.detectPcFinishFamily)(title, url)) {
        case 'reverse':
            return 'reverseholofoil';
        case '1steditionreverse':
            return '1steditionholofoil';
        case '1stedition':
            return '1stedition';
        default:
            return 'normal';
    }
};
exports.inferVariantKeyFromPc = inferVariantKeyFromPc;
const finishesMatch = (expected, detected, options) => {
    if (expected === detected)
        return true;
    // Alias only untagged PC pages onto reverse/1st requests — never the reverse.
    if ((options === null || options === void 0 ? void 0 : options.allowStandardAlias) &&
        expected !== 'standard' &&
        detected === 'standard') {
        return true;
    }
    return false;
};
exports.finishesMatch = finishesMatch;
let lastScrapeTime = 0;
const throttle = async (delayMs) => {
    const now = Date.now();
    const elapsed = now - lastScrapeTime;
    if (elapsed < delayMs) {
        await delay(delayMs - elapsed);
    }
    lastScrapeTime = Date.now();
};
/**
 * A lower delay for the bulk nightly sweep (default on-demand calls keep the
 * conservative 1.5s). Shared module state means the sweep and on-demand
 * requests all respect the tighter gap.
 */
const fetchPriceChartingHtml = async (url, delayMs = REQUEST_DELAY_MS) => {
    await throttle(delayMs);
    // PriceCharting rate-limits bursty traffic; back off and retry on 429.
    for (let attempt = 0; attempt < 3; attempt++) {
        const response = await withTimeout(fetch(url, {
            headers: {
                Accept: 'text/html,application/xhtml+xml',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }), REQUEST_TIMEOUT_MS + 2000);
        if (response.status === 429) {
            await delay(15000 * (attempt + 1));
            continue;
        }
        if (!response.ok) {
            throw new Error(`pricecharting_${response.status}`);
        }
        const html = await response.text();
        // Cloudflare interstitial / soft blocks come back as 200 with a challenge page.
        if (html.includes('Just a moment...') ||
            html.includes('cf-browser-verification') ||
            html.includes('Enable JavaScript and cookies to continue')) {
            throw new Error('pricecharting_challenge');
        }
        return html;
    }
    throw new Error('pricecharting_429');
};
exports.fetchPriceChartingHtml = fetchPriceChartingHtml;
const parseSearchRows = (html) => {
    const rows = [];
    const rowRegex = /<tr id="product-(\d+)"([\s\S]*?)<\/tr>/g;
    let match = rowRegex.exec(html);
    while (match) {
        const [, productId, rowBody] = match;
        let url = '';
        let title = '';
        const anchorRegex = /<a href="(https:\/\/www\.pricecharting\.com\/game\/[^"]+)"[^>]*>\s*([\s\S]*?)<\/a>/g;
        let anchor;
        while ((anchor = anchorRegex.exec(rowBody)) !== null) {
            const text = (0, exports.decodeHtmlEntities)(anchor[2].replace(/<[^>]+>/g, ''))
                .replace(/\s+/g, ' ')
                .trim();
            if (url === '')
                url = (0, exports.decodeHtmlEntities)(anchor[1]);
            if (title === '' && text !== '')
                title = text;
        }
        let setName = '';
        const setMatch = rowBody.match(/<a href="\/console\/[^"]+">\s*([\s\S]*?)\s*<\/a>/);
        if (setMatch) {
            setName = (0, exports.decodeHtmlEntities)(setMatch[1].replace(/<[^>]+>/g, ''))
                .replace(/\s+/g, ' ')
                .trim();
        }
        if (url && title) {
            rows.push({ productId, url, title, setName });
        }
        match = rowRegex.exec(html);
    }
    return rows;
};
exports.parseSearchRows = parseSearchRows;
/** Promo / Promos / Black Star Promos collapse to a shared "promo" token. */
const setTokens = (value) => cleanSetName(value)
    .split(' ')
    .filter((t) => t.length > 2)
    .map((t) => (t === 'promos' ? 'promo' : t));
const isPromoSet = (value) => setTokens(value || '').includes('promo');
const setNamesMatch = (candidateSet, inputSet) => {
    const c = cleanSetName(candidateSet);
    const i = cleanSetName(inputSet);
    if (!i)
        return true;
    if (c.includes(i) || i.includes(c))
        return true;
    const cTokens = new Set(setTokens(candidateSet));
    const iTokens = setTokens(inputSet);
    if (iTokens.length === 0)
        return true;
    const hits = iTokens.filter((t) => cTokens.has(t)).length;
    return hits >= Math.min(2, iTokens.length);
};
/** True when the listing title names the same set (skipped if no setName given). */
const titleIncludesSet = (candidateTitle, setName) => {
    if (!setName)
        return true;
    return setNamesMatch(candidateTitle, setName);
};
exports.titleIncludesSet = titleIncludesSet;
const titleIncludesName = (candidateTitle, cardName) => {
    const t = (0, exports.normalize)(candidateTitle);
    const name = (0, exports.normalize)(cardName);
    if (!name)
        return true;
    if (t.includes(name))
        return true;
    const tokens = name.split(' ').filter((tok) => tok.length >= 4);
    return tokens.length > 0 && tokens.every((tok) => t.includes(tok));
};
exports.titleIncludesName = titleIncludesName;
/**
 * True when the candidate title/URL refers to the same collector number.
 * Prefer explicit #N / slug-N markers; never treat "34" as a hit inside "114".
 */
const titleIncludesNumber = (candidateTitle, cardNumber, candidateUrl) => {
    if (!cardNumber)
        return true;
    const want = (0, exports.normalizeCardNumber)(cardNumber);
    if (!want)
        return true;
    const marked = [
        ...(0, exports.extractCardNumbers)(candidateTitle),
        ...(0, exports.extractCardNumbers)(candidateUrl),
    ];
    if (marked.length > 0)
        return marked.includes(want);
    // Fallback on lightly tokenized text (keep separators) with digit boundaries.
    const hay = `${candidateTitle} ${candidateUrl || ''}`.toLowerCase();
    const escaped = want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^0-9a-z])${escaped}(?:[^0-9a-z]|$)`).test(hay);
};
exports.titleIncludesNumber = titleIncludesNumber;
const scoreCandidate = (candidate, input) => {
    let score = 0;
    const nameForMatch = input.game === 'onepiece' ? (0, onePiecePriceCharting_1.stripOpNameDecorators)(input.cardName) || input.cardName : input.cardName;
    if ((0, exports.titleIncludesName)(candidate.title, nameForMatch))
        score += 60;
    const setsMatch = input.game === 'onepiece'
        ? (0, onePiecePriceCharting_1.opSetNamesMatch)(candidate.setName, input.setName || '')
        : Boolean(input.setName && setNamesMatch(candidate.setName, input.setName));
    if (input.setName && setsMatch)
        score += 30;
    else if (input.setName && isPromoSet(input.setName) && isPromoSet(candidate.setName))
        score += 20;
    // Only award number points when we actually have a collector number to check.
    // Missing numbers used to +20 every row, so search order picked SV49 over #9.
    if (input.cardNumber && (0, exports.titleIncludesNumber)(candidate.title, input.cardNumber, candidate.url)) {
        score += 20;
    }
    if (input.game === 'onepiece') {
        const want = (0, onePiecePriceCharting_1.expectedOpPrintFamily)(input);
        const got = (0, onePiecePriceCharting_1.detectOpPrintFamily)(candidate.title, candidate.url);
        if ((0, onePiecePriceCharting_1.opPrintFamiliesMatch)(want, got))
            score += 25;
    }
    else {
        const wantFinish = (0, exports.expectedPcFinishFamily)(input.variant);
        const gotFinish = (0, exports.detectPcFinishFamily)(candidate.title, candidate.url);
        if ((0, exports.finishesMatch)(wantFinish, gotFinish, {
            allowStandardAlias: Boolean(input.allowStandardFinishAlias),
        })) {
            score += 25;
        }
    }
    return score;
};
exports.scoreCandidate = scoreCandidate;
const SEALED_SKU_RE = /\b(tin|collection|etb|elite trainer|booster|box|blister|bundle|case)\b/i;
const looksLikeSealedSku = (title, url) => SEALED_SKU_RE.test(`${title || ''} ${url || ''}`);
exports.looksLikeSealedSku = looksLikeSealedSku;
/** Collector number marked in the title (#SV49) or trailing URL slug (-sv49 / -9). */
const primaryCollectorNumber = (candidate) => {
    const fromTitle = (0, exports.extractCardNumbers)(candidate.title);
    if (fromTitle.length > 0)
        return fromTitle[0];
    const fromUrl = (0, exports.extractCardNumbers)(candidate.url);
    if (fromUrl.length > 0)
        return fromUrl[fromUrl.length - 1];
    return '';
};
exports.primaryCollectorNumber = primaryCollectorNumber;
/**
 * When the card number is unknown, drop the wrong print family:
 * main-set Hidden Fates Charizard GX must not match #SV49, and Shiny Vault
 * must not match #9. If several numeric printings remain (regular vs full art
 * in the same set), refuse to guess.
 */
const selectBestProductMatch = (rows, input) => {
    var _a;
    let pool = rows
        .map((row) => ({ row, score: (0, exports.scoreCandidate)(row, input) }))
        .filter(({ row, score }) => (0, exports.isAcceptableMatch)(row, input) && score >= 50);
    if (pool.length === 0)
        return null;
    const inputLooksSealed = SEALED_SKU_RE.test(input.cardName || '');
    if (!inputLooksSealed) {
        const singles = pool.filter(({ row }) => !(0, exports.looksLikeSealedSku)(row.title, row.url));
        if (singles.length > 0)
            pool = singles;
    }
    if (!input.cardNumber) {
        const wantSecret = (0, setPrintFamily_1.setLooksLikeSubsetPrint)(input.setName);
        const family = pool.filter(({ row }) => {
            const n = (0, exports.primaryCollectorNumber)(row);
            if (!n)
                return true;
            return (0, setPrintFamily_1.numberLooksSecretRare)(n) === wantSecret;
        });
        const hadNumbered = pool.some(({ row }) => Boolean((0, exports.primaryCollectorNumber)(row)));
        if (family.length > 0)
            pool = family;
        else if (hadNumbered)
            return null;
        const numbered = pool.filter(({ row }) => Boolean((0, exports.primaryCollectorNumber)(row)));
        if (numbered.length > 0)
            pool = numbered;
        const nums = new Set(pool.map(({ row }) => (0, exports.primaryCollectorNumber)(row)).filter(Boolean));
        if (nums.size > 1)
            return null;
    }
    pool.sort((a, b) => b.score - a.score);
    return (_a = pool[0]) !== null && _a !== void 0 ? _a : null;
};
exports.selectBestProductMatch = selectBestProductMatch;
const isAcceptableMatch = (candidate, input) => {
    const nameForMatch = input.game === 'onepiece' ? (0, onePiecePriceCharting_1.stripOpNameDecorators)(input.cardName) || input.cardName : input.cardName;
    const hasNumber = (0, exports.titleIncludesNumber)(candidate.title, input.cardNumber, candidate.url);
    const hasName = (0, exports.titleIncludesName)(candidate.title, nameForMatch);
    const candidateIsOp = /one\s*piece/i.test(candidate.setName);
    if (input.game === 'onepiece') {
        if (!candidateIsOp)
            return false;
        const family = (0, onePiecePriceCharting_1.expectedOpPrintFamily)(input);
        const hasFamily = (0, onePiecePriceCharting_1.opPrintFamiliesMatch)(family, (0, onePiecePriceCharting_1.detectOpPrintFamily)(candidate.title, candidate.url));
        if (!hasFamily)
            return false;
        const hasSet = (0, onePiecePriceCharting_1.opSetNamesMatch)(candidate.setName, input.setName || '');
        // OPTCG files anniversary reprints under Promotion Cards; PriceCharting
        // often keeps them on the original deck console. Number + family is enough.
        const setOk = hasSet || Boolean(input.cardNumber && hasNumber && (0, onePiecePriceCharting_1.opFamilyAllowsSetMismatch)(family));
        if (input.cardNumber)
            return hasName && hasNumber && setOk;
        return setOk && hasName;
    }
    const hasSet = setNamesMatch(candidate.setName, input.setName || '');
    if (candidateIsOp)
        return false;
    const hasFinish = (0, exports.finishesMatch)((0, exports.expectedPcFinishFamily)(input.variant), (0, exports.detectPcFinishFamily)(candidate.title, candidate.url), { allowStandardAlias: Boolean(input.allowStandardFinishAlias) });
    // PriceCharting collapses era promo lines (XY/SM/SWSH Black Star Promos) into
    // the generic "Pokemon Promo" console. When the card number matches (XY143,
    // SM166, …) that is enough to disambiguate — requiring the set name too
    // blanks slab prices for most promo cards.
    const promoBridge = !!input.cardNumber &&
        hasNumber &&
        isPromoSet(input.setName) &&
        isPromoSet(candidate.setName);
    if (!hasFinish)
        return false;
    if (input.cardNumber) {
        return hasName && hasNumber && (hasSet || promoBridge);
    }
    return hasSet && hasName;
};
exports.isAcceptableMatch = isAcceptableMatch;
/**
 * Strict product search: returns the best candidate ONLY when the card number
 * (when known), set, and name all line up. Returns null when nothing credible
 * matches instead of silently picking a wrong card. Handles PriceCharting's
 * behavior of redirecting an unambiguous search straight to the product page.
 */
const searchBestProduct = async (input, delayMs = REQUEST_DELAY_MS) => {
    const opFamily = input.game === 'onepiece' ? (0, onePiecePriceCharting_1.expectedOpPrintFamily)(input) : null;
    const query = input.game === 'onepiece'
        ? [
            (0, onePiecePriceCharting_1.stripOpNameDecorators)(input.cardName) || input.cardName,
            input.cardNumber,
            'One Piece',
            (0, onePiecePriceCharting_1.opSearchSetName)(input.setName, opFamily),
            (0, onePiecePriceCharting_1.opFamilySearchTerms)(opFamily),
        ]
            .filter(Boolean)
            .join(' ')
            .trim()
        : [input.cardName, input.cardNumber, input.setName, (0, exports.pcFinishSearchTerms)(input.variant)]
            .filter(Boolean)
            .join(' ')
            .trim();
    const searchUrl = `https://www.pricecharting.com/search-products?exclude-variants=false&q=${encodeURIComponent(query)}&region-name=all&type=prices&go=Go`;
    const searchHtml = await (0, exports.fetchPriceChartingHtml)(searchUrl, delayMs);
    // Direct hit: search landed on the product page itself (no result rows).
    if (searchHtml.includes('id="full-prices"')) {
        const pop = (0, exports.parsePopData)(searchHtml);
        const titleMatch = searchHtml.match(/<meta itemprop="name" content="([^"]+)"/);
        const setMatch = searchHtml.match(/<meta itemprop="gamePlatform" content="([^"]+)"/);
        const title = titleMatch
            ? (0, exports.decodeHtmlEntities)(titleMatch[1]).replace(/\s+/g, ' ').trim()
            : '';
        const setName = setMatch
            ? (0, exports.decodeHtmlEntities)(setMatch[1]).replace(/\s+/g, ' ').trim()
            : '';
        const candidate = { productId: pop.productId || '', url: searchUrl, title, setName };
        const best = pop.productId ? (0, exports.selectBestProductMatch)([candidate], input) : null;
        if (best) {
            return {
                productId: best.row.productId,
                url: searchUrl,
                title,
                setName,
                matchScore: best.score,
            };
        }
        return null;
    }
    const rows = (0, exports.parseSearchRows)(searchHtml);
    if (rows.length === 0)
        return null;
    const best = (0, exports.selectBestProductMatch)(rows, input);
    if (!best)
        return null;
    return {
        productId: best.row.productId,
        url: best.row.url,
        title: best.row.title,
        setName: best.row.setName,
        matchScore: best.score,
    };
};
exports.searchBestProduct = searchBestProduct;
const parsePrice = (raw) => {
    const cleaned = raw.replace(/[^0-9.,]/g, '');
    if (!cleaned)
        return null;
    const value = parseFloat(cleaned.replace(/,/g, ''));
    return Number.isFinite(value) && value > 0 ? value : null;
};
const parsePopArray = (raw) => {
    if (!Array.isArray(raw))
        return null;
    if (raw.length < 10)
        return null;
    const nums = [];
    for (const value of raw) {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0)
            return null;
        nums.push(Math.round(n));
    }
    return nums;
};
/** Pure parser for the VGPC.pop_data block + VGPC.product id on a product page. */
const parsePopData = (html) => {
    let popData = {};
    const popMatch = html.match(/VGPC\.pop_data\s*=\s*(\{[\s\S]*?\});/);
    if (popMatch) {
        try {
            popData = JSON.parse(popMatch[1]);
        }
        catch (_a) {
            popData = {};
        }
    }
    let productId = null;
    const productMatch = html.match(/VGPC\.product\s*=\s*\{[\s\S]*?id:\s*(\d+)/);
    if (productMatch)
        productId = productMatch[1];
    return {
        psaPop: parsePopArray(popData.psa),
        cgcPop: parsePopArray(popData.cgc),
        productId,
    };
};
exports.parsePopData = parsePopData;
/** Normalized label key — unifies e.g. "CGC 10 Pristine" with dropdown "CGC 10 Prist.". */
const normLabel = (label) => label
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .replace('pristine', 'prist')
    .trim();
/** Pure parser for the #full-prices table + completed-auctions sold counts. */
const parseFullPrices = (html) => {
    var _a;
    const gradedPrices = [];
    const soldCounts = new Map();
    const pricesSection = html.slice(html.indexOf('id="full-prices"'));
    const soldSelect = html.match(/<select id="completed-auctions-condition"[\s\S]*?<\/select>/);
    if (soldSelect) {
        const optionRegex = /<option[^>]*>([^<]+)\((\d+)\)<\/option>/g;
        let option;
        while ((option = optionRegex.exec(soldSelect[0])) !== null) {
            const label = option[1].replace(/\s+/g, ' ').trim();
            const count = parseInt(option[2], 10);
            if (label && Number.isFinite(count))
                soldCounts.set(normLabel(label), count);
        }
    }
    const rowRegex = /<tr>\s*<td>([^<]+)<\/td>\s*<td class="price js-price">([^<]+)<\/td>\s*<\/tr>/g;
    let row;
    const priceByLabel = new Map();
    while ((row = rowRegex.exec(pricesSection)) !== null) {
        const label = row[1].replace(/\s+/g, ' ').trim();
        const value = parsePrice(row[2]);
        if (label && value !== undefined)
            priceByLabel.set(normLabel(label), value);
    }
    const seen = new Set();
    for (const entry of exports.COMPANY_LABELS) {
        const rawPrice = priceByLabel.get(normLabel(entry.label));
        if (rawPrice === undefined)
            continue;
        const key = `${entry.grader}::${entry.grade}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        gradedPrices.push({
            grader: entry.grader,
            grade: entry.grade,
            price: rawPrice,
            soldListings: (_a = soldCounts.get(normLabel(entry.label))) !== null && _a !== void 0 ? _a : 0,
            lastSoldDate: null,
            lastSoldPrice: null,
        });
    }
    const lastSold = (0, exports.parseLastSoldByGrade)(html);
    for (const p of gradedPrices) {
        const sold = lastSold.get(`${p.grader}::${p.grade}`);
        if (!sold)
            continue;
        p.lastSoldDate = sold.date;
        p.lastSoldPrice = sold.price;
    }
    return gradedPrices;
};
exports.parseFullPrices = parseFullPrices;
const parseSaleRows = (tableHtml) => {
    const sales = [];
    const rowRegex = /<tr[^>]*id="ebay-\d+"[\s\S]*?<td class="date">\s*([^<]+?)\s*<\/td>[\s\S]*?<td class="title">[\s\S]*?>([\s\S]*?)<\/a>[\s\S]*?<span class="js-price"[^>]*>\s*([^<]+?)\s*<\/span>/gi;
    let row;
    while ((row = rowRegex.exec(tableHtml)) !== null) {
        const date = row[1].trim();
        const title = (0, exports.decodeHtmlEntities)(row[2].replace(/<[^>]+>/g, ''))
            .replace(/\s+/g, ' ')
            .trim();
        const price = parsePrice(row[3]);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || price == null)
            continue;
        sales.push({ date, price, title });
    }
    return sales;
};
/**
 * Latest completed sale per company grade from the Sold Listings tables.
 * PriceCharting already fetched this HTML for the sold guide — no extra request.
 */
const parseLastSoldByGrade = (html) => {
    const latest = new Map();
    const classToGrade = new Map();
    const soldSelect = html.match(/<select id="completed-auctions-condition"[\s\S]*?<\/select>/);
    if (soldSelect) {
        const optionRegex = /<option value="([^"]+)"[^>]*>\s*([^<]*?)\((\d+)\)\s*<\/option>/g;
        let option;
        while ((option = optionRegex.exec(soldSelect[0])) !== null) {
            const className = option[1].trim();
            const label = option[2].replace(/\s+/g, ' ').trim();
            const company = exports.COMPANY_LABELS.find((e) => normLabel(e.label) === normLabel(label));
            if (company)
                classToGrade.set(className, { grader: company.grader, grade: company.grade });
        }
    }
    if (classToGrade.size === 0) {
        classToGrade.set('completed-auctions-manual-only', { grader: 'psa', grade: '10' });
    }
    for (const [className, grade] of classToGrade) {
        const marker = `class="${className}">`;
        let from = 0;
        let tableHtml = '';
        while (from < html.length) {
            const i = html.indexOf(marker, from);
            if (i < 0)
                break;
            const chunk = html.slice(i, i + 120000);
            if (chunk.includes('<table') && /id="ebay-\d+"/.test(chunk)) {
                tableHtml = chunk;
                break;
            }
            from = i + marker.length;
        }
        if (!tableHtml)
            continue;
        const sales = parseSaleRows(tableHtml);
        if (sales.length === 0)
            continue;
        const newest = sales.reduce((a, b) => (a.date >= b.date ? a : b));
        latest.set(`${grade.grader}::${grade.grade}`, newest);
    }
    return latest;
};
exports.parseLastSoldByGrade = parseLastSoldByGrade;
/**
 * One product page carries everything: population census (VGPC.pop_data),
 * the full price guide (#full-prices), and sold-count dropdown options.
 */
const fetchProductPageData = async (url, delayMs = REQUEST_DELAY_MS) => {
    const html = await (0, exports.fetchPriceChartingHtml)(url, delayMs);
    if (!(0, exports.isProductPageHtml)(html)) {
        throw new Error('pricecharting_not_product');
    }
    const pop = (0, exports.parsePopData)(html);
    const titleMatch = html.match(/<meta itemprop="name" content="([^"]+)"/);
    const setMatch = html.match(/<meta itemprop="gamePlatform" content="([^"]+)"/);
    return {
        productId: pop.productId,
        title: titleMatch
            ? (0, exports.decodeHtmlEntities)(titleMatch[1]).replace(/\s+/g, ' ').trim()
            : null,
        setName: setMatch
            ? (0, exports.decodeHtmlEntities)(setMatch[1]).replace(/\s+/g, ' ').trim()
            : null,
        psaPop: pop.psaPop,
        cgcPop: pop.cgcPop,
        gradedPrices: (0, exports.parseFullPrices)(html),
    };
};
exports.fetchProductPageData = fetchProductPageData;
/**
 * PriceCharting URL slug: lowercase, spaces -> dashes, keep `&` and `'`.
 * Tag Team cards use the ampersand form (`magikarp-&-wailord-gx-161`); rewriting
 * `&` to `and` lands on a non-product page with no slab prices. Apostrophes are
 * kept so `Rocket's Wobbuffet` hits `rocket's-wobbuffet-reverse-holo-47`.
 */
const slugify = (value) => (0, exports.decodeHtmlEntities)(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9&']+/g, '-')
    .replace(/^-+|-+$/g, '');
exports.slugify = slugify;
/** Console slug, e.g. "Pokemon Scarlet & Violet 151" -> "pokemon-scarlet-&-violet-151". */
const consoleSlug = (consoleName) => (0, exports.slugify)(consoleName);
exports.consoleSlug = consoleSlug;
/** Card slug, e.g. "Magikarp & Wailord-GX" -> "magikarp-&-wailord-gx". */
const cardSlug = (cardName) => (0, exports.slugify)(cardName);
exports.cardSlug = cardSlug;
/**
 * Direct product URL built from a known console name + card name/number, e.g.
 * https://www.pricecharting.com/game/pokemon-scarlet-&-violet-151/pikachu-173
 * Saves the search round-trip during the bulk sweep. Result is ALWAYS verified
 * against the parsed page before being trusted.
 */
const buildDirectProductUrl = (consoleName, cardName, cardNumber, variant, options) => {
    if ((options === null || options === void 0 ? void 0 : options.game) === 'onepiece') {
        const family = (0, onePiecePriceCharting_1.expectedOpPrintFamily)({ cardName, variant });
        const finish = (0, onePiecePriceCharting_1.opFamilySlug)(family);
        const finishPart = finish ? `-${finish}` : '';
        const numberPart = cardNumber ? `-${cardNumber.toLowerCase()}` : '';
        const slugName = (0, onePiecePriceCharting_1.stripOpPeriodsForSlug)((0, onePiecePriceCharting_1.stripOpNameDecorators)(cardName) || cardName);
        return `https://www.pricecharting.com/game/${(0, exports.consoleSlug)(consoleName)}/${(0, exports.cardSlug)(slugName)}${finishPart}${numberPart}`;
    }
    const finish = (0, exports.pcFinishSlug)((0, exports.expectedPcFinishFamily)(variant));
    const finishPart = finish ? `-${finish}` : '';
    const numberPart = cardNumber ? `-${cardNumber}` : '';
    return `https://www.pricecharting.com/game/${(0, exports.consoleSlug)(consoleName)}/${(0, exports.cardSlug)(cardName)}${finishPart}${numberPart}`;
};
exports.buildDirectProductUrl = buildDirectProductUrl;
/** True when the fetched HTML is a real product page (not a 404/redirect/list). */
const isProductPageHtml = (html) => html.includes('VGPC.product') && html.includes('id="full-prices"');
exports.isProductPageHtml = isProductPageHtml;
/**
 * Verifies a parsed product page actually IS the card we asked for. Used for
 * direct-URL hits, which are never trusted without this check.
 */
const verifyProductPage = (page, input, pageUrl) => {
    if (!page.productId || !page.title || !page.setName)
        return false;
    const candidate = {
        productId: page.productId,
        url: pageUrl || '',
        title: page.title,
        setName: page.setName,
    };
    return (0, exports.selectBestProductMatch)([candidate], input) != null;
};
exports.verifyProductPage = verifyProductPage;
