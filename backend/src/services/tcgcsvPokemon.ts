/**
 * Direct TCGplayer prices for Pokémon via TCGCSV (category 3).
 *
 * The daily job stopped fetching TCGCSV in April 2026, but carry-forward kept
 * copying the 2026-04-20 quotes onto every new day under source `tcgcsv`, so
 * those rows looked live while never changing. This module restores the live
 * daily fetch and is shared with the archive backfill.
 *
 * Only products the catalog already maps (productId + finish → card UID) are
 * written; mapping new products stays the catalog sync's job.
 */
import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import {
  ArchivePriceRow,
  POKEMON_CATEGORY_ID,
  archiveRowPrice,
  mappingKey,
  parseArchivePricesFile,
} from './tcgcsvArchive';

const TCGCSV_BASE = 'https://tcgcsv.com/tcgplayer';
/** Share of a day's rows that must differ from the day before for it to count as live. */
const LIVE_DAY_MIN_CHANGED_SHARE = 0.01;

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) =>
    getDb().all(sql, params, (err, rows) => (err ? reject(err) : resolve((rows || []) as T[])))
  );
const exec = (sql: string): Promise<void> =>
  new Promise((resolve, reject) => getDb().exec(sql, (err) => (err ? reject(err) : resolve())));

export interface TcgcsvMapping {
  uniqueIdentifier: string;
  productName: string | null;
  groupName: string | null;
}

export interface TcgcsvMappings {
  byKey: Map<string, TcgcsvMapping>;
  /** productId-only fallback; null when one product maps to several cards. */
  byProduct: Map<number, TcgcsvMapping | null>;
}

export async function loadTcgcsvMappings(): Promise<TcgcsvMappings> {
  const rows = await all<{
    uniqueIdentifier: string;
    productId: number;
    subTypeName: string | null;
    productName: string | null;
    groupName: string | null;
  }>(
    `SELECT uniqueIdentifier, productId, subTypeName, productName, groupName
     FROM price_history
     WHERE source = 'tcgcsv' AND productId IS NOT NULL
       AND date >= date((SELECT MAX(date) FROM price_history WHERE source = 'tcgcsv'), '-30 days')
     GROUP BY uniqueIdentifier`
  );
  const byKey = new Map<string, TcgcsvMapping>();
  const byProduct = new Map<number, TcgcsvMapping | null>();
  for (const r of rows) {
    const m = {
      uniqueIdentifier: r.uniqueIdentifier,
      productName: r.productName,
      groupName: r.groupName,
    };
    byKey.set(mappingKey(r.productId, r.subTypeName), m);
    const prev = byProduct.get(r.productId);
    byProduct.set(
      r.productId,
      prev === undefined || prev?.uniqueIdentifier === m.uniqueIdentifier ? m : null
    );
  }
  return { byKey, byProduct };
}

export function resolveMapping(maps: TcgcsvMappings, row: ArchivePriceRow): TcgcsvMapping | null {
  return (
    maps.byKey.get(mappingKey(row.productId, row.subTypeName)) ??
    maps.byProduct.get(row.productId) ??
    null
  );
}

/**
 * Write one day of TCGCSV rows. `overwrite` replaces carried-forward copies
 * (live sync); the archive backfill never touches existing rows.
 */
export async function writeTcgcsvRows(
  date: string,
  rows: ArchivePriceRow[],
  maps: TcgcsvMappings,
  options: { overwrite: boolean; dryRun?: boolean }
): Promise<{ written: number; unmapped: number }> {
  const values: unknown[][] = [];
  let unmapped = 0;
  for (const row of rows) {
    const price = archiveRowPrice(row);
    if (price == null) continue;
    const m = resolveMapping(maps, row);
    if (!m) {
      unmapped++;
      continue;
    }
    values.push([
      m.uniqueIdentifier,
      date,
      row.productId,
      price,
      row.subTypeName,
      m.productName,
      m.groupName,
      row.lowPrice,
      row.highPrice,
      row.marketPrice,
    ]);
  }
  if (options.dryRun || values.length === 0) return { written: values.length, unmapped };

  const conflict = options.overwrite
    ? `DO UPDATE SET price = excluded.price, lowPrice = excluded.lowPrice,
         highPrice = excluded.highPrice, marketPrice = excluded.marketPrice,
         productId = excluded.productId, subTypeName = excluded.subTypeName`
    : 'DO NOTHING';
  const db = getDb();
  await exec('BEGIN');
  try {
    const stmt = db.prepare(
      `INSERT INTO price_history (
         uniqueIdentifier, date, productId, price, subTypeName, productName, groupName,
         lowPrice, highPrice, marketPrice, volume, source
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'tcgcsv')
       ON CONFLICT(uniqueIdentifier, date, source) ${conflict}`
    );
    for (const v of values) {
      await new Promise<void>((resolve, reject) =>
        stmt.run(v, (err: Error | null) => (err ? reject(err) : resolve()))
      );
    }
    await new Promise<void>((resolve) => stmt.finalize(() => resolve()));
    await exec('COMMIT');
  } catch (err) {
    await exec('ROLLBACK');
    throw err;
  }
  return { written: values.length, unmapped };
}

/**
 * Last day whose TCGCSV prices differ from the day before. Days after it are
 * carry-forward copies; `frozenDays` is the calendar days from it to the
 * newest copy (0 when the feed is current). A live day reprices thousands of
 * cards, so a handful of changed rows (remaps, one-off writes) on a copied
 * day doesn't count as live.
 */
export async function findLastLiveTcgcsvDate(): Promise<{
  lastLive: string | null;
  frozenDays: number;
}> {
  const days = await all<{ date: string; n: number }>(
    `SELECT date, COUNT(*) AS n FROM price_history WHERE source = 'tcgcsv'
       GROUP BY date HAVING COUNT(*) > 1000 ORDER BY date DESC LIMIT 400`
  );
  const dates = days.map((r) => r.date);
  for (let i = 0; i + 1 < dates.length; i++) {
    const [{ changed }] = await all<{ changed: number }>(
      `SELECT COUNT(*) AS changed
       FROM price_history a
       JOIN price_history b
         ON b.uniqueIdentifier = a.uniqueIdentifier AND b.source = 'tcgcsv' AND b.date = ?
       WHERE a.source = 'tcgcsv' AND a.date = ? AND a.price != b.price`,
      [dates[i + 1], dates[i]]
    );
    if (changed >= Math.max(50, days[i].n * LIVE_DAY_MIN_CHANGED_SHARE)) {
      const span = (Date.parse(dates[0]) - Date.parse(dates[i])) / 86_400_000;
      return { lastLive: dates[i], frozenDays: Math.round(span) };
    }
  }
  return { lastLive: dates[0] ?? null, frozenDays: 0 };
}

async function fetchText(path: string): Promise<string> {
  const response = await fetch(`${TCGCSV_BASE}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'TCGTracker/1.0' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`TCGCSV ${path} → ${response.status}`);
  return response.text();
}

/** Today's live TCGplayer prices for every Pokémon group. */
export async function snapshotTcgcsvPokemon(
  runDate: string
): Promise<{ groups: number; groupsFailed: number; written: number; unmapped: number }> {
  const maps = await loadTcgcsvMappings();
  if (maps.byKey.size === 0) return { groups: 0, groupsFailed: 0, written: 0, unmapped: 0 };

  const groupsPayload = JSON.parse(await fetchText(`/${POKEMON_CATEGORY_ID}/groups`)) as {
    results?: { groupId: number }[];
  };
  const groupIds = (groupsPayload.results ?? []).map((g) => g.groupId).filter(Boolean);

  const rows: ArchivePriceRow[] = [];
  let groupsFailed = 0;
  const concurrency = 4;
  for (let i = 0; i < groupIds.length; i += concurrency) {
    const batch = groupIds.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((id) => fetchText(`/${POKEMON_CATEGORY_ID}/${id}/prices`))
    );
    for (const r of results) {
      if (r.status === 'fulfilled') rows.push(...parseArchivePricesFile(r.value));
      else groupsFailed++;
    }
  }

  const res = await writeTcgcsvRows(runDate, rows, maps, { overwrite: true });
  logger.info('TCGCSV Pokémon snapshot', {
    runDate,
    groups: groupIds.length,
    groupsFailed,
    ...res,
  });
  return { groups: groupIds.length, groupsFailed, ...res };
}
