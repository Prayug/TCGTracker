"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSlabDataQuality = getSlabDataQuality;
const database_1 = require("../db/database");
function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        (0, database_1.getDb)().get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
}
function check(name, metric, threshold, severity, passWhen, details = {}) {
    const ok = passWhen === 'gte' ? metric >= threshold : metric <= threshold;
    const warnBand = passWhen === 'gte' ? metric >= threshold * 0.6 : metric <= threshold * 1.4;
    const status = ok ? 'pass' : warnBand ? 'warn' : 'fail';
    return {
        checkName: name,
        severity,
        status,
        metricValue: metric,
        threshold,
        details,
    };
}
async function getSlabDataQuality() {
    var _a, _b, _c, _d, _e;
    const series = await get(`SELECT
       COUNT(*) AS count,
       (
         SELECT CAST(AVG(span) AS INTEGER) FROM (
           SELECT julianday(MAX(date)) - julianday(MIN(date)) AS span
           FROM graded_price_history
           WHERE LOWER(grader) = 'psa' AND grade = '10' AND price > 0
           GROUP BY cardId
           HAVING COUNT(*) >= 5
         )
       ) AS medianSpan,
       (
         SELECT AVG(CASE WHEN verified = 1 THEN 1.0 ELSE 0.0 END)
         FROM graded_price_history
         WHERE LOWER(grader) = 'psa' AND grade = '10' AND price > 0
       ) AS verifiedShare
     FROM (
       SELECT cardId FROM graded_price_history
       WHERE LOWER(grader) = 'psa' AND grade = '10' AND price > 0
       GROUP BY cardId
       HAVING COUNT(*) >= 5
     )`);
    const stale = await get(`SELECT AVG(CASE WHEN julianday('now') - julianday(fetchedAt) > 14 THEN 1.0 ELSE 0.0 END) AS share
     FROM graded_prices
     WHERE LOWER(grader) = 'psa' AND grade = '10'`);
    const lastRun = await get(`SELECT created_at FROM slab_prediction_runs ORDER BY id DESC LIMIT 1`);
    const checks = [
        check('psa10_series_with_history', (_a = series === null || series === void 0 ? void 0 : series.count) !== null && _a !== void 0 ? _a : 0, 50, 'error', 'gte', {
            note: 'Cards with at least 5 PSA 10 quotes',
        }),
        check('median_psa10_history_days', (_b = series === null || series === void 0 ? void 0 : series.medianSpan) !== null && _b !== void 0 ? _b : 0, 45, 'warn', 'gte', {
            note: 'Typical calendar span of PSA 10 series used for scoring',
        }),
        check('verified_psa10_quote_share', Math.round(((_c = series === null || series === void 0 ? void 0 : series.verifiedShare) !== null && _c !== void 0 ? _c : 0) * 1000) / 10, 40, 'warn', 'gte', { note: 'Percent of PSA 10 history rows marked verified' }),
        check('stale_psa10_quotes_pct', Math.round(((_d = stale === null || stale === void 0 ? void 0 : stale.share) !== null && _d !== void 0 ? _d : 0) * 1000) / 10, 40, 'warn', 'lte', { note: 'Percent of current PSA 10 quotes older than 14 days' }),
    ];
    return {
        runAt: (_e = lastRun === null || lastRun === void 0 ? void 0 : lastRun.created_at) !== null && _e !== void 0 ? _e : new Date().toISOString(),
        checks,
        passed: checks.filter((c) => c.status === 'pass').length,
        warned: checks.filter((c) => c.status === 'warn').length,
        failed: checks.filter((c) => c.status === 'fail').length,
    };
}
