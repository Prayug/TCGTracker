"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const resolveListingPrice_1 = require("../resolveListingPrice");
describe('resolveListingPrice', () => {
    it('keeps a coherent market quote', () => {
        expect((0, resolveListingPrice_1.resolveListingPrice)({ market: 3998.99, mid: 4999.98, low: 1650, high: 6504.97 })).toBe(3998.99);
    });
    it('rejects junk market far below low and falls back to mid', () => {
        expect((0, resolveListingPrice_1.resolveListingPrice)({ market: 19.99, mid: 7583, low: 6165.99, high: 9000 })).toBe(7583);
    });
    it('uses mid when market is missing', () => {
        expect((0, resolveListingPrice_1.resolveListingPrice)({ market: null, mid: 7583, low: 6165.99, high: 9000 })).toBe(7583);
    });
    it('prefers sane market over ask-wall mid', () => {
        expect((0, resolveListingPrice_1.resolveListingPrice)({ market: 1150, mid: 19999.99, low: 749.99, high: 21999.99 })).toBe(1150);
    });
    it('skips ask-wall mid and falls back to low when market is missing', () => {
        expect((0, resolveListingPrice_1.resolveListingPrice)({ market: null, mid: 19999.99, low: 749.99, high: 21999.99 })).toBe(749.99);
    });
    it('averages low/high only when the band is tight', () => {
        expect((0, resolveListingPrice_1.resolveListingPrice)({ market: 19.99, low: 6165.99, high: 9000 })).toBeCloseTo((6165.99 + 9000) / 2);
    });
});
describe('isAskWallPrice', () => {
    it('flags mids far above the floor', () => {
        expect((0, resolveListingPrice_1.isAskWallPrice)(19999.99, 749.99)).toBe(true);
        expect((0, resolveListingPrice_1.isAskWallPrice)(7583, 6165.99)).toBe(false);
    });
});
describe('resolveHistoryPointPrice', () => {
    it('keeps snapped market when coherent with the band', () => {
        expect((0, resolveListingPrice_1.resolveHistoryPointPrice)({
            marketPrice: 1150,
            lowPrice: 749.99,
            highPrice: 21999.99,
        })).toBe(1150);
    });
    it('repairs incoherent history rows using the low/high band', () => {
        expect((0, resolveListingPrice_1.resolveHistoryPointPrice)({
            marketPrice: 19.99,
            lowPrice: 6165.99,
            highPrice: 9000,
        })).toBeCloseTo((6165.99 + 9000) / 2);
    });
});
describe('extractBestListingPrice', () => {
    it('prefers 1st edition when that listing resolves higher', () => {
        const result = (0, resolveListingPrice_1.extractBestListingPrice)({
            '1stEditionHolofoil': { market: 19.99, mid: 7583, low: 6165.99, high: 9000 },
            unlimitedHolofoil: { market: 3998.99, mid: 4999.98, low: 1650, high: 6504.97 },
        });
        expect(result.variantKey).toBe('1stEditionHolofoil');
        expect(result.price).toBe(7583);
    });
    it('does not promote ask-wall mid over snapped market', () => {
        const result = (0, resolveListingPrice_1.extractBestListingPrice)({
            holofoil: { market: 1150, mid: 19999.99, low: 749.99, high: 21999.99 },
        });
        expect(result.price).toBe(1150);
    });
});
