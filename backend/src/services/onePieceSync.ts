import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import { allDbRows, runDb } from '../utils/dbAsync';
import { isSkippedDbJob, withDbJobLock } from '../utils/dbJobLock';
import { getAllOptcgCards } from './providers/onePieceOptcgClient';
import { mapRawToCatalogFields } from './onePieceMapper';

interface SyncOnePieceResult {
  setsProcessed: number;
  cardsUpserted: number;
  pricesRecorded: number;
  runDate: string;
}

const getRunDateEst = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const upsertCatalogCardSql = `
  INSERT INTO onepiece_catalog (
    catalogId,
    cardSetId,
    cardImageId,
    cardName,
    setId,
    setName,
    rarity,
    cardColor,
    cardType,
    cardCost,
    cardPower,
    counterAmount,
    life,
    subTypes,
    attribute,
    cardText,
    imageUrl,
    marketPrice,
    inventoryPrice,
    syncedAt
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(catalogId) DO UPDATE SET
    cardSetId = excluded.cardSetId,
    cardImageId = excluded.cardImageId,
    cardName = excluded.cardName,
    setId = excluded.setId,
    setName = excluded.setName,
    rarity = excluded.rarity,
    cardColor = excluded.cardColor,
    cardType = excluded.cardType,
    cardCost = excluded.cardCost,
    cardPower = excluded.cardPower,
    counterAmount = excluded.counterAmount,
    life = excluded.life,
    subTypes = excluded.subTypes,
    attribute = excluded.attribute,
    cardText = excluded.cardText,
    imageUrl = excluded.imageUrl,
    marketPrice = excluded.marketPrice,
    inventoryPrice = excluded.inventoryPrice,
    syncedAt = datetime('now')
`;

const upsertPriceHistorySql = `
  INSERT INTO onepiece_price_history (catalogId, date, marketPrice, inventoryPrice, source)
  VALUES (?, ?, ?, ?, 'optcg')
  ON CONFLICT(catalogId, date, source) DO UPDATE SET
    marketPrice = excluded.marketPrice,
    inventoryPrice = excluded.inventoryPrice
`;

export const syncOnePieceData = async (): Promise<SyncOnePieceResult> => {
  const result = await withDbJobLock(
    'onepiece_sync',
    async () => {
    const runDate = getRunDateEst();
    let cardsUpserted = 0;
    let pricesRecorded = 0;

    const db = getDb();
    logger.info('One Piece sync: fetching full catalog (sets + ST + promos + Don!!)...');
    const rawCards = await getAllOptcgCards(true);
    logger.info(`One Piece sync: ${rawCards.length} cards fetched from OPTCG`);

    await new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const catalogStmt = db.prepare(upsertCatalogCardSql);
        const priceStmt = db.prepare(upsertPriceHistorySql);

        try {
          for (const raw of rawCards) {
            const card = mapRawToCatalogFields(raw);
            catalogStmt.run([
              card.catalogId,
              card.cardSetId,
              card.cardImageId,
              card.cardName,
              card.setId,
              card.setName,
              card.rarity,
              card.cardColor,
              card.cardType,
              card.cardCost,
              card.cardPower,
              card.counterAmount,
              card.life,
              card.subTypes,
              card.attribute,
              card.cardText,
              card.imageUrl,
              card.marketPrice,
              card.inventoryPrice,
            ]);
            cardsUpserted += 1;

            if (card.marketPrice != null || card.inventoryPrice != null) {
              priceStmt.run([card.catalogId, runDate, card.marketPrice, card.inventoryPrice]);
              pricesRecorded += 1;
            }
          }

          catalogStmt.finalize();
          priceStmt.finalize();
          db.run('COMMIT', (commitErr) => {
            if (commitErr) reject(commitErr);
            else resolve();
          });
        } catch (err) {
          catalogStmt.finalize();
          priceStmt.finalize();
          db.run('ROLLBACK', () => reject(err));
        }
      });
    });

    await runDb(
      db,
      `INSERT INTO sync_runs (runType, runDate, status, totalPricesProcessed, message, completedAt)
       VALUES ('onepiece_sync', ?, 'completed', ?, ?, datetime('now'))`,
      [runDate, pricesRecorded, `Full catalog: ${cardsUpserted} cards`]
    );

    logger.info('One Piece sync completed', { cardsUpserted, pricesRecorded, runDate });
    return { setsProcessed: 1, cardsUpserted, pricesRecorded, runDate };
    },
    { skipIfBusy: true }
  );

  if (isSkippedDbJob(result)) {
    return { setsProcessed: 0, cardsUpserted: 0, pricesRecorded: 0, runDate: getRunDateEst() };
  }

  return result;
};

export const getOnePieceCatalogCount = async (): Promise<number> => {
  const db = getDb();
  const rows = await allDbRows<{ count: number }>(
    db,
    'SELECT COUNT(*) as count FROM onepiece_catalog'
  );
  return rows[0]?.count ?? 0;
};

const EXPECTED_MIN_CARDS = 5000;

export const isOnePieceCatalogIncomplete = async (): Promise<boolean> => {
  const count = await getOnePieceCatalogCount();
  return count < EXPECTED_MIN_CARDS;
};
