"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const validationMetrics_1 = require("../validationMetrics");
describe('validation metrics', () => {
    it('computes a positive Spearman rank IC for monotonically related series', () => {
        const predicted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const actual = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
        const ic = (0, validationMetrics_1.computeRankIC)(predicted, actual);
        expect(ic).not.toBeNull();
        expect(ic).toBeGreaterThan(0.9);
    });
    it('computes a negative rank IC for inversely related series', () => {
        const predicted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const actual = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
        const ic = (0, validationMetrics_1.computeRankIC)(predicted, actual);
        expect(ic).not.toBeNull();
        expect(ic).toBeLessThan(-0.9);
    });
    it('returns null for tiny samples', () => {
        expect((0, validationMetrics_1.computeRankIC)([1, 2], [1, 2])).toBeNull();
    });
    it('handles tied ranks without blowing up', () => {
        const ic = (0, validationMetrics_1.computeRankIC)([1, 1, 1, 2, 2, 3, 3, 3, 4, 4], [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
        expect(ic).not.toBeNull();
    });
    it('hit rate only rewards directionally-correct predictions with small relative error', () => {
        const samples = [
            // direction correct, error small relative to move -> hit
            { predicted: 0.10, actual: 0.08 },
            // direction correct but error large relative to move -> miss
            { predicted: 0.30, actual: 0.05 },
            // wrong direction -> miss
            { predicted: -0.05, actual: 0.20 },
            // tiny actual move with small error: needs |error| < 0.5 * max(|actual|, 3%) -> error 0.01 < 0.015 -> hit
            { predicted: 0.02, actual: 0.01 },
            // near-zero prediction on a big move: error 0.05 vs target 0.025 -> miss
            { predicted: 0.01, actual: -0.05 },
        ];
        const hitRate = (0, validationMetrics_1.computeHitRate)(samples);
        expect(hitRate).not.toBeNull();
        expect(hitRate).toBeCloseTo(2 / 5);
    });
    it('hit rate excludes zero predictions', () => {
        const samples = [
            { predicted: 0, actual: 0.1 },
            { predicted: 0.02, actual: 0.025 },
        ];
        const hitRate = (0, validationMetrics_1.computeHitRate)(samples);
        expect(hitRate).toBeCloseTo(1);
    });
    it('directional accuracy requires nonzero actuals', () => {
        const samples = [
            { predicted: 0.05, actual: 0.03 },
            { predicted: -0.05, actual: -0.03 },
            { predicted: 0.05, actual: -0.03 },
            { predicted: -0.05, actual: 0 },
        ];
        expect((0, validationMetrics_1.computeDirectionalAccuracy)(samples)).toBeCloseTo(2 / 3);
    });
    it('bias is the median signed difference (positive = overprediction)', () => {
        const samples = [
            { predicted: 0.10, actual: 0.02 },
            { predicted: 0.08, actual: 0.05 },
            { predicted: 0.06, actual: 0.04 },
            { predicted: 0.09, actual: 0.01 },
        ];
        // diffs: 0.08, 0.03, 0.02, 0.08 -> median 0.055
        expect((0, validationMetrics_1.computeBias)(samples)).toBeCloseTo(0.055);
    });
    it('computeValidationMetrics returns nulls for empty input', () => {
        const m = (0, validationMetrics_1.computeValidationMetrics)([]);
        expect(m.rankIC).toBeNull();
        expect(m.mae).toBeNull();
        expect(m.meanBias).toBeNull();
        expect(m.directionalAccuracy).toBeNull();
        expect(m.hitRate).toBeNull();
    });
});
