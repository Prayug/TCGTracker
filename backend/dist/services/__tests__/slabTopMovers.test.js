"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const slabTopMovers_1 = require("../slabTopMovers");
const topMoversQuality_1 = require("../topMoversQuality");
describe('slab top movers windows', () => {
    it('counts calendar days between ISO dates', () => {
        expect((0, slabTopMovers_1.calendarDaysBetween)('2026-08-10', '2026-08-18')).toBe(8);
        expect((0, slabTopMovers_1.calendarDaysBetween)('2026-08-17', '2026-08-18')).toBe(1);
    });
    it('requires a real lookback so 30d is not an 8-day window', () => {
        expect((0, slabTopMovers_1.minSpanDaysForPeriod)(1)).toBe(1);
        expect((0, slabTopMovers_1.minSpanDaysForPeriod)(7)).toBe(3);
        expect((0, slabTopMovers_1.minSpanDaysForPeriod)(30)).toBe(15);
    });
});
describe('slab mover quality', () => {
    it('does not treat unknown product ids as a mismatch', () => {
        expect((0, slabTopMovers_1.productIdsMatch)(null, '886381')).toBe(true);
        expect((0, slabTopMovers_1.productIdsMatch)('886381', '886381')).toBe(true);
        expect((0, slabTopMovers_1.productIdsMatch)(886381, '886381')).toBe(true);
    });
    it('rejects a remap onto a different PriceCharting product', () => {
        expect((0, slabTopMovers_1.productIdsMatch)('886492', '886381')).toBe(false);
        expect((0, slabTopMovers_1.seriesHasSingleProduct)([
            { productId: '886492' },
            { productId: '886381' },
        ])).toBe(false);
    });
    it('rejects the Wobbuffet reverse-to-unlimited 98% cliff on a 24h two-point series', () => {
        const days = 1;
        const passed = (0, topMoversQuality_1.isGradualMove)([
            { date: '2026-08-23', price: 7320 },
            { date: '2026-08-24', price: 86.88 },
        ], { cliffPct: (0, topMoversQuality_1.cliffPctForPeriod)(days), minPoints: (0, topMoversQuality_1.minPointsForPeriod)(days) });
        expect(passed).toBe(false);
    });
    it('keeps a modest same-product 24h move', () => {
        const days = 1;
        const passed = (0, topMoversQuality_1.isGradualMove)([
            { date: '2026-08-25', price: 80 },
            { date: '2026-08-26', price: 92 },
        ], { cliffPct: (0, topMoversQuality_1.cliffPctForPeriod)(days), minPoints: (0, topMoversQuality_1.minPointsForPeriod)(days) });
        expect(passed).toBe(true);
    });
});
describe('isolated endpoint spikes', () => {
    it('flags the Ralts reverse-holo 24.11 → 38.90 glitch off a flat baseline', () => {
        const points = [];
        for (let d = 1; d <= 7; d++) {
            points.push({ date: `2026-09-0${d}`, price: 24.11 });
        }
        points.push({ date: '2026-09-08', price: 38.9 });
        expect((0, topMoversQuality_1.isIsolatedEndpointSpike)(points)).toBe(true);
    });
    it('does not flag a modest last step on a quiet series', () => {
        const points = [
            { date: '2026-09-01', price: 20 },
            { date: '2026-09-02', price: 22 },
            { date: '2026-09-03', price: 24 },
            { date: '2026-09-04', price: 26 },
            { date: '2026-09-05', price: 29 },
        ];
        expect((0, topMoversQuality_1.isIsolatedEndpointSpike)(points)).toBe(false);
    });
});
