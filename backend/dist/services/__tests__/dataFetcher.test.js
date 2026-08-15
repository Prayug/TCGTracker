"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dataFetcher_1 = require("../dataFetcher");
describe('normalizeVariantKey', () => {
    it('lowercases and strips non-alphanumeric characters', () => {
        expect((0, dataFetcher_1.normalizeVariantKey)('Reverse Holofoil')).toBe('reverseholofoil');
        expect((0, dataFetcher_1.normalizeVariantKey)('Holofoil')).toBe('holofoil');
        expect((0, dataFetcher_1.normalizeVariantKey)('1st Edition Normal')).toBe('1steditionnormal');
    });
    it('returns "normal" for empty input', () => {
        expect((0, dataFetcher_1.normalizeVariantKey)('')).toBe('normal');
        expect((0, dataFetcher_1.normalizeVariantKey)(undefined)).toBe('normal');
        expect((0, dataFetcher_1.normalizeVariantKey)('   ')).toBe('normal');
    });
    it('handles special characters', () => {
        expect((0, dataFetcher_1.normalizeVariantKey)('Holo-Foil ★')).toBe('holofoil');
        expect((0, dataFetcher_1.normalizeVariantKey)('Normal (Holo)')).toBe('normalholo');
    });
    it('returns "normal" when normalization produces empty string', () => {
        expect((0, dataFetcher_1.normalizeVariantKey)('!!!')).toBe('normal');
    });
});
describe('deterministicProductId', () => {
    it('produces consistent IDs for same inputs', () => {
        const a = (0, dataFetcher_1.deterministicProductId)('swsh1-4', 'holofoil');
        const b = (0, dataFetcher_1.deterministicProductId)('swsh1-4', 'holofoil');
        expect(a).toBe(b);
    });
    it('produces different IDs for different card+variant combos', () => {
        const a = (0, dataFetcher_1.deterministicProductId)('base1-4', 'holofoil');
        const b = (0, dataFetcher_1.deterministicProductId)('base1-4', 'reverseholofoil');
        expect(a).not.toBe(b);
    });
    it('produces IDs within a valid range', () => {
        const id = (0, dataFetcher_1.deterministicProductId)('swsh1-1', 'normal');
        expect(id).toBeGreaterThan(0);
        expect(id).toBeLessThan(100000001);
    });
});
describe('listPriceCatchUpDates', () => {
    it('fills every gap in the lookback window, not just yesterday', () => {
        const completed = new Set(['2026-09-04']);
        const dates = (0, dataFetcher_1.listPriceCatchUpDates)('2026-09-07', completed, {
            easternHour: 4,
            lookbackDays: 5,
        });
        expect(dates).toEqual(['2026-09-02', '2026-09-03', '2026-09-05', '2026-09-06', '2026-09-07']);
    });
    it('does not enqueue today before the 2:00 ET snapshot hour', () => {
        const completed = new Set(['2026-09-06']);
        const dates = (0, dataFetcher_1.listPriceCatchUpDates)('2026-09-07', completed, {
            easternHour: 1,
            lookbackDays: 2,
        });
        expect(dates).toEqual(['2026-09-05']);
    });
    it('returns nothing when the window is fully complete', () => {
        const completed = new Set(['2026-09-05', '2026-09-06', '2026-09-07']);
        const dates = (0, dataFetcher_1.listPriceCatchUpDates)('2026-09-07', completed, {
            easternHour: 10,
            lookbackDays: 2,
        });
        expect(dates).toEqual([]);
    });
});
describe('shiftIsoDate', () => {
    it('crosses month boundaries with UTC calendar math', () => {
        expect((0, dataFetcher_1.shiftIsoDate)('2026-09-01', -1)).toBe('2026-08-31');
        expect((0, dataFetcher_1.shiftIsoDate)('2026-08-31', 1)).toBe('2026-09-01');
    });
});
