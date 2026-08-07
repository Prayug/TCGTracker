"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const liquidityScore_1 = require("../liquidityScore");
(0, vitest_1.describe)('scoreLiquidity', () => {
    (0, vitest_1.it)('scores verified liquid comps as strong', () => {
        const r = (0, liquidityScore_1.scoreLiquidity)({
            soldListings: 60,
            verified: true,
            stale: false,
            ageHours: 1,
            matchScore: 0.95,
            historyPoints: 90,
        });
        (0, vitest_1.expect)(r.score).toBeGreaterThanOrEqual(70);
        (0, vitest_1.expect)(r.tier).toBe('strong');
    });
    (0, vitest_1.it)('flags thin / illiquid quotes', () => {
        const r = (0, liquidityScore_1.scoreLiquidity)({
            soldListings: 0,
            verified: false,
            stale: true,
            ageHours: 48,
            historyPoints: 0,
        });
        (0, vitest_1.expect)(r.score).toBeLessThan(25);
        (0, vitest_1.expect)(r.tier).toBe('illiquid');
    });
    (0, vitest_1.it)('filterByMinLiquidity falls back when none qualify', () => {
        const rows = [
            { id: 'a', liquidityScore: 10 },
            { id: 'b', liquidityScore: 20 },
        ];
        (0, vitest_1.expect)((0, liquidityScore_1.filterByMinLiquidity)(rows, 45)).toEqual(rows);
        (0, vitest_1.expect)((0, liquidityScore_1.filterByMinLiquidity)([{ id: 'c', liquidityScore: 80 }, ...rows], 45)).toEqual([
            { id: 'c', liquidityScore: 80 },
        ]);
    });
});
