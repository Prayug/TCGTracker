"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const onePieceTcgPlayerProvider_1 = require("../providers/onePieceTcgPlayerProvider");
function listing(partial) {
    var _a;
    return {
        cardNumber: (_a = partial.cardNumber) !== null && _a !== void 0 ? _a : 'OP13-120',
        productId: partial.productId,
        name: partial.name,
        marketPrice: partial.marketPrice,
        lowPrice: partial.lowPrice,
    };
}
(0, globals_1.describe)('onePiece TCGPlayer variant matching', () => {
    (0, globals_1.it)('does not match Sabo (SP) to Red Super Alternate Art', () => {
        const best = (0, onePieceTcgPlayerProvider_1.pickBestListing)([
            listing({
                productId: 657411,
                name: 'Sabo (120) (Red Super Alternate Art)',
                marketPrice: 4800,
                lowPrice: 4300,
            }),
        ], 'Sabo (120) (SP)', 'OP13-120');
        (0, globals_1.expect)(best).toBeNull();
    });
    (0, globals_1.it)('matches Red Super Alt Art to the red listing', () => {
        const best = (0, onePieceTcgPlayerProvider_1.pickBestListing)([
            listing({
                productId: 657412,
                name: 'Sabo (120) (Super Alternate Art)',
                marketPrice: 750,
                lowPrice: 700,
            }),
            listing({
                productId: 657411,
                name: 'Sabo (120) (Red Super Alternate Art)',
                marketPrice: 4800,
                lowPrice: 4300,
            }),
        ], 'Sabo (120) (Red Super Alternate Art)', 'OP13-120_p3');
        (0, globals_1.expect)(best === null || best === void 0 ? void 0 : best.productId).toBe(657411);
        (0, globals_1.expect)(best === null || best === void 0 ? void 0 : best.marketPrice).toBe(4800);
    });
    (0, globals_1.it)('does not jackpot on highest price when variants are absent', () => {
        const best = (0, onePieceTcgPlayerProvider_1.pickBestListing)([
            listing({
                productId: 1,
                name: 'Sabo (120) (Red Super Alternate Art)',
                marketPrice: 4800,
                lowPrice: null,
            }),
            listing({
                productId: 2,
                name: 'Sabo (120)',
                marketPrice: 30,
                lowPrice: null,
            }),
        ], 'Sabo (120)', 'OP13-120');
        (0, globals_1.expect)(best === null || best === void 0 ? void 0 : best.productId).toBe(2);
    });
    (0, globals_1.it)('exposes a minimum acceptance score', () => {
        (0, globals_1.expect)(onePieceTcgPlayerProvider_1.MIN_TCG_LISTING_SCORE).toBeGreaterThan(0);
    });
});
