import { getDb } from '../db/database';
import { setCodeService } from './setCodeService';

export const normalizeSetKey = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface SetSearchKeys {
  setIds: string[];
  setNames: string[];
}

const dbAll = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve((rows as T[]) || []);
    });
  });

/**
 * Catalog set IDs (Pokemon API: me4) often differ from TCGCSV mapping IDs (me04chaosrising).
 * Collect every ID/name variant so price_history + card_mappings can be joined.
 */
export const resolveSetSearchKeys = async (
  setId: string,
  setName?: string
): Promise<SetSearchKeys> => {
  await setCodeService.initialize();

  const setIds = new Set<string>([setId]);
  const setNames = new Set<string>();
  if (setName) setNames.add(setName);

  const apiMeta = setCodeService.resolveApiSet(setId, setName);
  if (apiMeta?.id) setIds.add(apiMeta.id);
  if (apiMeta?.name) setNames.add(apiMeta.name);

  const idPlaceholders = [...setIds].map(() => '?').join(',');
  const exactRows = await dbAll<{ setId: string; setName: string }>(
    `
    SELECT DISTINCT setId, setName
    FROM card_mappings
    WHERE setId IN (${idPlaceholders})
    `,
    [...setIds]
  );
  for (const row of exactRows) {
    setIds.add(row.setId);
    if (row.setName) setNames.add(row.setName);
  }

  for (const name of [...setNames]) {
    const likeRows = await dbAll<{ setId: string; setName: string }>(
      `
      SELECT DISTINCT setId, setName
      FROM card_mappings
      WHERE setName = ? OR setName LIKE ?
      `,
      [name, `%${name}%`]
    );
    for (const row of likeRows) {
      setIds.add(row.setId);
      if (row.setName) setNames.add(row.setName);
    }
  }

  const catalogRow = await dbAll<{ setName: string }>(
    `SELECT DISTINCT setName FROM catalog_cards WHERE setId = ? OR setName = ? LIMIT 1`,
    [setId, setName || setId]
  );
  if (catalogRow[0]?.setName) {
    setNames.add(catalogRow[0].setName);
    const catalogLike = await dbAll<{ setId: string; setName: string }>(
      `SELECT DISTINCT setId, setName FROM card_mappings WHERE setName LIKE ?`,
      [`%${catalogRow[0].setName}%`]
    );
    for (const row of catalogLike) {
      setIds.add(row.setId);
      if (row.setName) setNames.add(row.setName);
    }
  }

  return { setIds: [...setIds], setNames: [...setNames] };
};

export const buildSetMappingWhereClause = (keys: SetSearchKeys): { sql: string; params: unknown[] } => {
  const params: unknown[] = [];
  const parts: string[] = [];

  if (keys.setIds.length > 0) {
    parts.push(`cm.setId IN (${keys.setIds.map(() => '?').join(',')})`);
    params.push(...keys.setIds);
  }

  if (keys.setNames.length > 0) {
    parts.push(`cm.setName IN (${keys.setNames.map(() => '?').join(',')})`);
    params.push(...keys.setNames);
    for (const name of keys.setNames) {
      parts.push(`cm.setName LIKE ?`);
      params.push(`%${name}%`);
    }
  }

  if (parts.length === 0) {
    return { sql: '1=0', params: [] };
  }

  return { sql: `(${parts.join(' OR ')})`, params };
};
