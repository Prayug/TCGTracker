import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import { setCodeService } from './setCodeService';

const dbAll = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve((rows as T[]) || []);
    });
  });

const dbRun = (sql: string, params: unknown[] = []): Promise<number> =>
  new Promise((resolve, reject) => {
    getDb().run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });

/** Persist TCGPlayer/TCGCSV set IDs → Pokemon catalog set IDs for SQL joins. */
export async function syncSetIdAliases(): Promise<number> {
  await setCodeService.initialize();

  const distinctSets = await dbAll<{ setId: string; setName: string }>(
    `SELECT DISTINCT setId, setName
     FROM card_mappings
     WHERE setId IS NOT NULL AND TRIM(setId) <> ''`
  );

  let upserted = 0;
  for (const { setId, setName } of distinctSets) {
    const catalogSetId = await setCodeService.normalizeSetIdForImageUrl(setId, setName);
    if (!catalogSetId) continue;

    await dbRun(
      `INSERT INTO set_id_aliases (sourceSetId, sourceSetName, catalogSetId, updatedAt)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(sourceSetId) DO UPDATE SET
         sourceSetName = excluded.sourceSetName,
         catalogSetId = excluded.catalogSetId,
         updatedAt = datetime('now')`,
      [setId, setName || null, catalogSetId]
    );
    upserted += 1;
  }

  logger.info(`Synced ${upserted} set ID aliases`);
  return upserted;
}

export async function getCatalogSetIdsForSource(sourceSetId: string, setName?: string): Promise<string[]> {
  const rows = await dbAll<{ catalogSetId: string }>(
    `SELECT catalogSetId FROM set_id_aliases WHERE sourceSetId = ?`,
    [sourceSetId]
  );

  const ids = new Set(rows.map((row) => row.catalogSetId));
  if (ids.size === 0) {
    await setCodeService.initialize();
    const normalized = await setCodeService.normalizeSetIdForImageUrl(sourceSetId, setName);
    if (normalized) ids.add(normalized);
  }

  return [...ids];
}
