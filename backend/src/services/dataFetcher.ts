import { getDb } from '../db/database';
import { generateUniqueIdentifier } from './cardIdentifier';
import { backupDatabaseToCloud } from './cloudBackupService';
import { logger } from '../utils/logger';
import { syncCatalogData } from './catalogSync';
import { tcgdexMarketProvider } from './providers/tcgdexMarketProvider';
import { MarketPriceProvider } from './providers/contracts';

const SYNC_TIMEZONE = 'America/New_York';
let isUpdateRunning = false;

const normalizeVariantKey = (value?: string): string => {
  if (!value) return 'normal';
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized || 'normal';
};

const getRunDate = (): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SYNC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
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
}

const loadCatalogCards = async (): Promise<CatalogCardRow[]> => {
  const db = getDb();
  const fetchRows = () =>
    new Promise<CatalogCardRow[]>((resolve, reject) => {
      db.all(
        `SELECT cardId, cardName, setId, setName, cardNumber, tcgplayerProductId, tcgplayerPrices
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
        const marketPrice = price.market ?? price.mid ?? price.low ?? 0;
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

      // Get top gainers and losers
      const gainersSql = `
        SELECT 
          ph1.productName,
          ph1.price as currentPrice,
          ph2.price as previousPrice,
          ((ph1.price - ph2.price) / ph2.price * 100) as changePercent
        FROM price_history ph1
        JOIN price_history ph2 ON ph1.productId = ph2.productId
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
            (date, totalCards, avgPrice, totalVolume, topGainers, topLosers)
            VALUES (?, ?, ?, ?, ?, ?)
          `;

          db.run(insertSnapshotSql, [
            date,
            stats?.totalCards || 0,
            stats?.avgPrice || 0,
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
};

const deterministicProductId = (cardId: string, variantKey: string): number => {
  const input = `${cardId}|${variantKey}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) + 1;
};

const snapshotFromPokemonCatalog = async (date: string) => {
  const db = getDb();
  const priceInsertSql = `
    INSERT INTO price_history (
      productId, date, price, subTypeName, productName, groupName,
      source, lowPrice, highPrice, marketPrice, volume, uniqueIdentifier
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(productId, date, source, subTypeName) DO UPDATE SET
      price = excluded.price,
      lowPrice = excluded.lowPrice,
      highPrice = excluded.highPrice,
      marketPrice = excluded.marketPrice,
      productName = excluded.productName,
      groupName = excluded.groupName,
      uniqueIdentifier = excluded.uniqueIdentifier;
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

  await new Promise<void>((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      try {
        for (const row of refreshedRows) {
          const parsedPrices = JSON.parse(row.tcgplayerPrices || '{}');
          for (const [variantKey, variantValue] of Object.entries(parsedPrices)) {
            const priceData = variantValue as {
              market?: number;
              mid?: number;
              low?: number;
              high?: number;
            };
            const market = priceData.market ?? priceData.mid ?? priceData.low ?? 0;
            if (!market || market <= 0) {
              continue;
            }

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

            stmt.run([
              productId,
              date,
              market,
              variantKey,
              row.cardName,
              row.setName,
              'catalog_fallback',
              priceData.low ?? null,
              priceData.high ?? null,
              priceData.market ?? market,
              null,
              uniqueIdentifier,
            ]);
            inserted += 1;
          }
        }

        stmt.finalize();
        db.run('COMMIT', (commitErr) => {
          if (commitErr) {
            reject(commitErr);
            return;
          }
          resolve();
        });
      } catch (err) {
        stmt.finalize();
        db.run('ROLLBACK', () => reject(err));
      }
    });
  });

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
    ON CONFLICT(productId, date, source, subTypeName) DO UPDATE SET
      price = excluded.price,
      lowPrice = excluded.lowPrice,
      highPrice = excluded.highPrice,
      marketPrice = excluded.marketPrice,
      productName = excluded.productName,
      groupName = excluded.groupName,
      uniqueIdentifier = excluded.uniqueIdentifier;
  `;

  const mappingInsertSql = `
    INSERT OR REPLACE INTO card_mappings 
    (cardId, productId, cardName, setId, setName, cardNumber, rarity, variantKey, tcgplayerProductId, uniqueIdentifier, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `;

  const priceStmt = db.prepare(priceInsertSql);
  const mappingStmt = db.prepare(mappingInsertSql);
  const concurrency = 6;
  let index = 0;
  const collected: Array<{
    row: CatalogCardRow;
    variantKey: string;
    subTypeName: string;
    productId: number;
    marketPrice: number;
    lowPrice?: number;
    highPrice?: number;
    source: 'tcgdex' | 'catalog_fallback';
  }> = [];
  let cardsProcessed = 0;
  let cardsFailed = 0;
  let tcgdexAttempted = 0;
  let tcgdexSuccessful = 0;
  let tcgdexDisabledForRun = false;

  await Promise.all(
    Array.from({ length: concurrency }).map(async () => {
      while (true) {
        const nextIndex = index;
        index += 1;
        if (nextIndex >= rows.length) {
          return;
        }

        const row = rows[nextIndex];
        const snapshot = tcgdexDisabledForRun
          ? null
          : await marketProvider.getSnapshotForCard(row.cardId);
        const tcgdexPoints = snapshot?.points ?? [];
        if (!tcgdexDisabledForRun) {
          tcgdexAttempted += 1;
          if (tcgdexPoints.length > 0) {
            tcgdexSuccessful += 1;
          }
          if (tcgdexAttempted >= 200 && tcgdexSuccessful === 0) {
            tcgdexDisabledForRun = true;
            logger.warn('TCGdex appears unavailable for this run; switching to catalog fallback only', {
              attempted: tcgdexAttempted,
            });
          }
        }
        const fallbackPoints = tcgdexPoints.length > 0 ? [] : extractCatalogFallbackPoints(row);
        const chosenPoints = tcgdexPoints.length > 0 ? tcgdexPoints : fallbackPoints;
        if (chosenPoints.length === 0) {
          cardsFailed += 1;
          continue;
        }

        for (const point of chosenPoints) {
          const rawVariantName =
            'rawVariantName' in point
              ? point.rawVariantName
              : 'subTypeName' in point
                ? point.subTypeName
                : point.variantKey;
          const variantKey = normalizeVariantKey(rawVariantName || point.variantKey);
          const candidateProductId = Number(point.productId);
          const productId =
            Number.isFinite(candidateProductId) && candidateProductId > 0
              ? candidateProductId
              : deterministicProductId(row.cardId, variantKey);

          collected.push({
            row,
            variantKey,
            subTypeName: rawVariantName || variantKey,
            productId,
            marketPrice: point.marketPrice,
            lowPrice: point.lowPrice,
            highPrice: point.highPrice,
            source: tcgdexPoints.length > 0 ? 'tcgdex' : 'catalog_fallback',
          });
        }
        cardsProcessed += 1;
      }
    })
  );

  await new Promise<void>((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      try {
        for (const entry of collected) {
          const uniqueIdentifier = generateUniqueIdentifier(
            entry.row.setId,
            entry.row.cardNumber,
            entry.row.cardName,
            entry.variantKey
          );

          priceStmt.run([
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
            null,
            uniqueIdentifier,
          ]);

          mappingStmt.run([
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
          ]);
        }

        priceStmt.finalize();
        mappingStmt.finalize();
        db.run('COMMIT', (commitErr) => {
          if (commitErr) {
            reject(commitErr);
            return;
          }
          resolve();
        });
      } catch (err) {
        priceStmt.finalize();
        mappingStmt.finalize();
        db.run('ROLLBACK', () => reject(err));
      }
    });
  });

  return {
    pricesWritten: collected.length,
    cardsProcessed,
    cardsFailed,
  };
};

export const updatePriceData = async () => {
  if (isUpdateRunning) {
    return {
      started: false,
      skipped: true,
      reason: 'Update already running',
    };
  }

  isUpdateRunning = true;
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
      started: true,
      skipped: false,
      runDate,
      error: (error as Error).message,
    };
  } finally {
    isUpdateRunning = false;
  }
};
