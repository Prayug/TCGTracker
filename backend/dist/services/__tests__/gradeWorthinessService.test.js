"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const gradeWorthinessService_1 = require("../gradeWorthinessService");
(0, vitest_1.describe)('PSA grading fee estimate', () => {
    (0, vitest_1.it)('uses Regular (~$80) as the floor while Value tiers are paused', () => {
        const low = (0, gradeWorthinessService_1.estimatePsaGradingFee)(80);
        (0, vitest_1.expect)(low.tier).toBe('Regular');
        (0, vitest_1.expect)(low.baseFee).toBe(79.99);
        (0, vitest_1.expect)(low.fee).toBe(79.99);
    });
    (0, vitest_1.it)('adds insurance above $499 declared', () => {
        const mid = (0, gradeWorthinessService_1.estimatePsaGradingFee)(1000);
        (0, vitest_1.expect)(mid.tier).toBe('Regular');
        (0, vitest_1.expect)(mid.insurance).toBeCloseTo((1000 - 499) * 0.02, 2);
        (0, vitest_1.expect)(mid.fee).toBeCloseTo(79.99 + mid.insurance, 2);
    });
    (0, vitest_1.it)('steps up tiers for higher declared values', () => {
        (0, vitest_1.expect)((0, gradeWorthinessService_1.estimatePsaGradingFee)(2000).tier).toBe('Express');
        (0, vitest_1.expect)((0, gradeWorthinessService_1.estimatePsaGradingFee)(4000).tier).toBe('Super Express');
        (0, vitest_1.expect)((0, gradeWorthinessService_1.estimatePsaGradingFee)(8000).tier).toBe('Walk-Through');
    });
    (0, vitest_1.it)('makes a $5 raw / $80 PSA 10 submission unprofitable after fees', () => {
        const fee = (0, gradeWorthinessService_1.estimatePsaGradingFee)(80).fee;
        const net = 80 - 5 - fee;
        (0, vitest_1.expect)(net).toBeLessThan(0);
    });
});
(0, vitest_1.describe)('grade worthiness scoring', () => {
    (0, vitest_1.it)('ranks high-net-ROI easy-gem above high-net-ROI hard-gem', () => {
        const easy = (0, gradeWorthinessService_1.scoreCard)({ netRoiPct: 200, gemRatePct: 40, psa10Pop: 2000 });
        const hard = (0, gradeWorthinessService_1.scoreCard)({ netRoiPct: 200, gemRatePct: 3, psa10Pop: 40 });
        (0, vitest_1.expect)(easy.score).toBeGreaterThan(hard.score);
        (0, vitest_1.expect)(easy.gemEaseScore).toBeGreaterThan(hard.gemEaseScore);
    });
    (0, vitest_1.it)('ranks fat after-fee ROI above thin ROI at same gem rate', () => {
        const fat = (0, gradeWorthinessService_1.scoreCard)({ netRoiPct: 300, gemRatePct: 20, psa10Pop: 500 });
        const thin = (0, gradeWorthinessService_1.scoreCard)({ netRoiPct: 40, gemRatePct: 20, psa10Pop: 500 });
        (0, vitest_1.expect)(fat.score).toBeGreaterThan(thin.score);
        (0, vitest_1.expect)(fat.upliftScore).toBeGreaterThan(thin.upliftScore);
    });
    (0, vitest_1.it)('does not pin every high-ROI card at 100', () => {
        const a = (0, gradeWorthinessService_1.scoreCard)({ netRoiPct: 400, gemRatePct: 30, psa10Pop: 1000 });
        const b = (0, gradeWorthinessService_1.scoreCard)({ netRoiPct: 800, gemRatePct: 30, psa10Pop: 1000 });
        (0, vitest_1.expect)(b.score).toBeGreaterThan(a.score);
        (0, vitest_1.expect)(a.score).toBeLessThan(100);
    });
});
