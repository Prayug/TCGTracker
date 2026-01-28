import { getDb } from '../db/database';
import { CatalogCardSummary, CatalogProvider, CatalogSetSummary } from './providers/contracts';
import { pokemonCatalogProvider } from './providers/pokemonCatalogProvider';
import { logger } from '../utils/logger';
import { isSkippedDbJob, withDbJobLock } from '../utils/dbJobLock';

interface SyncCatalogResult {
  setsProcessed: number;
  cardsUpserted: number;
}

const upsertCatalogCardSql = `
  INSERT INTO catalog_cards (
    cardId,
    cardName,
    setId,
    setName,
    setReleaseDate,
    cardNumber,
    rarity,
    types,
    artist,
    imageSmall,
    imageLarge,
    tcgplayerProductId,
    tcgplayerPrices,
    syncedAt
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(cardId) DO UPDATE SET
    cardName = excluded.cardName,
    setId = excluded.setId,
    setName = excluded.setName,
    setReleaseDate = excluded.setReleaseDate,
    cardNumber = excluded.cardNumber,
    rarity = excluded.rarity,
    types = excluded.types,
    artist = excluded.artist,
    imageSmall = excluded.imageSmall,
    imageLarge = excluded.imageLarge,
    tcgplayerProductId = excluded.tcgplayerProductId,
    tcgplayerPrices = excluded.tcgplayerPrices,
    syncedAt = datetime('now')
`;

const upsertCards = async (
  cards: CatalogCardSummary[],
  setMeta?: CatalogSetSummary
): Promise<number> => {
  const db = getDb();
  if (!cards.length) {
    return 0;
  }

  return new Promise<number>((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      const stmt = db.prepare(upsertCatalogCardSql);
      let upserted = 0;

      try {
        for (const card of cards) {
          const setReleaseDate = card.setReleaseDate || setMeta?.releaseDate || null;
          stmt.run([
            card.cardId,
            card.cardName,
            card.setId || setMeta?.id || '',
            card.setName || setMeta?.name || '',
            setReleaseDate,
            card.cardNumber || null,
            card.rarity || null,
            card.types ? JSON.stringify(card.types) : null,
            card.artist || null,
            card.imageSmall || null,
            card.imageLarge || null,
            card.tcgplayerProductId || null,
            card.tcgplayerPrices ? JSON.stringify(card.tcgplayerPrices) : null,
          ]);
          upserted += 1;
        }

        stmt.finalize();
        db.run('COMMIT', (commitErr) => {
          if (commitErr) {
            reject(commitErr);
            return;
          }
          resolve(upserted);
        });
      } catch (err) {
        stmt.finalize();
        db.run('ROLLBACK', () => reject(err));
      }
    });
  });
};

const SET_DELAY_MS = 300;
const YIELD_EVERY_N_SETS = 5;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

export const syncCatalogData = async (
  provider: CatalogProvider = pokemonCatalogProvider
): Promise<SyncCatalogResult> => {
  const result = await withDbJobLock(
    'catalog_sync',
    async () => {
    const sets = await provider.getSets(250);
    let setsProcessed = 0;
    let cardsUpserted = 0;

    for (const set of sets) {
      // Yield to event loop periodically to avoid blocking API requests
      if (setsProcessed > 0 && setsProcessed % YIELD_EVERY_N_SETS === 0) {
        await yieldToEventLoop();
      }

      try {
        const setCards = await provider.getCardsForSet(set.id);

        if (!setCards.length) {
          logger.debug(`Skipping empty set: ${set.name}`);
          setsProcessed += 1;
          continue;
        }

        // Yield again before heavy DB work
        await yieldToEventLoop();

        const inserted = await upsertCards(setCards, set);
        cardsUpserted += inserted;
        setsProcessed += 1;

        if (setsProcessed % 25 === 0) {
          logger.info(`Catalog sync progress: ${setsProcessed}/${sets.length} sets processed`);
        }
      } catch (error) {
        logger.warn(`Failed to sync set ${set.name || set.id}`, {
          error: (error as Error).message,
        });
      }

      await delay(SET_DELAY_MS);
    }

    return { setsProcessed, cardsUpserted };
    },
    { skipIfBusy: true }
  );

  if (isSkippedDbJob(result)) {
    return { setsProcessed: 0, cardsUpserted: 0 };
  }

  return result;
};
