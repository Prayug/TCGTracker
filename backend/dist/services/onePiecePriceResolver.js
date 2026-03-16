"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveOnePiecePrice = resolveOnePiecePrice;
exports.resolveOnePiecePriceFromRaw = resolveOnePiecePriceFromRaw;
exports.enrichOnePieceApiCard = enrichOnePieceApiCard;
exports.enrichOnePieceApiCards = enrichOnePieceApiCards;
const onePieceTcgPlayerProvider_1 = require("./providers/onePieceTcgPlayerProvider");
const STALE_SCRAPE_DAYS = 7;
function isOptcgPriceStale(dateScraped) {
    if (!dateScraped)
        return false;
    const scrapedAt = Date.parse(dateScraped);
    if (Number.isNaN(scrapedAt))
        return false;
    const ageMs = Date.now() - scrapedAt;
    return ageMs > STALE_SCRAPE_DAYS * 24 * 60 * 60 * 1000;
}
function shouldPreferTcgPlayer(tcgMarketPrice, optcgMarketPrice, optcgStale) {
    if (tcgMarketPrice == null || tcgMarketPrice <= 0)
        return false;
    if (optcgMarketPrice == null || optcgMarketPrice <= 0)
        return true;
    if (optcgStale)
        return true;
    const ratio = tcgMarketPrice / optcgMarketPrice;
    return ratio >= 1.5 || ratio <= 0.67;
}
async function resolveOnePiecePrice(input) {
    var _a, _b;
    const listing = await (0, onePieceTcgPlayerProvider_1.findTcgPlayerListing)({
        setId: input.setId,
        cardSetId: input.cardSetId,
        cardName: input.cardName,
        cardImageId: input.cardImageId,
    });
    const optcgStale = isOptcgPriceStale(input.dateScraped);
    const tcgMarketPrice = (_a = listing === null || listing === void 0 ? void 0 : listing.marketPrice) !== null && _a !== void 0 ? _a : null;
    if (shouldPreferTcgPlayer(tcgMarketPrice, input.optcgMarketPrice, optcgStale)) {
        return {
            marketPrice: tcgMarketPrice,
            inventoryPrice: (_b = listing === null || listing === void 0 ? void 0 : listing.lowPrice) !== null && _b !== void 0 ? _b : input.optcgInventoryPrice,
            priceSource: 'tcgplayer',
            tcgplayerProductId: listing === null || listing === void 0 ? void 0 : listing.productId,
        };
    }
    return {
        marketPrice: input.optcgMarketPrice,
        inventoryPrice: input.optcgInventoryPrice,
        priceSource: 'optcg',
        tcgplayerProductId: listing === null || listing === void 0 ? void 0 : listing.productId,
    };
}
async function resolveOnePiecePriceFromRaw(raw) {
    var _a, _b;
    return resolveOnePiecePrice({
        setId: raw.set_id,
        cardSetId: raw.card_set_id,
        cardName: raw.card_name,
        cardImageId: raw.card_image_id,
        optcgMarketPrice: (_a = raw.market_price) !== null && _a !== void 0 ? _a : null,
        optcgInventoryPrice: (_b = raw.inventory_price) !== null && _b !== void 0 ? _b : null,
        dateScraped: raw.date_scraped,
    });
}
async function enrichOnePieceApiCard(card) {
    var _a, _b, _c, _d, _e;
    const resolved = await resolveOnePiecePrice({
        setId: card.set.id,
        cardSetId: card.number,
        cardName: card.name,
        cardImageId: (_a = card.cardImageId) !== null && _a !== void 0 ? _a : card.number,
        optcgMarketPrice: (_b = card.marketPrice) !== null && _b !== void 0 ? _b : null,
        optcgInventoryPrice: (_c = card.inventoryPrice) !== null && _c !== void 0 ? _c : null,
    });
    return {
        ...card,
        marketPrice: (_d = resolved.marketPrice) !== null && _d !== void 0 ? _d : undefined,
        inventoryPrice: (_e = resolved.inventoryPrice) !== null && _e !== void 0 ? _e : undefined,
        priceSource: resolved.priceSource,
        tcgplayerProductId: resolved.tcgplayerProductId,
    };
}
async function enrichOnePieceApiCards(cards) {
    return Promise.all(cards.map((card) => enrichOnePieceApiCard(card)));
}
