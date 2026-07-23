import { getDb } from '../db/database';
import { generateUniqueIdentifier } from './cardIdentifier';
import { backupDatabaseToCloud } from './cloudBackupService';
import { logger } from '../utils/logger';
import { isSkippedDbJob, withDbJobLock } from '../utils/dbJobLock';
import { syncCatalogData } from './catalogSync';
import { tcgdexMarketProvider } from './providers/tcgdexMarketProvider';
import { MarketPriceProvider, MarketPriceSnapshot } from './providers/contracts';
import { normalizeVariantKey } from '../utils/normalizeVariantKey';
import { createPkmnPricesProvider, PkmnPricesMarketProvider } from './providers/pkmnPricesProvider';
import { env } from '../config/env';
import { resolveListingPrice } from '../utils/resolveListingPrice';

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

  async getSnapshotForCard(cardId: string, cardName?: string, setId?: string, setName?: string): Promise<MarketPriceSnapshot | null> {
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
  payload: { totalPricesProcessed?: number; groupsProcessed?: number; groupsFailed?: number; message?: string }
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
}

const loadCatalogCards = async (): Promise<CatalogCardRow[]> => {
  const db = getDb();
  const fetchRows = () =>
    new Promise<CatalogCardRow[]>((resolve, reject) => {
      db.all(
        `SELECT cardId, cardName, setId, setName, cardNumber, tcgplayerProductId, tcgplayerPrices,
                imageSmall, imageLarge
         FROM catalog_cards`,
        [],
        (err, rows: CatalogCardRow[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

  const rows = await fetchRows();
  if (rows.length > 0) {
    return rows;
  }

  logger.info('Catalog empty for market snapshot, syncing catalog first...');
  await syncCatalogData();
  return fetchRows();
};

const extractCatalogFallbackPoints = (
  row: CatalogCardRow
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
        const productId = Number.isFinite(parsedProductId)
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

            db.run(insertSnapshotSql, [
              date,
              stats?.totalCards || 0,
              stats?.avgPrice || 0,
              medianRow?.medianPrice ?? null,
              stats?.totalVolume || 0,
              JSON.stringify(gainers || []),
              JSON.stringify(losers || [])
            ], (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
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
  return (hash.readUInt32BE(0) >>> 0) % 100000000 + 1;
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

  const refreshedRows = rows.length > 0
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
          variantKey
        );
        const parsedProductId = row.tcgplayerProductId
          ? Number.parseInt(String(row.tcgplayerProductId), 10)
          : Number.NaN;
        const productId = Number.isFinite(parsedProductId)
          ? parsedProductId
          : deterministicProductId(row.cardId || `${row.setId}-${row.cardNumber}-${row.cardName}`, variantKey);

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
  marketProvider: MarketPriceProvider
): Promise<{ pricesWritten: number; cardsProcessed: number; cardsFailed: number }> => {
  const db = getDb();
  const rows = await loadCatalogCards();
  if (rows.length === 0) {
    return { pricesWritten: 0, cardsProcessed: 0, cardsFailed: 0 };
  }

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
     uniqueIdentifier, catalogSetId, imageSmall, imageLarge, imageSource, imageLastUpdated, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `;

  const priceStmt = db.prepare(priceInsertSql);
  const mappingStmt = db.prepare(mappingInsertSql);
  const concurrency = 6;

  type CollectedEntry = {
    row: CatalogCardRow;
    variantKey: string;
    subTypeName: string;
    productId: number;
    marketPrice: number;
    lowPrice?: number;
    highPrice?: number;
    volume?: number;
    source: 'tcgdex' | 'catalog_fallback';
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

  const workerResults = await Promise.all(
    chunks.map(async (chunk): Promise<WorkerResult> => {
      const entries: CollectedEntry[] = [];
      let cardsProcessed = 0;
      let cardsFailed = 0;
      let tcgdexAttempted = 0;
      let tcgdexSuccessful = 0;

      for (const row of chunk) {
        const snapshot = await marketProvider.getSnapshotForCard(row.cardId);
        const tcgdexPoints = snapshot?.points ?? [];
        tcgdexAttempted += 1;
        if (tcgdexPoints.length > 0) {
          tcgdexSuccessful += 1;
        }
        if (tcgdexPoints.length === 0) {
          const fallbackPoints = extractCatalogFallbackPoints(row);
          if (fallbackPoints.length === 0) {
            cardsFailed += 1;
            continue;
          }

          for (const point of fallbackPoints) {
            const variantKey = normalizeVariantKey(point.subTypeName || point.variantKey);
            if (!isValidPrice(point.marketPrice)) {
              continue;
            }
            entries.push({
              row,
              variantKey,
              subTypeName: point.subTypeName || variantKey,
              productId: point.productId,
              marketPrice: point.marketPrice,
              lowPrice: isValidPrice(point.lowPrice) ? point.lowPrice : undefined,
              highPrice: isValidPrice(point.highPrice) ? point.highPrice : undefined,
              source: 'catalog_fallback',
            });
          }
          cardsProcessed += 1;
          continue;
        }

        for (const point of tcgdexPoints) {
          const rawVariantName = String(
            (point as any).rawVariantName ?? (point as any).subTypeName ?? point.variantKey
          );
          const variantKey = normalizeVariantKey(rawVariantName || point.variantKey);
          const candidateProductId = Number(point.productId);
          const productId =
            Number.isFinite(candidateProductId) && candidateProductId > 0
              ? candidateProductId
              : deterministicProductId(row.cardId, variantKey);

          if (!isValidPrice(point.marketPrice)) {
            continue;
          }

          entries.push({
            row,
            variantKey,
            subTypeName: variantKey,
            productId,
            marketPrice: point.marketPrice,
            lowPrice: isValidPrice(point.lowPrice) ? point.lowPrice : undefined,
            highPrice: isValidPrice(point.highPrice) ? point.highPrice : undefined,
            volume: point.volume,
            source: 'tcgdex',
          });
        }
        cardsProcessed += 1;
      }

      return { entries, cardsProcessed, cardsFailed, tcgdexAttempted, tcgdexSuccessful };
    })
  );

  const collected = workerResults.flatMap((r) => r.entries);
  let cardsProcessed = workerResults.reduce((s, r) => s + r.cardsProcessed, 0);
  let cardsFailed = workerResults.reduce((s, r) => s + r.cardsFailed, 0);
  let tcgdexAttempted = workerResults.reduce((s, r) => s + r.tcgdexAttempted, 0);
  let tcgdexSuccessful = workerResults.reduce((s, r) => s + r.tcgdexSuccessful, 0);

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
      const uniqueIdentifier = generateUniqueIdentifier(
        entry.row.setId,
        entry.row.cardNumber,
        entry.row.cardName,
        entry.variantKey
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
        entry.row.tcgplayerProductId || null,
        uniqueIdentifier,
        entry.row.setId,
        entry.row.imageSmall || null,
        entry.row.imageLarge || null,
        entry.row.imageSmall || entry.row.imageLarge ? 'catalog_sync' : null,
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

export const updatePriceData = async () => {
  const result = await withDbJobLock('price_update', () => performPriceUpdate(), { skipIfBusy: true });

  if (isSkippedDbJob(result)) {
    return {
      syncRunId: null,
      started: false,
      skipped: true,
      runDate: getRunDate(),
      reason: result.reason,
    };
  }

  return result;
};

const performPriceUpdate = async () => {
  const runDate = getRunDate();
  let syncRunId: number | null = null;

  try {
    logger.info('Starting market price data update...', { runDate, timezone: SYNC_TIMEZONE });
    syncRunId = await createSyncRun('price_update', runDate);
    let totalPricesProcessed = 0;
    let groupsProcessed = 0;
    let groupsFailed = 0;
    let usedFallback = false;

    try {
      const marketSnapshot = await snapshotFromMarketProvider(runDate, tcgdexMarketProvider);
      totalPricesProcessed = marketSnapshot.pricesWritten;
      groupsProcessed = marketSnapshot.cardsProcessed;
      groupsFailed = marketSnapshot.cardsFailed;
      logger.info('TCGdex snapshot complete', { runDate, ...marketSnapshot });
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
