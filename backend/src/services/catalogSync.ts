import { getDb } from '../db/database';
import { CatalogCardSummary, CatalogProvider, CatalogSetSummary } from './providers/contracts';
import { pokemonCatalogProvider } from './providers/pokemonCatalogProvider';
import { tcgdexJaCatalogProvider } from './providers/tcgdexJaCatalogProvider';
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
    language,
    matchName,
    dexId,
    syncedAt
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
    language = excluded.language,
    matchName = excluded.matchName,
    dexId = excluded.dexId,
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
          const language = card.language || 'en';
          const matchName = card.matchName || card.cardName;
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
            language,
            matchName,
            card.dexId ?? null,
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
/** Cap JA sets per nightly run so sync stays bounded; modern SV sets are prioritized. */
const JA_SET_LIMIT = 40;
/** Full TCGdex JA catalog size is ~180 sets; allow complete backfills. */
const JA_FULL_SET_LIMIT = 250;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

const syncWithProvider = async (
  provider: CatalogProvider,
  label: string,
  setLimit: number,
  options?: { priorityOnly?: boolean }
): Promise<SyncCatalogResult> => {
  const sets =
    options?.priorityOnly && provider === tcgdexJaCatalogProvider
      ? await tcgdexJaCatalogProvider.getPrioritySets(setLimit)
      : await provider.getSets(setLimit);
  let setsProcessed = 0;
  let cardsUpserted = 0;

  for (const set of sets) {
    if (setsProcessed > 0 && setsProcessed % YIELD_EVERY_N_SETS === 0) {
      await yieldToEventLoop();
    }

    try {
      const setCards = await provider.getCardsForSet(set.id);

      if (!setCards.length) {
        logger.debug(`Skipping empty set (${label}): ${set.name}`);
        setsProcessed += 1;
        continue;
      }

      await yieldToEventLoop();

      const inserted = await upsertCards(setCards, set);
      cardsUpserted += inserted;
      setsProcessed += 1;

      logger.info(
        `Catalog sync (${label}): ${set.id} → ${inserted} cards (${setsProcessed}/${sets.length})`
      );
    } catch (error) {
      logger.warn(`Failed to sync set (${label}) ${set.name || set.id}`, {
        error: (error as Error).message,
      });
    }

    await delay(SET_DELAY_MS);
  }

  return { setsProcessed, cardsUpserted };
};

/** Persist already-fetched JA catalog rows (e.g. live search hits). */
export const upsertJapaneseCatalogCards = async (cards: CatalogCardSummary[]): Promise<number> => {
  if (!cards.length) return 0;
  return upsertCards(cards);
};

export const syncCatalogData = async (
  provider: CatalogProvider = pokemonCatalogProvider
): Promise<SyncCatalogResult> => {
  const result = await withDbJobLock(
    'catalog_sync',
    async () => {
      const en = await syncWithProvider(provider, 'en', 250);
      let ja: SyncCatalogResult = { setsProcessed: 0, cardsUpserted: 0 };
      try {
        ja = await syncWithProvider(tcgdexJaCatalogProvider, 'ja', JA_SET_LIMIT, {
          priorityOnly: true,
        });
      } catch (error) {
        logger.warn('Japanese catalog sync failed', {
          error: (error as Error).message,
        });
      }

      logger.info('Catalog sync complete', {
        enSets: en.setsProcessed,
        enCards: en.cardsUpserted,
        jaSets: ja.setsProcessed,
        jaCards: ja.cardsUpserted,
      });

      return {
        setsProcessed: en.setsProcessed + ja.setsProcessed,
        cardsUpserted: en.cardsUpserted + ja.cardsUpserted,
      };
    },
    { skipIfBusy: true }
  );

  if (isSkippedDbJob(result)) {
    return { setsProcessed: 0, cardsUpserted: 0 };
  }

  return result;
};

/** Sync Japanese catalog only (admin / backfill). Pass priorityOnly:false for every TCGdex JA set. */
export const syncJapaneseCatalogData = async (
  setLimit = JA_SET_LIMIT,
  options?: { priorityOnly?: boolean }
): Promise<SyncCatalogResult> => {
  // priorityOnly true → bootstrap list; false/large limit → full ranked catalog.
  const resolvedPriority =
    options?.priorityOnly !== undefined ? options.priorityOnly : setLimit <= JA_SET_LIMIT;

  const cappedLimit = Math.min(
    Math.max(setLimit, 1),
    resolvedPriority ? Math.max(JA_SET_LIMIT, setLimit) : JA_FULL_SET_LIMIT
  );

  const result = await withDbJobLock(
    'catalog_sync_ja',
    async () =>
      syncWithProvider(tcgdexJaCatalogProvider, 'ja', cappedLimit, {
        priorityOnly: resolvedPriority,
      }),
    { skipIfBusy: true }
  );
  if (isSkippedDbJob(result)) {
    return { setsProcessed: 0, cardsUpserted: 0 };
  }
  return result;
};
