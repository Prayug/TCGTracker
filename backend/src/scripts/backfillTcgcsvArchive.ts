/**
 * Backfill raw TCGplayer price history from TCGCSV's daily archives so
 * backtests and momentum signals have years of history instead of the few
 * months our own daily sync has collected.
 *
 *   npm run backfill:tcgcsv                       # weekly, 2024-02-08 → yesterday
 *   npm run backfill:tcgcsv -- --every 1          # daily (≈30x more downloads)
 *   npm run backfill:tcgcsv -- --from 2025-01-01 --to 2025-06-30
 *   npm run backfill:tcgcsv -- --dry-run          # download + parse one date, write nothing
 *
 * Needs a 7-Zip binary on PATH (`brew install sevenzip` provides `7zz`), or
 * SEVEN_ZIP_PATH pointing at one. Already-backfilled dates are skipped, so the
 * script can be stopped and re-run.
 *
 * Only products the live sync already maps (productId + finish → card) are
 * written, under source `tcgcsv`, so every existing reader picks them up.
 *
 * First removes TCGCSV rows that carry-forward copied past the last live day
 * (pass --keep-frozen to skip), so those days are refilled with real prices.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initializeDatabase, getDb } from '../db/database';
import { runMigrations } from '../db/migrations';
import { materializeCanonicalPrices } from '../services/canonicalPriceService';
import {
  ArchivePriceRow,
  POKEMON_CATEGORY_ID,
  TCGCSV_ARCHIVE_FIRST_DATE,
  archiveUrl,
  backfillDates,
  parseArchivePricesFile,
} from '../services/tcgcsvArchive';
import {
  TcgcsvMappings,
  findLastLiveTcgcsvDate,
  loadTcgcsvMappings,
  writeTcgcsvRows,
} from '../services/tcgcsvPokemon';
import { logger } from '../utils/logger';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) =>
    getDb().all(sql, params, (err, rows) => (err ? reject(err) : resolve((rows || []) as T[])))
  );

function findSevenZip(): string {
  const candidates = [process.env.SEVEN_ZIP_PATH, '7zz', '7z', '7za'].filter(Boolean) as string[];
  for (const bin of candidates) {
    try {
      execFileSync(bin, ['i'], { stdio: 'ignore' });
      return bin;
    } catch {
      // try next
    }
  }
  throw new Error(
    'No 7-Zip binary found. Install one (`brew install sevenzip`) or set SEVEN_ZIP_PATH.'
  );
}

function listPriceFiles(root: string, date: string): string[] {
  const categoryDirs = [
    path.join(root, date, String(POKEMON_CATEGORY_ID)),
    path.join(root, String(POKEMON_CATEGORY_ID)),
  ].filter((d) => fs.existsSync(d));
  const files: string[] = [];
  for (const dir of categoryDirs) {
    for (const group of fs.readdirSync(dir)) {
      const f = path.join(dir, group, 'prices');
      if (fs.existsSync(f)) files.push(f);
    }
  }
  return files;
}

async function download(url: string, dest: string): Promise<boolean> {
  const res = await fetch(url);
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return true;
}

async function backfillDate(
  date: string,
  sevenZip: string,
  maps: TcgcsvMappings,
  dryRun: boolean
): Promise<{ written: number; unmapped: number; files: number } | null> {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `tcgcsv-${date}-`));
  try {
    const archive = path.join(work, 'prices.7z');
    if (!(await download(archiveUrl(date), archive))) return null;
    execFileSync(sevenZip, ['x', archive, `-o${work}`, '-y'], { stdio: 'ignore' });
    const files = listPriceFiles(work, date);
    const rows: ArchivePriceRow[] = [];
    for (const file of files) rows.push(...parseArchivePricesFile(fs.readFileSync(file, 'utf8')));
    const res = await writeTcgcsvRows(date, rows, maps, { overwrite: false, dryRun });
    return { ...res, files: files.length };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Carry-forward copied the last live TCGCSV day onto every later day. Remove
 * those copies so the archive can fill the days with real prices.
 */
async function removeFrozenTcgcsvDays(dryRun: boolean): Promise<string | null> {
  const { lastLive, frozenDays } = await findLastLiveTcgcsvDate();
  if (!lastLive || frozenDays === 0) return null;
  logger.warn('TCGCSV rows after the last live day are carry-forward copies', {
    lastLive,
    frozenDays,
  });
  if (!dryRun) {
    await all(`DELETE FROM price_history WHERE source = 'tcgcsv' AND date > ?`, [lastLive]);
  }
  return lastLive;
}

const main = async () => {
  await initializeDatabase();
  await runMigrations(getDb());

  const dryRun = flag('dry-run');
  const every = Number(arg('every') ?? 7);
  // Dates the daily sync already covered are skipped below, so defaulting to
  // yesterday also fills gaps in the live sync.
  const defaultTo = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const from = arg('from') ?? TCGCSV_ARCHIVE_FIRST_DATE;
  const to = arg('to') ?? defaultTo;

  const sevenZip = findSevenZip();
  // Mappings must be read before frozen rows (which carry them) are removed.
  const maps = await loadTcgcsvMappings();
  const lastLive = flag('keep-frozen') ? null : await removeFrozenTcgcsvDays(dryRun);
  logger.info('TCGCSV archive backfill', {
    from,
    to,
    every,
    dryRun,
    mappedProducts: maps.byKey.size,
  });
  if (maps.byKey.size === 0) throw new Error('No tcgcsv mappings yet; run the daily sync first.');

  const done = new Set(
    (
      await all<{ date: string }>(
        `SELECT date FROM price_history
         WHERE source = 'tcgcsv' AND date BETWEEN ? AND ?
         GROUP BY date HAVING COUNT(*) > 1000`,
        [from, to]
      )
    ).map((r) => r.date)
  );

  const dates = backfillDates(from, to, every).filter((d) => !done.has(d));
  let total = 0;
  for (const [i, date] of (dryRun ? dates.slice(0, 1) : dates).entries()) {
    try {
      const res = await backfillDate(date, sevenZip, maps, dryRun);
      if (!res) {
        logger.warn('No archive for date', { date });
        continue;
      }
      total += res.written;
      logger.info(`TCGCSV archive ${date} (${i + 1}/${dates.length})`, res);
    } catch (err) {
      logger.error('Archive date failed; continuing', { date, error: (err as Error).message });
    }
  }

  if (!dryRun && (total > 0 || lastLive)) {
    await materializeCanonicalPrices({ sinceDate: from, untilDate: to });
  }
  logger.info('TCGCSV archive backfill finished', { rowsWritten: total, dryRun });
  process.exit(0);
};

main().catch((error) => {
  logger.error('TCGCSV archive backfill failed', { error: (error as Error).message });
  process.exit(1);
});
