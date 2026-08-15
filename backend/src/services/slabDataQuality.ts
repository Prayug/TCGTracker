import { getDb } from '../db/database';
import { DataQualityCheckResult, DataQualityRunSummary } from './dataQualityService';

function get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => (err ? reject(err) : resolve(row as T | undefined)));
  });
}

function check(
  name: string,
  metric: number,
  threshold: number,
  severity: DataQualityCheckResult['severity'],
  passWhen: 'gte' | 'lte',
  details: Record<string, unknown> = {}
): DataQualityCheckResult {
  const ok = passWhen === 'gte' ? metric >= threshold : metric <= threshold;
  const warnBand = passWhen === 'gte' ? metric >= threshold * 0.6 : metric <= threshold * 1.4;
  const status: DataQualityCheckResult['status'] = ok ? 'pass' : warnBand ? 'warn' : 'fail';
  return {
    checkName: name,
    severity,
    status,
    metricValue: metric,
    threshold,
    details,
  };
}

export async function getSlabDataQuality(): Promise<DataQualityRunSummary> {
  const series = await get<{ count: number; medianSpan: number | null; verifiedShare: number | null }>(
    `SELECT
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
     )`
  );

  const stale = await get<{ share: number | null }>(
    `SELECT AVG(CASE WHEN julianday('now') - julianday(fetchedAt) > 14 THEN 1.0 ELSE 0.0 END) AS share
     FROM graded_prices
     WHERE LOWER(grader) = 'psa' AND grade = '10'`
  );

  const lastRun = await get<{ created_at: string | null }>(
    `SELECT created_at FROM slab_prediction_runs ORDER BY id DESC LIMIT 1`
  );

  const checks: DataQualityCheckResult[] = [
    check('psa10_series_with_history', series?.count ?? 0, 50, 'error', 'gte', {
      note: 'Cards with at least 5 PSA 10 quotes',
    }),
    check('median_psa10_history_days', series?.medianSpan ?? 0, 45, 'warn', 'gte', {
      note: 'Typical calendar span of PSA 10 series used for scoring',
    }),
    check(
      'verified_psa10_quote_share',
      Math.round((series?.verifiedShare ?? 0) * 1000) / 10,
      40,
      'warn',
      'gte',
      { note: 'Percent of PSA 10 history rows marked verified' }
    ),
    check(
      'stale_psa10_quotes_pct',
      Math.round((stale?.share ?? 0) * 1000) / 10,
      40,
      'warn',
      'lte',
      { note: 'Percent of current PSA 10 quotes older than 14 days' }
    ),
  ];

  return {
    runAt: lastRun?.created_at ?? new Date().toISOString(),
    checks,
    passed: checks.filter((c) => c.status === 'pass').length,
    warned: checks.filter((c) => c.status === 'warn').length,
    failed: checks.filter((c) => c.status === 'fail').length,
  };
}
