import { getDb } from '../db/database';
import { generateUniqueIdentifier } from './cardIdentifier';
import { backupDatabaseToCloud } from './cloudBackupService';
import { logger } from '../utils/logger';
import { isSkippedDbJob, withDbJobLock } from '../utils/dbJobLock';
import { syncCatalogData } from './catalogSync';
import { tcgdexMarketProvider, tcgdexJaMarketProvider } from './providers/tcgdexMarketProvider';
import { MarketPriceProvider, MarketPriceSnapshot } from './providers/contracts';
import { canonicalFinishVariantKey, normalizeVariantKey } from '../utils/normalizeVariantKey';
import { createPkmnPricesProvider, PkmnPricesMarketProvider } from './providers/pkmnPricesProvider';
import { env } from '../config/env';
import { resolveListingPrice } from '../utils/resolveListingPrice';
import { resolveProduct } from './priceChartingResolver';
import { materializeCanonicalPrices } from './canonicalPriceService';
import { isIsolatedEndpointSpike } from './topMoversQuality';
import {
  ProductIdOwner,
  cardLooksLikeSubsetPrint,
  productIdConflictsWithPrintFamily,
  resolveProductIdFromOwners,
} from '../utils/productIdGuard';

export { normalizeVariantKey } from '../utils/normalizeVariantKey';

const SYNC_TIMEZONE = 'America/New_York';

const MAX_REASONABLE_PRICE = 50000;
const MIN_PRICE = 0.01;

// Initialize PkmnPrices provider
const pkmnPricesProvider = createPkmnPricesProvider(env.apis.pkmnprices);

/**
 * Multi-provider wrapper that tries TCGdex first, then PkmnPrices, then returns null.
 */
class MultiSourceMarketProvider implements MarketPriceProvider {
  private providers: MarketPriceProvider[];

  constructor(providers: MarketPriceProvider[]) {
    this.providers = providers;
  }

  async getSnapshotForCard(
    cardId: string,
    cardName?: string,
    setId?: string,
    setName?: string
  ): Promise<MarketPriceSnapshot | null> {
    for (const provider of this.providers) {
      try {
        const snapshot = await provider.getSnapshotForCard(cardId, cardName, setId, setName);
        if (snapshot && snapshot.points.length > 0) {
          return snapshot;
        }
      } catch (error) {
        logger.debug('Provider failed, trying next', {
          provider: provider.constructor.name,
          cardId,
          error: (error as Error).message,
        });
      }
    }
    return null;
  }
}

const multiSourceProvider = new MultiSourceMarketProvider([
  tcgdexMarketProvider,
  pkmnPricesProvider,
]);

export const isValidPrice = (price: number | null | undefined): boolean => {
  if (price == null || !Number.isFinite(price)) return false;
  return price >= MIN_PRICE && price <= MAX_REASONABLE_PRICE;
};

export const getRunDate = (): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SYNC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
};

export const shiftIsoDate = (isoDate: string, days: number): string => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
};

export const PRICE_CATCHUP_LOOKBACK_DAYS = 14;
export const PRICE_SNAPSHOT_HOUR_ET = 2;
const MIN_HISTORY_ROWS_FOR_DAY = 1000;
const MAX_LIVE_FETCHES_PER_PASS = 3;

export const easternHourNow = (now = new Date()): number => {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: SYNC_TIMEZONE,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now),
    10
  );
  return Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : 0;
};

/** Dates in [today-lookback, today] that still need a completed price_update. */
export const listPriceCatchUpDates = (
  today: string,
  completedDates: Set<string>,
  options?: { easternHour?: number; lookbackDays?: number }
): string[] => {
  const lookback = options?.lookbackDays ?? PRICE_CATCHUP_LOOKBACK_DAYS;
  const hour = options?.easternHour ?? easternHourNow();
  const includeToday = hour >= PRICE_SNAPSHOT_HOUR_ET;
  const dates: string[] = [];
  for (let offset = lookback; offset >= 0; offset -= 1) {
    const date = shiftIsoDate(today, -offset);
    if (date === today && !includeToday) continue;
    if (!completedDates.has(date)) dates.push(date);
  }
  return dates;
};

/** Copy the latest raw quote per UID/source onto a missed calendar day so charts stay daily. */
export const carryForwardPricesToDate = async (
  runDate: string
): Promise<{ sourceDate: string | null; rowsCopied: number }> => {
  const db = getDb();
  const sourceDate = await new Promise<string | null>((resolve, reject) => {
    db.get(
      `SELECT MAX(date) AS d FROM price_history WHERE date < ?`,
      [runDate],
      (err, row: { d?: string | null }) => {
        if (err) reject(err);
        else resolve(row?.d || null);
      }
    );
  });
  if (!sourceDate) {
    return { sourceDate: null, rowsCopied: 0 };
  }

  const rowsCopied = await new Promise<number>((resolve, reject) => {
    db.run(
      `INSERT INTO price_history (
         productId, date, price, subTypeName, productName, groupName,
         source, lowPrice, highPrice, marketPrice, volume, uniqueIdentifier
       )
       SELECT
         ph.productId, ?, ph.price, ph.subTypeName, ph.productName, ph.groupName,
         ph.source, ph.lowPrice, ph.highPrice, ph.marketPrice, ph.volume, ph.uniqueIdentifier
       FROM price_history ph
       INNER JOIN (
         SELECT uniqueIdentifier, source, MAX(date) AS lastDate
         FROM price_history
         WHERE date < ?
         GROUP BY uniqueIdentifier, source
       ) latest
         ON latest.uniqueIdentifier = ph.uniqueIdentifier
        AND latest.source = ph.source
        AND latest.lastDate = ph.date
       ON CONFLICT(uniqueIdentifier, date, source) DO NOTHING`,
      [runDate, runDate],
      function (err) {
        if (err) reject(err);
        else resolve(this.changes ?? 0);
      }
    );
  });

  logger.info('Carried forward raw prices', { runDate, sourceDate, rowsCopied });
  return { sourceDate, rowsCopied };
};

export const failStalePriceUpdateRuns = async (staleHours = 2): Promise<number> => {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE sync_runs
       SET status = 'failed',
           message = 'orphaned running job (process crashed or stuck)',
           completedAt = datetime('now')
       WHERE runType = 'price_update'
         AND status = 'running'
         AND startedAt <= datetime('now', ?)`,
      [`-${Math.max(1, staleHours)} hours`],
      function (err) {
        if (err) reject(err);
        else resolve(this.changes ?? 0);
      }
    );
  });
};

export const hasCompletedPriceUpdateFor = async (runDate: string): Promise<boolean> => {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT 1 FROM sync_runs
       WHERE runType = 'price_update' AND runDate = ? AND status = 'completed'
       LIMIT 1`,
      [runDate],
      (err, row) => (err ? reject(err) : resolve(!!row))
    );
  });
};

const createSyncRun = async (runType: string, runDate: string): Promise<number> => {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO sync_runs (runType, runDate, status, startedAt)
       VALUES (?, ?, 'running', datetime('now'))`,
      [runType, runDate],
      function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
};

const finalizeSyncRun = async (
  runId: number,
  status: 'completed' | 'failed',
  payload: {
    totalPricesProcessed?: number;
    groupsProcessed?: number;
    groupsFailed?: number;
    message?: string;
  }
) => {
  const db = getDb();
  return new Promise<void>((resolve, reject) => {
    db.run(
      `UPDATE sync_runs
       SET status = ?,
           totalPricesProcessed = ?,
           groupsProcessed = ?,
           groupsFailed = ?,
           message = ?,
           completedAt = datetime('now')
       WHERE id = ?`,
      [
        status,
        payload.totalPricesProcessed || 0,
        payload.groupsProcessed || 0,
        payload.groupsFailed || 0,
        payload.message || null,
        runId,
      ],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
};

interface CatalogCardRow {
  cardId: string;
  cardName: string;
  setId: string;
  setName: string;
  cardNumber?: string;
  tcgplayerProductId?: string;
  tcgplayerPrices?: string;
  imageSmall?: string;
  imageLarge?: string;
  language?: string;
  matchName?: string;
}

const loadCatalogCards = async (language?: 'en' | 'ja'): Promise<CatalogCardRow[]> => {
  const db = getDb();
  const fetchRows = () =>
    new Promise<CatalogCardRow[]>((resolve, reject) => {
      const where = language ? `WHERE COALESCE(language, 'en') = ?` : '';
      const params = language ? [language] : [];
      db.all(
        `SELECT cardId, cardName, setId, setName, cardNumber, tcgplayerProductId, tcgplayerPrices,
                imageSmall, imageLarge,
                COALESCE(language, 'en') AS language,
                COALESCE(matchName, cardName) AS matchName
         FROM catalog_cards ${where}`,
        params,
        (err, rows: CatalogCardRow[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

  const rows = await fetchRows();
  if (rows.length > 0 || language === 'ja') {
    return rows;
  }

  logger.info('Catalog empty for market snapshot, syncing catalog first...');
  await syncCatalogData();
  return fetchRows();
};

const extractCatalogFallbackPoints = (
  row: CatalogCardRow,
  preferredProductId?: number | null
): Array<{
  variantKey: string;
  subTypeName: string;
  productId: number;
  marketPrice: number;
  lowPrice?: number;
  highPrice?: number;
}> => {
  if (!row.tcgplayerPrices) {
    return [];
  }

  try {
    const parsed = JSON.parse(row.tcgplayerPrices) as Record<
      string,
      { market?: number; mid?: number; low?: number; high?: number }
    >;
    return Object.entries(parsed)
      .map(([rawVariant, price]) => {
        const marketPrice = resolveListingPrice({
          market: price.market,
          mid: price.mid,
          low: price.low,
          high: price.high,
        });
        if (!marketPrice || marketPrice <= 0) {
          return null;
        }
        const variantKey = normalizeVariantKey(rawVariant);
        const parsedProductId = row.tcgplayerProductId
          ? Number.parseInt(String(row.tcgplayerProductId), 10)
          : Number.NaN;
        const productId =
          preferredProductId && preferredProductId > 0
            ? preferredProductId
            : Number.isFinite(parsedProductId)
              ? parsedProductId
              : deterministicProductId(row.cardId, variantKey);

        return {
          variantKey,
          subTypeName: rawVariant,
          productId,
          marketPrice,
          lowPrice: price.low,
          highPrice: price.high,
        };
      })
      .filter((point): point is NonNullable<typeof point> => Boolean(point));
  } catch {
    return [];
  }
};

const createDailySnapshot = async (date: string) => {
  const db = getDb();

  return new Promise<void>((resolve, reject) => {
    // Calculate daily statistics
    const statsSql = `
      SELECT 
        COUNT(*) as totalCards,
        AVG(price) as avgPrice,
        COUNT(*) as totalVolume
      FROM price_history 
      WHERE date = ?
    `;

    db.get(statsSql, [date], (err, stats: any) => {
      if (err) {
        reject(err);
        return;
      }

      // Compute median price using SQLite's PERCENTILE-style approach
      const medianSql = `
        SELECT AVG(price) as medianPrice FROM (
          SELECT price FROM price_history
          WHERE date = ? AND price > 0
          ORDER BY price
          LIMIT 2 - (SELECT COUNT(*) FROM price_history WHERE date = ? AND price > 0) % 2
          OFFSET (SELECT (COUNT(*) - 1) / 2 FROM price_history WHERE date = ? AND price > 0)
        )
      `;

      db.get(medianSql, [date, date, date], (err, medianRow: any) => {
        if (err) {
          reject(err);
          return;
        }

        // Get top gainers and losers
        const gainersSql = `
          SELECT 
            ph1.productName,
            ph1.price as currentPrice,
            ph2.price as previousPrice,
            ((ph1.price - ph2.price) / ph2.price * 100) as changePercent
          FROM price_history ph1
          JOIN price_history ph2 ON ph1.uniqueIdentifier = ph2.uniqueIdentifier
          WHERE ph1.date = ? 
            AND ph2.date = date(?, '-1 day')
            AND ph1.price > 0 AND ph2.price > 0
          ORDER BY changePercent DESC
          LIMIT 10
        `;

        db.all(gainersSql, [date, date], (err, gainers) => {
          if (err) {
            reject(err);
            return;
          }

          const losersSql = gainersSql.replace('DESC', 'ASC');
          db.all(losersSql, [date, date], (err, losers) => {
            if (err) {
              reject(err);
              return;
            }

            // Insert snapshot
            const insertSnapshotSql = `
              INSERT OR REPLACE INTO price_snapshots 
              (date, totalCards, avgPrice, medianPrice, totalVolume, topGainers, topLosers)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            db.run(
              insertSnapshotSql,
              [
                date,
                stats?.totalCards || 0,
                stats?.avgPrice || 0,
                medianRow?.medianPrice ?? null,
                stats?.totalVolume || 0,
                JSON.stringify(gainers || []),
                JSON.stringify(losers || []),
              ],
              (err) => {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              }
            );
          });
        });
      });
    });
  });
};

import crypto from 'crypto';

export const deterministicProductId = (cardId: string, variantKey: string): number => {
  const input = `${cardId}|${variantKey}`;
  const hash = crypto.createHash('sha256').update(input).digest();
  // Use first 4 bytes as a 32-bit unsigned integer
  // SHA-256 collision probability for N items is ~N^2 / 2^257, negligible for ~20k cards
  return ((hash.readUInt32BE(0) >>> 0) % 100000000) + 1;
};

const snapshotFromPokemonCatalog = async (date: string) => {
  const db = getDb();
  const priceInsertSql = `
    INSERT INTO price_history (
      productId, date, price, subTypeName, productName, groupName,
      source, lowPrice, highPrice, marketPrice, volume, uniqueIdentifier
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(uniqueIdentifier, date, source) DO UPDATE SET
      price = excluded.price,
      lowPrice = excluded.lowPrice,
      highPrice = excluded.highPrice,
      marketPrice = excluded.marketPrice,
      productName = excluded.productName,
      groupName = excluded.groupName,
      productId = excluded.productId;
  `;

  const rows = await new Promise<any[]>((resolve, reject) => {
    db.all(
      `SELECT cardId, cardName, setId, setName, cardNumber, tcgplayerProductId, tcgplayerPrices
       FROM catalog_cards
       WHERE tcgplayerPrices IS NOT NULL
       AND tcgplayerPrices <> ''`,
      [],
      (err, resultRows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(resultRows || []);
        }
      }
    );
  });

  if (rows.length === 0) {
    logger.info('Catalog empty for fallback snapshot, syncing catalog first...');
    await syncCatalogData();
  }

  const refreshedRows =
    rows.length > 0
      ? rows
      : await new Promise<any[]>((resolve, reject) => {
          db.all(
            `SELECT cardId, cardName, setId, setName, cardNumber, tcgplayerProductId, tcgplayerPrices
           FROM catalog_cards
           WHERE tcgplayerPrices IS NOT NULL
           AND tcgplayerPrices <> ''`,
            [],
            (err, resultRows: any[]) => {
              if (err) {
                reject(err);
              } else {
                resolve(resultRows || []);
              }
            }
          );
        });

  const stmt = db.prepare(priceInsertSql);
  let inserted = 0;

  const runStmt = (params: unknown[]): Promise<void> =>
    new Promise((resolve, reject) => {
      stmt.run(params, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

  try {
    await new Promise<void>((resolve, reject) => {
      db.run('BEGIN TRANSACTION', (err) => (err ? reject(err) : resolve()));
    });

    for (const row of refreshedRows) {
      const parsedPrices = JSON.parse(row.tcgplayerPrices || '{}');
      for (const [rawVariantKey, variantValue] of Object.entries(parsedPrices)) {
        const priceData = variantValue as {
          market?: number;
          mid?: number;
          low?: number;
          high?: number;
        };
        const market = resolveListingPrice({
          market: priceData.market,
          mid: priceData.mid,
          low: priceData.low,
          high: priceData.high,
        });
        if (!market || market <= 0) {
          continue;
        }

        if (!isValidPrice(market)) {
          continue;
        }

        const variantKey = normalizeVariantKey(rawVariantKey);
        const uniqueIdentifier = generateUniqueIdentifier(
          row.setId,
          row.cardNumber,
          row.cardName,
          variantKey,
          {
            language: (row as CatalogCardRow).language || 'en',
            matchName: (row as CatalogCardRow).matchName || row.cardName,
          }
        );
        const parsedProductId = row.tcgplayerProductId
          ? Number.parseInt(String(row.tcgplayerProductId), 10)
          : Number.NaN;
        const productId = Number.isFinite(parsedProductId)
          ? parsedProductId
          : deterministicProductId(
              row.cardId || `${row.setId}-${row.cardNumber}-${row.cardName}`,
              variantKey
            );

        await runStmt([
          productId,
          date,
          market,
          variantKey,
          row.cardName,
          row.setName,
          'catalog_fallback',
          priceData.low ?? null,
          priceData.high ?? null,
          market,
          null,
          uniqueIdentifier,
        ]);
        inserted += 1;
      }
    }

    stmt.finalize();
    await new Promise<void>((resolve, reject) => {
      db.run('COMMIT', (err) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    stmt.finalize();
    await new Promise<void>((resolve) => {
      db.run('ROLLBACK', () => resolve());
    });
    throw err;
  }

  return inserted;
};

const snapshotFromMarketProvider = async (
  date: string,
  marketProvider: MarketPriceProvider,
  options?: { language?: 'en' | 'ja'; sourceOverride?: string }
): Promise<{ pricesWritten: number; cardsProcessed: number; cardsFailed: number }> => {
  const db = getDb();
  const language = options?.language || 'en';
  const rows = await loadCatalogCards(language);
  if (rows.length === 0) {
    return { pricesWritten: 0, cardsProcessed: 0, cardsFailed: 0 };
  }

  // Preload productId ownership so TCGdex cannot remap Trainer Gallery / subset
  // cards onto main-set SKUs that share a name (Mimikyu V TG16 → #68).
  type MappingOwner = ProductIdOwner & { cardName: string; productId: number };
  const mappingOwners = await new Promise<MappingOwner[]>((resolve, reject) => {
    db.all(
      `SELECT cardId, cardName, setName, cardNumber, productId
       FROM card_mappings
       WHERE productId IS NOT NULL AND productId > 0`,
      [],
      (err, result) => {
        if (err) reject(err);
        else resolve((result || []) as MappingOwner[]);
      }
    );
  });
  const ownersByProductId = new Map<number, ProductIdOwner[]>();
  const tcgcsvCandidates: MappingOwner[] = [];
  for (const owner of mappingOwners) {
    const list = ownersByProductId.get(owner.productId) || [];
    list.push({
      cardId: owner.cardId,
      setName: owner.setName,
      cardNumber: owner.cardNumber,
    });
    ownersByProductId.set(owner.productId, list);
    if (String(owner.cardId).startsWith('tcgcsv-')) {
      tcgcsvCandidates.push(owner);
    }
  }

  const resolveTrustedProductId = (
    row: CatalogCardRow,
    tcgdexProductId?: number
  ): number | null => {
    // TCGCSV name+number+print-family is authoritative. Catalog/TCGdex often
    // store the main-set SKU on Trainer Gallery rows (Mimikyu V TG16 → #68).
    const fromTcgcsv = resolveProductIdFromOwners(
      row.cardName,
      row.setName,
      row.cardNumber,
      tcgcsvCandidates
    );
    if (fromTcgcsv) return fromTcgcsv;

    const catalogId = row.tcgplayerProductId
      ? Number.parseInt(String(row.tcgplayerProductId), 10)
      : Number.NaN;
    if (
      Number.isFinite(catalogId) &&
      catalogId > 0 &&
      !productIdConflictsWithPrintFamily(
        catalogId,
        row.setName,
        ownersByProductId.get(catalogId) || []
      )
    ) {
      return catalogId;
    }

    if (
      tcgdexProductId &&
      tcgdexProductId > 0 &&
      !productIdConflictsWithPrintFamily(
        tcgdexProductId,
        row.setName,
        ownersByProductId.get(tcgdexProductId) || []
      )
    ) {
      return tcgdexProductId;
    }
    return null;
  };

  const priceInsertSql = `
    INSERT INTO price_history (
      productId, date, price, subTypeName, productName, groupName,
      source, lowPrice, highPrice, marketPrice, volume, uniqueIdentifier
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(uniqueIdentifier, date, source) DO UPDATE SET
      price = excluded.price,
      lowPrice = excluded.lowPrice,
      highPrice = excluded.highPrice,
      marketPrice = excluded.marketPrice,
      productName = excluded.productName,
      groupName = excluded.groupName,
      productId = excluded.productId;
  `;

  const mappingInsertSql = `
    INSERT OR REPLACE INTO card_mappings 
    (cardId, productId, cardName, setId, setName, cardNumber, rarity, variantKey, tcgplayerProductId,
     uniqueIdentifier, catalogSetId, imageSmall, imageLarge, imageSource, imageLastUpdated,
     language, matchName, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, datetime('now'))
  `;

  const priceStmt = db.prepare(priceInsertSql);
  const mappingStmt = db.prepare(mappingInsertSql);
  const concurrency = 6;

  type CollectedEntry = {
    row: CatalogCardRow;
    variantKey: string;
    subTypeName: string;
    productId: number;
    /** Real TCGPlayer SKU when known; never a deterministic hash. */
    tcgplayerProductId: string | null;
    marketPrice: number;
    lowPrice?: number;
    highPrice?: number;
    volume?: number;
    source: string;
  };

  type WorkerResult = {
    entries: CollectedEntry[];
    cardsProcessed: number;
    cardsFailed: number;
    tcgdexAttempted: number;
    tcgdexSuccessful: number;
  };

  const chunkSize = Math.ceil(rows.length / concurrency);
  const chunks = Array.from({ length: concurrency }, (_, i) =>
    rows.slice(i * chunkSize, (i + 1) * chunkSize)
  );

  const defaultSource = options?.sourceOverride || (language === 'ja' ? 'tcgdex_ja' : 'tcgdex');

  const workerResults = await Promise.all(
    chunks.map(async (chunk): Promise<WorkerResult> => {
      const entries: CollectedEntry[] = [];
      let cardsProcessed = 0;
      let cardsFailed = 0;
      let tcgdexAttempted = 0;
      let tcgdexSuccessful = 0;

      for (const row of chunk) {
        const trustedCatalogProductId = resolveTrustedProductId(row);
        const snapshot = await marketProvider.getSnapshotForCard(row.cardId);
        const tcgdexPoints = snapshot?.points ?? [];
        tcgdexAttempted += 1;

        const trustedTcgplayerId =
          trustedCatalogProductId != null ? String(trustedCatalogProductId) : null;

        const pushFallback = (): boolean => {
          const fallbackPoints = extractCatalogFallbackPoints(row, trustedCatalogProductId);
          if (fallbackPoints.length === 0) return false;
          for (const point of fallbackPoints) {
            const variantKey = normalizeVariantKey(point.subTypeName || point.variantKey);
            if (!isValidPrice(point.marketPrice)) continue;
            entries.push({
              row,
              variantKey,
              subTypeName: point.subTypeName || variantKey,
              productId: point.productId,
              tcgplayerProductId:
                trustedTcgplayerId ||
                (point.productId > 0 ? String(point.productId) : row.tcgplayerProductId || null),
              marketPrice: point.marketPrice,
              lowPrice: isValidPrice(point.lowPrice) ? point.lowPrice : undefined,
              highPrice: isValidPrice(point.highPrice) ? point.highPrice : undefined,
              source: 'catalog_fallback',
            });
          }
          return true;
        };

        if (tcgdexPoints.length === 0) {
          if (!pushFallback()) cardsFailed += 1;
          else cardsProcessed += 1;
          continue;
        }

        const isSubsetCard = cardLooksLikeSubsetPrint(row.setName, row.cardNumber);
        let acceptedTcgdex = 0;
        for (const point of tcgdexPoints) {
          const rawVariantName = String(
            (point as any).rawVariantName ?? (point as any).subTypeName ?? point.variantKey
          );
          const variantKey = canonicalFinishVariantKey(point.variantKey || rawVariantName);
          const candidateProductId = Number(point.productId);
          const tcgdexProductId =
            Number.isFinite(candidateProductId) && candidateProductId > 0
              ? candidateProductId
              : undefined;

          const trustedForPoint = resolveTrustedProductId(row, tcgdexProductId);
          const owners = tcgdexProductId ? ownersByProductId.get(tcgdexProductId) || [] : [];

          // Reject TCGdex SKUs that belong to a different print family, or that
          // disagree with the TCGCSV SKU for this name/number/family. Stamping a
          // main-set price onto a Trainer Gallery UID is what caused chart cliffs.
          if (
            tcgdexProductId &&
            productIdConflictsWithPrintFamily(tcgdexProductId, row.setName, owners)
          ) {
            continue;
          }
          if (trustedForPoint && tcgdexProductId && tcgdexProductId !== trustedForPoint) {
            continue;
          }
          if (isSubsetCard && trustedForPoint && !tcgdexProductId) {
            // Subset cards without a SKU from TCGdex are unreliable (name collision).
            continue;
          }

          const productId =
            trustedForPoint ??
            (tcgdexProductId && tcgdexProductId > 0
              ? tcgdexProductId
              : deterministicProductId(row.cardId, variantKey));

          if (!isValidPrice(point.marketPrice)) {
            continue;
          }

          const isCardmarket = /cardmarket/i.test(rawVariantName);
          entries.push({
            row,
            variantKey,
            subTypeName: variantKey,
            productId,
            tcgplayerProductId:
              trustedForPoint != null ? String(trustedForPoint) : row.tcgplayerProductId || null,
            marketPrice: point.marketPrice,
            lowPrice: isValidPrice(point.lowPrice) ? point.lowPrice : undefined,
            highPrice: isValidPrice(point.highPrice) ? point.highPrice : undefined,
            volume: point.volume,
            source: isCardmarket && language === 'ja' ? 'cardmarket' : defaultSource,
          });
          acceptedTcgdex += 1;
        }

        if (acceptedTcgdex === 0) {
          // All TCGdex points were print-family collisions — keep catalog prices.
          if (!pushFallback()) cardsFailed += 1;
          else cardsProcessed += 1;
          continue;
        }

        tcgdexSuccessful += 1;
        cardsProcessed += 1;
      }

      return { entries, cardsProcessed, cardsFailed, tcgdexAttempted, tcgdexSuccessful };
    })
  );

  const collected = workerResults.flatMap((r) => r.entries);
  const cardsProcessed = workerResults.reduce((s, r) => s + r.cardsProcessed, 0);
  const cardsFailed = workerResults.reduce((s, r) => s + r.cardsFailed, 0);

  const runPriceStmt = (params: unknown[]): Promise<void> =>
    new Promise((resolve, reject) => {
      priceStmt.run(params, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

  const runMappingStmt = (params: unknown[]): Promise<void> =>
    new Promise((resolve, reject) => {
      mappingStmt.run(params, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

  try {
    await new Promise<void>((resolve, reject) => {
      db.run('BEGIN TRANSACTION', (err) => (err ? reject(err) : resolve()));
    });

    for (const entry of collected) {
      const lang = (entry.row.language || language || 'en') as 'en' | 'ja';
      const matchName = entry.row.matchName || entry.row.cardName;
      const uniqueIdentifier = generateUniqueIdentifier(
        entry.row.setId,
        entry.row.cardNumber,
        entry.row.cardName,
        entry.variantKey,
        { language: lang, matchName }
      );

      await runPriceStmt([
        entry.productId,
        date,
        entry.marketPrice,
        entry.subTypeName,
        entry.row.cardName,
        entry.row.setName,
        entry.source,
        entry.lowPrice ?? null,
        entry.highPrice ?? null,
        entry.marketPrice,
        entry.volume ?? null,
        uniqueIdentifier,
      ]);

      await runMappingStmt([
        entry.row.cardId,
        entry.productId,
        entry.row.cardName,
        entry.row.setId,
        entry.row.setName,
        entry.row.cardNumber || null,
        null,
        entry.variantKey,
        entry.tcgplayerProductId || entry.row.tcgplayerProductId || null,
        uniqueIdentifier,
        entry.row.setId,
        entry.row.imageSmall || null,
        entry.row.imageLarge || null,
        entry.row.imageSmall || entry.row.imageLarge ? 'catalog_sync' : null,
        lang,
        matchName,
      ]);
    }

    priceStmt.finalize();
    mappingStmt.finalize();
    await new Promise<void>((resolve, reject) => {
      db.run('COMMIT', (err) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    priceStmt.finalize();
    mappingStmt.finalize();
    await new Promise<void>((resolve) => {
      db.run('ROLLBACK', () => resolve());
    });
    throw err;
  }

  return {
    pricesWritten: collected.length,
    cardsProcessed,
    cardsFailed,
  };
};

/** Fill gaps for Japanese cards using PriceCharting ungraded column (US proxy market). */
const snapshotJapaneseFromPriceCharting = async (
  date: string,
  limit = 80
): Promise<{ pricesWritten: number; cardsProcessed: number }> => {
  const db = getDb();
  const rows = await new Promise<CatalogCardRow[]>((resolve, reject) => {
    db.all(
      `SELECT cc.cardId, cc.cardName, cc.setId, cc.setName, cc.cardNumber,
              cc.tcgplayerProductId, cc.imageSmall, cc.imageLarge,
              COALESCE(cc.language, 'ja') AS language,
              COALESCE(cc.matchName, cc.cardName) AS matchName
       FROM catalog_cards cc
       LEFT JOIN card_mappings cm ON cm.cardId = cc.cardId
       LEFT JOIN price_history ph ON ph.uniqueIdentifier = cm.uniqueIdentifier
         AND ph.date = ? AND ph.source IN ('tcgdex_ja', 'cardmarket', 'pricecharting_raw')
       WHERE COALESCE(cc.language, 'en') = 'ja'
         AND ph.uniqueIdentifier IS NULL
         AND COALESCE(cc.matchName, '') != ''
         AND cc.matchName GLOB '[A-Za-z]*'
       ORDER BY cc.setId, CAST(cc.cardNumber AS INTEGER)
       LIMIT ?`,
      [date, limit],
      (err, result) => {
        if (err) reject(err);
        else resolve((result as CatalogCardRow[]) || []);
      }
    );
  });

  let pricesWritten = 0;
  let cardsProcessed = 0;

  for (const row of rows) {
    cardsProcessed += 1;
    try {
      const resolved = await resolveProduct(
        {
          cardName: row.cardName,
          matchName: row.matchName,
          setId: row.setId,
          setName: row.setName,
          cardNumber: row.cardNumber,
          language: 'ja',
          variant: 'normal',
        },
        1200
      );
      if (!resolved) continue;
      const ungraded = resolved.pageData.gradedPrices.find(
        (p) => p.grader === 'ungraded' && p.price != null && p.price > 0
      );
      if (!ungraded?.price || !isValidPrice(ungraded.price)) continue;

      const variantKey = 'normal';
      const uniqueIdentifier = generateUniqueIdentifier(
        row.setId,
        row.cardNumber,
        row.cardName,
        variantKey,
        { language: 'ja', matchName: row.matchName || row.cardName }
      );
      const productId =
        Number.parseInt(String(resolved.match.productId).replace(/\D/g, ''), 10) || 0;

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO price_history (
             productId, date, price, subTypeName, productName, groupName,
             source, lowPrice, highPrice, marketPrice, volume, uniqueIdentifier
           ) VALUES (?, ?, ?, ?, ?, ?, 'pricecharting_raw', NULL, NULL, ?, NULL, ?)
           ON CONFLICT(uniqueIdentifier, date, source) DO UPDATE SET
             price = excluded.price, marketPrice = excluded.marketPrice`,
          [
            productId,
            date,
            ungraded.price,
            variantKey,
            row.cardName,
            row.setName,
            ungraded.price,
            uniqueIdentifier,
          ],
          (err) => (err ? reject(err) : resolve())
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT OR REPLACE INTO card_mappings
           (cardId, productId, cardName, setId, setName, cardNumber, rarity, variantKey,
            tcgplayerProductId, uniqueIdentifier, catalogSetId, imageSmall, imageLarge,
            imageSource, language, matchName, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, 'catalog_sync', 'ja', ?, datetime('now'))`,
          [
            row.cardId,
            productId,
            row.cardName,
            row.setId,
            row.setName,
            row.cardNumber || null,
            variantKey,
            uniqueIdentifier,
            row.setId,
            row.imageSmall || null,
            row.imageLarge || null,
            row.matchName || row.cardName,
          ],
          (err) => (err ? reject(err) : resolve())
        );
      });

      pricesWritten += 1;
    } catch (error) {
      logger.debug('JA PriceCharting raw snapshot failed', {
        cardId: row.cardId,
        error: (error as Error).message,
      });
    }
  }

  return { pricesWritten, cardsProcessed };
};

export type PriceUpdateOptions = {
  runDate?: string;
  skipIfBusy?: boolean;
  maxWaitMs?: number;
};

const queryColumn = <T>(sql: string, params: unknown[]): Promise<T[]> => {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows: T[]) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

export const getMaxPriceHistoryDate = async (): Promise<string | null> => {
  const rows = await queryColumn<{ d: string | null }>(
    `SELECT MAX(date) AS d FROM price_history`,
    []
  );
  return rows[0]?.d || null;
};

export const getCompletedPriceUpdateDates = async (sinceDate: string): Promise<Set<string>> => {
  const rows = await queryColumn<{ runDate: string }>(
    `SELECT DISTINCT runDate FROM sync_runs
     WHERE runType = 'price_update' AND status = 'completed' AND runDate >= ?`,
    [sinceDate]
  );
  return new Set(rows.map((row) => row.runDate));
};

export const getPopulatedPriceHistoryDates = async (sinceDate: string): Promise<Set<string>> => {
  const rows = await queryColumn<{ date: string }>(
    `SELECT date FROM price_history
     WHERE date >= ?
     GROUP BY date
     HAVING COUNT(*) >= ?`,
    [sinceDate, MIN_HISTORY_ROWS_FOR_DAY]
  );
  return new Set(rows.map((row) => row.date));
};

/** Roll back one-day TCGdex quote spikes off a flat baseline so movers/charts stay honest. */
export const revertIsolatedDailySpikes = async (
  runDate: string
): Promise<{ checked: number; reverted: number }> => {
  const db = getDb();
  const yesterday = shiftIsoDate(runDate, -1);
  const sinceDate = shiftIsoDate(runDate, -6);
  const candidates = await queryColumn<{
    uniqueIdentifier: string;
    source: string;
    todayPrice: number;
    ydayPrice: number;
  }>(
    `SELECT t.uniqueIdentifier, t.source, t.price AS todayPrice, y.price AS ydayPrice
     FROM price_history t
     INNER JOIN price_history y
       ON y.uniqueIdentifier = t.uniqueIdentifier
      AND y.source = t.source
      AND y.date = date(t.date, '-1 day')
     WHERE t.date = ?
       AND t.source IN ('tcgdex', 'tcgdex_ja')
       AND y.price >= ?
       AND ABS(t.price - y.price) / y.price >= 0.40`,
    [runDate, MIN_PRICE]
  );

  if (candidates.length === 0) {
    return { checked: 0, reverted: 0 };
  }

  const uids = [...new Set(candidates.map((c) => c.uniqueIdentifier))];
  const placeholders = uids.map(() => '?').join(',');
  const history = await queryColumn<{
    uniqueIdentifier: string;
    source: string;
    date: string;
    price: number;
  }>(
    `SELECT uniqueIdentifier, source, date, price
     FROM price_history
     WHERE uniqueIdentifier IN (${placeholders})
       AND source IN ('tcgdex', 'tcgdex_ja')
       AND date >= ?
       AND date <= ?`,
    [...uids, sinceDate, runDate]
  );

  const series = new Map<string, { date: string; price: number }[]>();
  for (const row of history) {
    const key = `${row.uniqueIdentifier}||${row.source}`;
    const list = series.get(key) || [];
    list.push({ date: row.date, price: row.price });
    series.set(key, list);
  }

  let reverted = 0;
  for (const candidate of candidates) {
    const points = series.get(`${candidate.uniqueIdentifier}||${candidate.source}`) || [];
    if (!isIsolatedEndpointSpike(points)) continue;
    await new Promise<void>((resolve, reject) => {
      db.run(
        `UPDATE price_history
         SET price = ?, marketPrice = ?
         WHERE uniqueIdentifier = ? AND source = ? AND date = ?`,
        [
          candidate.ydayPrice,
          candidate.ydayPrice,
          candidate.uniqueIdentifier,
          candidate.source,
          runDate,
        ],
        (err) => (err ? reject(err) : resolve())
      );
    });
    reverted += 1;
  }

  if (reverted > 0) {
    logger.warn('Reverted isolated TCGdex quote spikes', {
      runDate,
      checked: candidates.length,
      reverted,
    });
  }
  return { checked: candidates.length, reverted };
};

export const getPriceFreshness = async () => {
  const today = getRunDate();
  const hour = easternHourNow();
  const expectedDate = hour >= PRICE_SNAPSHOT_HOUR_ET ? today : shiftIsoDate(today, -1);
  const latestDate = await getMaxPriceHistoryDate();
  const stale = !latestDate || latestDate < expectedDate;
  return { today, expectedDate, latestDate, stale, easternHour: hour };
};

export const updatePriceData = async (options?: PriceUpdateOptions) => {
  const runDate = options?.runDate || getRunDate();
  await failStalePriceUpdateRuns();
  const result = await withDbJobLock('price_update', () => performPriceUpdate(runDate), {
    skipIfBusy: options?.skipIfBusy ?? true,
    maxWaitMs: options?.maxWaitMs,
  });

  if (isSkippedDbJob(result)) {
    return {
      syncRunId: null,
      started: false,
      skipped: true,
      runDate,
      reason: result.reason,
    };
  }

  return result;
};

const fillMissingHistoryDays = async (dates: string[]) => {
  const filled: Array<{ runDate: string; rowsCopied: number }> = [];
  for (const runDate of dates) {
    try {
      const carried = await carryForwardPricesToDate(runDate);
      filled.push({ runDate, rowsCopied: carried.rowsCopied });
    } catch (error) {
      logger.warn('Carry-forward failed', {
        runDate,
        error: (error as Error).message,
      });
    }
  }
  return filled;
};

let recoverMutex: Promise<{
  syncRunId: number | null;
  started: boolean;
  skipped: boolean;
  runDate: string;
  reason?: string;
  fetched?: unknown[];
  carried?: Array<{ runDate: string; rowsCopied: number }>;
  pendingDates?: string[];
}> | null = null;

/** Fill every missed day in the lookback window; live-fetch today's prices after 2:00 ET. */
export const recoverMissedPriceUpdates = async () => {
  if (recoverMutex) {
    return recoverMutex;
  }
  recoverMutex = runPriceCatchUp().finally(() => {
    recoverMutex = null;
  });
  return recoverMutex;
};

const runPriceCatchUp = async () => {
  await failStalePriceUpdateRuns();
  const today = getRunDate();
  const sinceDate = shiftIsoDate(today, -PRICE_CATCHUP_LOOKBACK_DAYS);
  const [completedDates, populatedDates] = await Promise.all([
    getCompletedPriceUpdateDates(sinceDate),
    getPopulatedPriceHistoryDates(sinceDate),
  ]);
  const hour = easternHourNow();
  const datesNeedingFetch = listPriceCatchUpDates(today, completedDates, { easternHour: hour });
  const datesNeedingRows = listPriceCatchUpDates(today, populatedDates, { easternHour: hour });

  const carried = datesNeedingRows.length > 0 ? await fillMissingHistoryDays(datesNeedingRows) : [];
  if (carried.some((row) => row.rowsCopied > 0)) {
    logger.warn('Carried forward missed price days so charts stay continuous', { carried });
  }

  if (datesNeedingFetch.length === 0) {
    return {
      syncRunId: null,
      started: false,
      skipped: true,
      runDate: today,
      reason: 'already completed',
      carried,
    };
  }

  const toFetch = datesNeedingFetch.slice(0, MAX_LIVE_FETCHES_PER_PASS);
  logger.warn('Backfilling missed price updates', {
    dates: toFetch,
    remaining: datesNeedingFetch.length - toFetch.length,
  });

  const results = [];
  for (const runDate of toFetch) {
    const result = await updatePriceData({
      runDate,
      skipIfBusy: false,
      maxWaitMs: 5 * 60 * 1000,
    });
    results.push(result);
    if (result.skipped) {
      logger.warn('Price backfill stopped early', {
        runDate,
        reason: (result as { reason?: string }).reason,
      });
      break;
    }
  }

  const last = results[results.length - 1];
  return {
    syncRunId: last?.syncRunId ?? null,
    started: Boolean(last?.started),
    skipped: Boolean(last?.skipped),
    runDate: last?.runDate || toFetch[0],
    fetched: results,
    carried,
    pendingDates: datesNeedingFetch.slice(results.length),
  };
};

let recoverInFlight: Promise<unknown> | null = null;
let lastRecoverAttemptAt = 0;
const RECOVER_DEBOUNCE_MS = 60 * 1000;

/** Fire-and-forget catch-up so opening the app heals a stalled ingest. */
export const maybeRecoverStalePrices = (): void => {
  if (recoverInFlight) return;
  if (Date.now() - lastRecoverAttemptAt < RECOVER_DEBOUNCE_MS) return;
  lastRecoverAttemptAt = Date.now();
  recoverInFlight = recoverMissedPriceUpdates()
    .catch((error) => {
      logger.warn('Background price catch-up failed', { error: (error as Error).message });
    })
    .finally(() => {
      recoverInFlight = null;
    });
};

const performPriceUpdate = async (runDate: string) => {
  let syncRunId: number | null = null;

  try {
    logger.info('Starting market price data update...', { runDate, timezone: SYNC_TIMEZONE });
    syncRunId = await createSyncRun('price_update', runDate);
    tcgdexMarketProvider.resetCircuit();
    tcgdexJaMarketProvider.resetCircuit();
    const carried = await carryForwardPricesToDate(runDate);
    let totalPricesProcessed = carried.rowsCopied;
    let groupsProcessed = 0;
    let groupsFailed = 0;
    let usedFallback = false;

    try {
      const marketSnapshot = await snapshotFromMarketProvider(runDate, tcgdexMarketProvider, {
        language: 'en',
      });
      totalPricesProcessed = marketSnapshot.pricesWritten;
      groupsProcessed = marketSnapshot.cardsProcessed;
      groupsFailed = marketSnapshot.cardsFailed;
      logger.info('TCGdex snapshot complete', { runDate, ...marketSnapshot });
      const spikeFix = await revertIsolatedDailySpikes(runDate);
      if (spikeFix.reverted > 0) {
        logger.info('Isolated TCGdex spikes reverted', spikeFix);
      }
    } catch (marketError) {
      logger.warn('TCGdex snapshot failed, using catalog fallback', {
        error: (marketError as Error).message,
      });
      const fallbackRows = await snapshotFromPokemonCatalog(runDate);
      totalPricesProcessed = fallbackRows;
      groupsProcessed = fallbackRows > 0 ? 1 : 0;
      groupsFailed = 0;
      usedFallback = true;
    }

    try {
      const jaSnapshot = await snapshotFromMarketProvider(runDate, tcgdexJaMarketProvider, {
        language: 'ja',
      });
      totalPricesProcessed += jaSnapshot.pricesWritten;
      groupsProcessed += jaSnapshot.cardsProcessed;
      groupsFailed += jaSnapshot.cardsFailed;
      logger.info('TCGdex JA snapshot complete', { runDate, ...jaSnapshot });

      const pcRaw = await snapshotJapaneseFromPriceCharting(runDate, 60);
      totalPricesProcessed += pcRaw.pricesWritten;
      logger.info('PriceCharting JA raw snapshot complete', { runDate, ...pcRaw });
    } catch (jaError) {
      logger.warn('Japanese price snapshot failed', {
        error: (jaError as Error).message,
      });
    }

    try {
      await materializeCanonicalPrices({ sinceDate: runDate });
    } catch (canonErr) {
      logger.warn('Canonical price materialization failed', {
        error: (canonErr as Error).message,
      });
    }

    logger.info('Creating daily market snapshot...');
    await createDailySnapshot(runDate);
    logger.info('Daily market snapshot created.');

    const cloudBackup = await backupDatabaseToCloud(runDate);
    logger.info('Cloud backup result', cloudBackup);

    if (syncRunId) {
      await finalizeSyncRun(syncRunId, 'completed', {
        totalPricesProcessed,
        groupsProcessed,
        groupsFailed,
        message: usedFallback
          ? `fallback_source=catalog_cards; ${cloudBackup.message}`
          : cloudBackup.message,
      });
    }

    return {
      syncRunId,
      started: true,
      skipped: false,
      runDate,
      totalPricesProcessed,
      groupsProcessed,
      groupsFailed,
      cloudBackup,
    };
  } catch (error) {
    logger.error('An error occurred during the price data update process', {
      error: (error as Error).message,
    });
    if (syncRunId) {
      await finalizeSyncRun(syncRunId, 'failed', {
        message: (error as Error).message,
      }).catch((finalizeErr) => {
        logger.error('Failed to finalize sync run', { error: (finalizeErr as Error).message });
      });
    }

    return {
      syncRunId,
      started: true,
      skipped: false,
      runDate,
      error: (error as Error).message,
    };
  }
};
