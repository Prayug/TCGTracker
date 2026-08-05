import { getDb } from '../db/database';
import { logger } from '../utils/logger';

export type DataQualitySeverity = 'info' | 'warn' | 'error';

export interface DataQualityCheckResult {
  checkName: string;
  severity: DataQualitySeverity;
  status: 'pass' | 'fail' | 'warn';
  metricValue: number;
  threshold: number | null;
  details: Record<string, unknown>;
}

export interface DataQualityRunSummary {
  runAt: string;
  checks: DataQualityCheckResult[];
  passed: number;
  warned: number;
  failed: number;
}

const run = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => {
    getDb().run(sql, params, (err) => (err ? reject(err) : resolve()));
  });

const get = <T>(sql: string, params: unknown[] = []): Promise<T | undefined> =>
  new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => (err ? reject(err) : resolve(row as T | undefined)));
  });

export async function ensureDataQualityTable(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS data_quality_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      check_name TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      metric_value REAL,
      threshold REAL,
      details_json TEXT,
      checked_at TEXT DEFAULT (datetime('now'))
    )
  `);
  await run(
    'CREATE INDEX IF NOT EXISTS idx_data_quality_checked ON data_quality_checks(checked_at)'
  );
  await run(
    'CREATE INDEX IF NOT EXISTS idx_data_quality_name ON data_quality_checks(check_name)'
  );
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const row = await get<{ n: number }>(sql, params);
  return row?.n ?? 0;
}

export async function runDataQualityChecks(): Promise<DataQualityRunSummary> {
  await ensureDataQualityTable();
  const checks: DataQualityCheckResult[] = [];

  // 1. Null unique_identifier rate on latest prediction run
  const latestRun = await get<{ id: number }>('SELECT MAX(id) AS id FROM prediction_runs');
  if (latestRun?.id) {
    const total = await count(
      'SELECT COUNT(*) AS n FROM card_predictions WHERE run_id = ?',
      [latestRun.id]
    );
    const nullUid = await count(
      `SELECT COUNT(*) AS n FROM card_predictions
       WHERE run_id = ? AND (unique_identifier IS NULL OR unique_identifier = '')`,
      [latestRun.id]
    );
    const rate = total > 0 ? nullUid / total : 0;
    checks.push({
      checkName: 'prediction_null_uid_rate',
      severity: rate > 0.1 ? 'error' : rate > 0.01 ? 'warn' : 'info',
      status: rate > 0.1 ? 'fail' : rate > 0.01 ? 'warn' : 'pass',
      metricValue: rate,
      threshold: 0.01,
      details: { runId: latestRun.id, nullUid, total },
    });
  }

  // 2. Orphan mappings (no catalog_cards row)
  const mappingTotal = await count('SELECT COUNT(*) AS n FROM card_mappings');
  const orphanMappings = await count(
    `SELECT COUNT(*) AS n FROM card_mappings cm
     WHERE NOT EXISTS (SELECT 1 FROM catalog_cards cc WHERE cc.cardId = cm.cardId)`
  );
  const orphanRate = mappingTotal > 0 ? orphanMappings / mappingTotal : 0;
  checks.push({
    checkName: 'mapping_catalog_orphan_rate',
    severity: orphanRate > 0.6 ? 'error' : orphanRate > 0.4 ? 'warn' : 'info',
    status: orphanRate > 0.6 ? 'fail' : orphanRate > 0.4 ? 'warn' : 'pass',
    metricValue: orphanRate,
    threshold: 0.4,
    details: { orphanMappings, mappingTotal },
  });

  // 3. Calibration sample duplicates (should be ~0 after migration 24)
  const calTotal = await count('SELECT COUNT(*) AS n FROM calibration_samples');
  const calDistinct = await count(
    `SELECT COUNT(*) AS n FROM (
       SELECT 1 FROM calibration_samples
       GROUP BY horizon, card_id, source, COALESCE(prediction_date, '')
     )`
  );
  const dupRatio = calDistinct > 0 ? calTotal / calDistinct : 1;
  checks.push({
    checkName: 'calibration_sample_duplicate_ratio',
    severity: dupRatio > 1.05 ? 'error' : 'info',
    status: dupRatio > 1.05 ? 'fail' : 'pass',
    metricValue: dupRatio,
    threshold: 1.05,
    details: { calTotal, calDistinct },
  });

  // 4. Unique index present on calibration_samples
  const uqCal = await get<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE type='index' AND name='uq_calibration_samples'`
  );
  checks.push({
    checkName: 'calibration_unique_index_present',
    severity: 'error',
    status: uqCal ? 'pass' : 'fail',
    metricValue: uqCal ? 1 : 0,
    threshold: 1,
    details: { indexName: 'uq_calibration_samples' },
  });

  // 5. signal_score column present
  const signalCol = await get<{ name: string }>(
    `SELECT name FROM pragma_table_info('card_predictions') WHERE name = 'signal_score'`
  );
  checks.push({
    checkName: 'prediction_signal_score_column',
    severity: 'error',
    status: signalCol ? 'pass' : 'fail',
    metricValue: signalCol ? 1 : 0,
    threshold: 1,
    details: {},
  });

  // 6. Price history span (warn if < 120 days — weak for 90d+)
  const span = await get<{ days: number }>(
    `SELECT CAST(julianday(MAX(date)) - julianday(MIN(date)) AS INTEGER) AS days
     FROM price_history WHERE source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')`
  );
  const days = span?.days ?? 0;
  checks.push({
    checkName: 'price_history_span_days',
    severity: days < 45 ? 'error' : days < 120 ? 'warn' : 'info',
    status: days < 45 ? 'fail' : days < 120 ? 'warn' : 'pass',
    metricValue: days,
    threshold: 120,
    details: { days },
  });

  // 7. Forward-test maturity / premature actuals (pending should exist for recent runs)
  const premature = await count(
    `SELECT COUNT(*) AS n
     FROM prediction_results pr
     JOIN card_predictions cp ON cp.id = pr.prediction_id
     WHERE pr.actual_7d_price IS NOT NULL
       AND julianday('now') - julianday(cp.prediction_date) < 7`
  );
  checks.push({
    checkName: 'forward_test_premature_7d_actuals',
    severity: premature > 0 ? 'error' : 'info',
    status: premature > 0 ? 'fail' : 'pass',
    metricValue: premature,
    threshold: 0,
    details: { premature },
  });

  // Persist
  const runAt = new Date().toISOString();
  for (const check of checks) {
    await run(
      `INSERT INTO data_quality_checks
         (check_name, severity, status, metric_value, threshold, details_json, checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        check.checkName,
        check.severity,
        check.status,
        check.metricValue,
        check.threshold,
        JSON.stringify(check.details),
        runAt,
      ]
    );
  }

  const summary: DataQualityRunSummary = {
    runAt,
    checks,
    passed: checks.filter((c) => c.status === 'pass').length,
    warned: checks.filter((c) => c.status === 'warn').length,
    failed: checks.filter((c) => c.status === 'fail').length,
  };

  logger.info('Data quality checks completed', {
    passed: summary.passed,
    warned: summary.warned,
    failed: summary.failed,
  });
  return summary;
}

export async function getLatestDataQualityChecks(limit = 50): Promise<{
  checks: DataQualityCheckResult[];
  runAt: string | null;
  passed: number;
  warned: number;
  failed: number;
}> {
  await ensureDataQualityTable();
  const latest = await get<{ checked_at: string }>(
    `SELECT checked_at FROM data_quality_checks ORDER BY checked_at DESC LIMIT 1`
  );
  if (!latest?.checked_at) {
    return { checks: [], runAt: null, passed: 0, warned: 0, failed: 0 };
  }

  const checks: DataQualityCheckResult[] = await new Promise((resolve, reject) => {
    getDb().all(
      `SELECT check_name AS checkName, severity, status, metric_value AS metricValue,
              threshold, details_json AS detailsJson
       FROM data_quality_checks
       WHERE checked_at = ?
       ORDER BY CASE status WHEN 'fail' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END
       LIMIT ?`,
      [latest.checked_at, limit],
      (err, rows: any[]) => {
        if (err) return reject(err);
        resolve(
          (rows || []).map((r) => ({
            checkName: r.checkName,
            severity: r.severity,
            status: r.status,
            metricValue: r.metricValue,
            threshold: r.threshold,
            details: r.detailsJson ? JSON.parse(r.detailsJson) : {},
          }))
        );
      }
    );
  });

  return {
    checks,
    runAt: latest.checked_at,
    passed: checks.filter((c) => c.status === 'pass').length,
    warned: checks.filter((c) => c.status === 'warn').length,
    failed: checks.filter((c) => c.status === 'fail').length,
  };
}
