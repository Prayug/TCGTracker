"use strict";
/**
 * Shared validation metrics for backtests and forward-test tracking.
 * These give an honest read on predictive skill rather than raw hit rates.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeRankIC = computeRankIC;
exports.computeHitRate = computeHitRate;
exports.computeDirectionalAccuracy = computeDirectionalAccuracy;
exports.computeMae = computeMae;
exports.computeBias = computeBias;
exports.computeValidationMetrics = computeValidationMetrics;
function median(values) {
    if (values.length === 0)
        return NaN;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
/**
 * Spearman rank correlation between two series.
 * Falls back to Pearson correlation when ties make ranking degenerate.
 */
function computeRankIC(predicted, actual) {
    if (predicted.length !== actual.length || predicted.length < 8)
        return null;
    const rank = (values) => {
        const indexed = values.map((v, i) => ({ v, i }));
        indexed.sort((a, b) => a.v - b.v);
        const ranks = new Array(values.length);
        let i = 0;
        while (i < indexed.length) {
            let j = i;
            while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v)
                j++;
            const avgRank = (i + j) / 2 + 1;
            for (let k = i; k <= j; k++)
                ranks[indexed[k].i] = avgRank;
            i = j + 1;
        }
        return ranks;
    };
    const predRanks = rank(predicted);
    const actualRanks = rank(actual);
    const n = predicted.length;
    const corr = (a, b) => {
        const meanA = a.reduce((s, v) => s + v, 0) / n;
        const meanB = b.reduce((s, v) => s + v, 0) / n;
        let num = 0;
        let denA = 0;
        let denB = 0;
        for (let i = 0; i < n; i++) {
            num += (a[i] - meanA) * (b[i] - meanB);
            denA += (a[i] - meanA) ** 2;
            denB += (b[i] - meanB) ** 2;
        }
        if (denA === 0 || denB === 0)
            return NaN;
        return num / Math.sqrt(denA * denB);
    };
    const spearman = corr(predRanks, actualRanks);
    if (!Number.isNaN(spearman))
        return spearman;
    // Degenerate ranks (heavy ties): fall back to Pearson on raw values.
    const pearson = corr(predicted, actual);
    return Number.isNaN(pearson) ? null : pearson;
}
/** The model adds value when error beats the naive "predict the market median" baseline. */
function computeHitRate(samples, thresholdFactor = 0.5, minMove = 0.03) {
    const valid = samples.filter((s) => s.actual !== null && s.predicted !== 0);
    if (valid.length === 0)
        return null;
    let hits = 0;
    for (const s of valid) {
        const actual = s.actual;
        const error = Math.abs(s.predicted - actual);
        // Reward only predictions that were directionally right AND close enough
        // relative to the actual move. Near-zero predictions on flat cards don't count.
        const sameDirection = (s.predicted > 0) === (actual > 0);
        const target = Math.max(Math.abs(actual), minMove);
        if (sameDirection && error < thresholdFactor * target)
            hits++;
    }
    return hits / valid.length;
}
function computeDirectionalAccuracy(samples) {
    const valid = samples.filter((s) => s.actual !== null && s.actual !== 0 && s.predicted !== 0);
    if (valid.length === 0)
        return null;
    const correct = valid.filter((s) => (s.predicted > 0) === (s.actual > 0)).length;
    return correct / valid.length;
}
function computeMae(samples) {
    const valid = samples.filter((s) => s.actual !== null);
    if (valid.length === 0)
        return null;
    return valid.reduce((sum, s) => sum + Math.abs(s.predicted - s.actual), 0) / valid.length;
}
function computeBias(samples) {
    const valid = samples.filter((s) => s.actual !== null);
    if (valid.length === 0)
        return null;
    const diffs = valid.map((s) => s.predicted - s.actual);
    return median(diffs);
}
function computeValidationMetrics(samples) {
    const valid = samples.filter((s) => s.actual !== null);
    if (valid.length === 0) {
        return { rankIC: null, mae: null, meanBias: null, directionalAccuracy: null, hitRate: null };
    }
    return {
        rankIC: computeRankIC(valid.map((s) => s.predicted), valid.map((s) => s.actual)),
        mae: computeMae(valid),
        meanBias: computeBias(valid),
        directionalAccuracy: computeDirectionalAccuracy(valid),
        hitRate: computeHitRate(valid),
    };
}
