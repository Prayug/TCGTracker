"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const dataFetcher_1 = require("../dataFetcher");
(0, vitest_1.describe)('normalizeVariantKey', () => {
    (0, vitest_1.it)('lowercases and strips non-alphanumeric characters', () => {
        (0, vitest_1.expect)((0, dataFetcher_1.normalizeVariantKey)('Reverse Holofoil')).toBe('reverseholofoil');
        (0, vitest_1.expect)((0, dataFetcher_1.normalizeVariantKey)('Holofoil')).toBe('holofoil');
        (0, vitest_1.expect)((0, dataFetcher_1.normalizeVariantKey)('1st Edition Normal')).toBe('1steditionnormal');
    });
    (0, vitest_1.it)('returns "normal" for empty input', () => {
        (0, vitest_1.expect)((0, dataFetcher_1.normalizeVariantKey)('')).toBe('normal');
        (0, vitest_1.expect)((0, dataFetcher_1.normalizeVariantKey)(undefined)).toBe('normal');
        (0, vitest_1.expect)((0, dataFetcher_1.normalizeVariantKey)('   ')).toBe('normal');
    });
    (0, vitest_1.it)('handles special characters', () => {
        (0, vitest_1.expect)((0, dataFetcher_1.normalizeVariantKey)('Holo-Foil ★')).toBe('holofoil');
        (0, vitest_1.expect)((0, dataFetcher_1.normalizeVariantKey)('Normal (Holo)')).toBe('normalholo');
    });
    (0, vitest_1.it)('returns "normal" when normalization produces empty string', () => {
        (0, vitest_1.expect)((0, dataFetcher_1.normalizeVariantKey)('!!!')).toBe('normal');
    });
});
(0, vitest_1.describe)('deterministicProductId', () => {
    (0, vitest_1.it)('produces consistent IDs for same inputs', () => {
        const a = (0, dataFetcher_1.deterministicProductId)('swsh1-4', 'holofoil');
        const b = (0, dataFetcher_1.deterministicProductId)('swsh1-4', 'holofoil');
        (0, vitest_1.expect)(a).toBe(b);
    });
    (0, vitest_1.it)('produces different IDs for different card+variant combos', () => {
        const a = (0, dataFetcher_1.deterministicProductId)('base1-4', 'holofoil');
        const b = (0, dataFetcher_1.deterministicProductId)('base1-4', 'reverseholofoil');
        (0, vitest_1.expect)(a).not.toBe(b);
    });
    (0, vitest_1.it)('produces IDs within a valid range', () => {
        const id = (0, dataFetcher_1.deterministicProductId)('swsh1-1', 'normal');
        (0, vitest_1.expect)(id).toBeGreaterThan(0);
        (0, vitest_1.expect)(id).toBeLessThan(100000001);
    });
});
