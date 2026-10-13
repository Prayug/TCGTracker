/**
 * Money Flow: non-bulk universe, path-check loud movers only, cache by as-of date.
 */

import fs from 'fs';
import path from 'path';
import {
  MONEY_FLOW_PSA10_MIN_PRICE,
  MONEY_FLOW_RAW_MIN_PRICE,
  classifyMoneyFlowEra,
  detectSpecialCohorts,
  isMoneyFlowRelevantPrint,
  normalizeMoneyFlowDays,
  type MoneyFlowFinish,
  type MoneyFlowResponse,
} from '@tcgtracker/shared';
import { getDatabasePath, getDb } from '../db/database';
import { logger } from '../utils/logger';
import { buildMoneyFlowFromTagged, type TaggedMover } from './moneyFlowAggregate';
import { fillMoneyFlowPayloadImages } from './moneyFlowImages';
import { listQualifiedRawMovers, type RawMoverEntry } from './rawTopMovers';
import { listQualifiedSlabMovers, type SlabMoverEntry } from './slabTopMovers';

export type { TaggedMover } from './moneyFlowAggregate';
export { buildMoneyFlowFromTagged } from './moneyFlowAggregate';

const CACHE_VERSION = 'v10-board';
/** Bounds the in-memory cache to a few days of history across the 3 window sizes. */
const MEMORY_CACHE_MAX_ENTRIES = 12;
const memory = new Map<string, { payload: MoneyFlowResponse }>();
const inFlight = new Map<string, Promise<MoneyFlowResponse>>();

function cacheInMemory(cacheKey: string, payload: MoneyFlowResponse): void {
  memory.set(cacheKey, { payload });
  while (memory.size > MEMORY_CACHE_MAX_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
}

const dbGet = <T>(sql: string, params: unknown[] = []): Promise<T | undefined> =>
  new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T | undefined);
    });
  });

function cacheDir(): string {
  return path.join(path.dirname(getDatabasePath()), '.money-flow-cache');
}

function cacheFile(windowDays: number, asOf: string): string {
  const safe = asOf.replace(/[^0-9A-Za-z._-]/g, '_');
  return path.join(cacheDir(), `${CACHE_VERSION}-${windowDays}-${safe}.json`);
}

function readDiskCache(windowDays: number, asOf: string): MoneyFlowResponse | null {
  try {
    const file = cacheFile(windowDays, asOf);
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as MoneyFlowResponse;
    if (!parsed || parsed.days !== windowDays) return null;
    return parsed;
  } catch (err) {
    logger.warn('Money-flow disk cache unreadable', err);
    return null;
  }
}

function writeDiskCache(windowDays: number, asOf: string, payload: MoneyFlowResponse): void {
  try {
    const dir = cacheDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cacheFile(windowDays, asOf), JSON.stringify(payload));
    const keep = new Set(
      [7, 30, 90].map((d) => path.basename(cacheFile(d, asOf)))
    );
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith(`${CACHE_VERSION}-`)) continue;
      if (keep.has(name)) continue;
      try {
        fs.unlinkSync(path.join(dir, name));
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    logger.warn('Money-flow disk cache write failed', err);
  }
}

async function latestAsOf(): Promise<string> {
  const [raw, slab] = await Promise.all([
    dbGet<{ maxDate: string }>(
      `SELECT date AS maxDate FROM price_history
       WHERE source IN ('catalog_fallback', 'tcgcsv', 'tcgdex')
         AND COALESCE(marketPrice, price, 0) > 0
       ORDER BY date DESC LIMIT 1`
    ),
    dbGet<{ maxDate: string }>(
      `SELECT date AS maxDate FROM graded_price_history
       WHERE grader = 'psa' AND grade = '10' AND price > 0
       ORDER BY date DESC LIMIT 1`
    ),
  ]);
  return `${raw?.maxDate || 'none'}|${slab?.maxDate || 'none'}`;
}

function toTagged(entry: RawMoverEntry | SlabMoverEntry, finish: MoneyFlowFinish): TaggedMover {
  const era = classifyMoneyFlowEra({ id: entry.setId, name: entry.setName });
  const specials = detectSpecialCohorts({
    name: entry.productName,
    rarity: entry.rarity,
    era,
  });
  return {
    changePercent: entry.changePercent,
    currentPrice: entry.currentPrice,
    previousPrice: entry.previousPrice,
    dollarMove: entry.currentPrice - entry.previousPrice,
    era,
    finish,
    specials,
    uniqueIdentifier: entry.uniqueIdentifier,
    exemplar: {
      productName: entry.productName,
      changePercent: entry.changePercent,
      currentPrice: entry.currentPrice,
      previousPrice: entry.previousPrice,
      imageSmall: entry.imageSmall,
      imageLarge: entry.imageLarge,
      cardId: entry.cardId,
      setId: entry.setId,
      setName: entry.setName,
      rarity: entry.rarity,
      finish,
    },
  };
}

export async function getMoneyFlow(days: number): Promise<MoneyFlowResponse> {
  const windowDays = normalizeMoneyFlowDays(days);
  const asOf = await latestAsOf();
  const cacheKey = `${CACHE_VERSION}:${windowDays}:${asOf}`;
  const hit = memory.get(cacheKey);
  if (hit) return hit.payload;

  const disk = readDiskCache(windowDays, asOf);
  if (disk) {
    cacheInMemory(cacheKey, disk);
    return disk;
  }

  // Concurrent requests during a cold cache should share one computation
  // instead of each redoing the same expensive aggregation.
  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const compute = computeMoneyFlow(windowDays, asOf, cacheKey).finally(() => {
    inFlight.delete(cacheKey);
  });
  inFlight.set(cacheKey, compute);
  return compute;
}

async function computeMoneyFlow(
  windowDays: number,
  asOf: string,
  cacheKey: string
): Promise<MoneyFlowResponse> {
  const started = Date.now();
  const [rawUniverse, slabUniverse] = await Promise.all([
    listQualifiedRawMovers(windowDays, {
      minPrice: MONEY_FLOW_RAW_MIN_PRICE,
      minAbsDollar: 0,
      candidatePool: 'all',
      pathFilter: 'loud',
      loudAbsDollar: 8,
      loudAbsPct: 20,
      cacheNamespace: 'money-flow-all',
    }),
    listQualifiedSlabMovers(windowDays, {
      minPrice: MONEY_FLOW_PSA10_MIN_PRICE,
      minAbsDollar: 0,
      candidatePool: 'all',
      pathFilter: 'loud',
      loudAbsDollar: 20,
      loudAbsPct: 20,
      collapseByCardId: true,
      cacheNamespace: 'money-flow-all',
    }),
  ]);

  const rawTagged = rawUniverse.movers.map((m) => toTagged(m, 'raw'));
  const slabTagged = slabUniverse.movers.map((m) => toTagged(m, 'psa10'));
  const beforeFilter = rawTagged.length + slabTagged.length;

  const tagged: TaggedMover[] = [...rawTagged, ...slabTagged].filter((m) =>
    isMoneyFlowRelevantPrint({
      rarity: m.exemplar.rarity,
      name: m.exemplar.productName,
      currentPrice: m.currentPrice,
      finish: m.finish,
    })
  );
  const filteredOutCount = Math.max(0, beforeFilter - tagged.length);

  const asOfDate = rawUniverse.date || slabUniverse.date;
  const payload = buildMoneyFlowFromTagged(windowDays, tagged, asOfDate, filteredOutCount);
  await fillMoneyFlowPayloadImages(payload);

  cacheInMemory(cacheKey, payload);
  writeDiskCache(windowDays, asOf, payload);
  logger.info(
    `Money flow ${windowDays}d: ${payload.summary.trackedCount} prints (${filteredOutCount} bulk dropped) in ${Date.now() - started}ms`
  );
  return payload;
}
