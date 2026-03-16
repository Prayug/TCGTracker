"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findTcgPlayerListing = findTcgPlayerListing;
exports.clearOnePieceTcgPlayerCache = clearOnePieceTcgPlayerCache;
const logger_1 = require("../../utils/logger");
const TCGCSV_BASE = 'https://tcgcsv.com/tcgplayer';
const ONE_PIECE_CATEGORY = 68;
const CACHE_TTL_MS = 60 * 60 * 1000;
let setGroupMap = null;
let setGroupMapFetchedAt = 0;
const groupCache = new Map();
async function fetchTcgcsv(path) {
    var _a;
    const response = await fetch(`${TCGCSV_BASE}${path}`, {
        headers: {
            Accept: 'application/json',
            'User-Agent': 'TCGTracker/1.0 (+https://github.com/tcgtracker)',
        },
    });
    if (!response.ok) {
        throw new Error(`TCGCSV ${response.status}: ${response.statusText}`);
    }
    const payload = (await response.json());
    return ((_a = payload.results) !== null && _a !== void 0 ? _a : payload);
}
function getProductNumber(product) {
    var _a, _b, _c;
    const numberField = (_a = product.extendedData) === null || _a === void 0 ? void 0 : _a.find((field) => field.name === 'Number');
    return (_c = (_b = numberField === null || numberField === void 0 ? void 0 : numberField.value) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : '';
}
function pickBestPrice(prices) {
    var _a;
    if (!prices.length)
        return { marketPrice: null, lowPrice: null };
    const ranked = [...prices].sort((a, b) => {
        var _a, _b, _c, _d;
        const aMarket = (_a = a.marketPrice) !== null && _a !== void 0 ? _a : 0;
        const bMarket = (_b = b.marketPrice) !== null && _b !== void 0 ? _b : 0;
        if (bMarket !== aMarket)
            return bMarket - aMarket;
        return ((_c = b.lowPrice) !== null && _c !== void 0 ? _c : 0) - ((_d = a.lowPrice) !== null && _d !== void 0 ? _d : 0);
    });
    const best = (_a = ranked.find((p) => { var _a; return ((_a = p.marketPrice) !== null && _a !== void 0 ? _a : 0) > 0; })) !== null && _a !== void 0 ? _a : ranked[0];
    return { marketPrice: best.marketPrice, lowPrice: best.lowPrice };
}
async function loadSetGroupMap(forceRefresh = false) {
    var _a;
    if (!forceRefresh && setGroupMap && Date.now() - setGroupMapFetchedAt < CACHE_TTL_MS) {
        return setGroupMap;
    }
    const groups = await fetchTcgcsv(`/${ONE_PIECE_CATEGORY}/groups`);
    const map = new Map();
    for (const group of groups) {
        const abbr = (_a = group.abbreviation) === null || _a === void 0 ? void 0 : _a.trim();
        if (!abbr)
            continue;
        const opMatch = abbr.match(/^OP(\d+)$/i);
        if (opMatch) {
            map.set(`OP-${parseInt(opMatch[1], 10).toString().padStart(2, '0')}`, group.groupId);
            continue;
        }
        if (/^ST-\d+$/i.test(abbr)) {
            map.set(abbr.toUpperCase(), group.groupId);
        }
    }
    setGroupMap = map;
    setGroupMapFetchedAt = Date.now();
    return map;
}
async function loadGroupListings(groupId, forceRefresh = false) {
    var _a, _b, _c;
    const cached = groupCache.get(groupId);
    if (!forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.byNumber;
    }
    const [products, prices] = await Promise.all([
        fetchTcgcsv(`/${ONE_PIECE_CATEGORY}/${groupId}/products`),
        fetchTcgcsv(`/${ONE_PIECE_CATEGORY}/${groupId}/prices`),
    ]);
    const pricesByProduct = new Map();
    for (const price of prices) {
        const bucket = (_a = pricesByProduct.get(price.productId)) !== null && _a !== void 0 ? _a : [];
        bucket.push(price);
        pricesByProduct.set(price.productId, bucket);
    }
    const byNumber = new Map();
    for (const product of products) {
        const cardNumber = getProductNumber(product);
        if (!cardNumber)
            continue;
        const { marketPrice, lowPrice } = pickBestPrice((_b = pricesByProduct.get(product.productId)) !== null && _b !== void 0 ? _b : []);
        const listing = {
            productId: product.productId,
            name: product.name,
            cardNumber,
            marketPrice,
            lowPrice,
        };
        const bucket = (_c = byNumber.get(cardNumber)) !== null && _c !== void 0 ? _c : [];
        bucket.push(listing);
        byNumber.set(cardNumber, bucket);
    }
    groupCache.set(groupId, { fetchedAt: Date.now(), byNumber });
    return byNumber;
}
function extractVariantLabel(name) {
    const match = name.match(/\(([^)]+)\)\s*$/);
    return match ? match[1].trim().toUpperCase() : null;
}
const VARIANT_EQUIVALENTS = {
    SP: new Set(['SP', 'TR']),
    TR: new Set(['TR', 'SP']),
};
function variantsEquivalent(a, b) {
    var _a, _b;
    if (!a && !b)
        return true;
    if (!a || !b)
        return false;
    if (a === b)
        return true;
    return (_b = (_a = VARIANT_EQUIVALENTS[a]) === null || _a === void 0 ? void 0 : _a.has(b)) !== null && _b !== void 0 ? _b : false;
}
function scoreListingMatch(listing, cardName, cardImageId) {
    const cardVariant = extractVariantLabel(cardName);
    const listingVariant = extractVariantLabel(listing.name);
    const cardLower = cardName.toLowerCase();
    const listingLower = listing.name.toLowerCase();
    let score = 0;
    if (variantsEquivalent(cardVariant, listingVariant))
        score += 20;
    if (cardLower.includes('parallel') && listingLower.includes('parallel'))
        score += 15;
    if (cardLower.includes('reprint') && listingLower.includes('reprint'))
        score += 15;
    if (cardImageId.includes('_p1') && listingLower.includes('parallel'))
        score += 10;
    if (cardImageId.includes('_p2') && (listingVariant === 'TR' || listingVariant === 'SP'))
        score += 10;
    if (cardImageId.includes('_r') && listingLower.includes('reprint'))
        score += 10;
    if (!cardVariant && !listingVariant && !cardImageId.match(/_[pr]\d/i))
        score += 5;
    return score;
}
function pickBestListing(listings, cardName, cardImageId) {
    var _a;
    if (!listings.length)
        return null;
    if (listings.length === 1)
        return listings[0];
    const ranked = [...listings].sort((a, b) => {
        var _a, _b;
        const scoreDiff = scoreListingMatch(b, cardName, cardImageId) - scoreListingMatch(a, cardName, cardImageId);
        if (scoreDiff !== 0)
            return scoreDiff;
        return ((_a = b.marketPrice) !== null && _a !== void 0 ? _a : 0) - ((_b = a.marketPrice) !== null && _b !== void 0 ? _b : 0);
    });
    return (_a = ranked[0]) !== null && _a !== void 0 ? _a : null;
}
async function findTcgPlayerListing(input) {
    try {
        const groupMap = await loadSetGroupMap();
        const groupId = groupMap.get(input.setId);
        if (!groupId)
            return null;
        const listingsByNumber = await loadGroupListings(groupId);
        const candidates = listingsByNumber.get(input.cardSetId);
        if (!(candidates === null || candidates === void 0 ? void 0 : candidates.length))
            return null;
        return pickBestListing(candidates, input.cardName, input.cardImageId);
    }
    catch (error) {
        logger_1.logger.warn('One Piece TCGPlayer lookup failed', {
            setId: input.setId,
            cardSetId: input.cardSetId,
            error: error.message,
        });
        return null;
    }
}
function clearOnePieceTcgPlayerCache() {
    setGroupMap = null;
    setGroupMapFetchedAt = 0;
    groupCache.clear();
}
