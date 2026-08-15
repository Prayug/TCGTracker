"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncJapaneseCatalogData = exports.syncCatalogData = exports.upsertJapaneseCatalogCards = void 0;
const database_1 = require("../db/database");
const pokemonCatalogProvider_1 = require("./providers/pokemonCatalogProvider");
const tcgdexJaCatalogProvider_1 = require("./providers/tcgdexJaCatalogProvider");
const logger_1 = require("../utils/logger");
const dbJobLock_1 = require("../utils/dbJobLock");
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
const upsertCards = async (cards, setMeta) => {
    const db = (0, database_1.getDb)();
    if (!cards.length) {
        return 0;
    }
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            var _a;
            db.run('BEGIN TRANSACTION');
            const stmt = db.prepare(upsertCatalogCardSql);
            let upserted = 0;
            try {
                for (const card of cards) {
                    const setReleaseDate = card.setReleaseDate || (setMeta === null || setMeta === void 0 ? void 0 : setMeta.releaseDate) || null;
                    const language = card.language || 'en';
                    const matchName = card.matchName || card.cardName;
                    stmt.run([
                        card.cardId,
                        card.cardName,
                        card.setId || (setMeta === null || setMeta === void 0 ? void 0 : setMeta.id) || '',
                        card.setName || (setMeta === null || setMeta === void 0 ? void 0 : setMeta.name) || '',
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
                        (_a = card.dexId) !== null && _a !== void 0 ? _a : null,
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
            }
            catch (err) {
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
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));
const syncWithProvider = async (provider, label, setLimit, options) => {
    const sets = (options === null || options === void 0 ? void 0 : options.priorityOnly) && provider === tcgdexJaCatalogProvider_1.tcgdexJaCatalogProvider
        ? await tcgdexJaCatalogProvider_1.tcgdexJaCatalogProvider.getPrioritySets(setLimit)
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
                logger_1.logger.debug(`Skipping empty set (${label}): ${set.name}`);
                setsProcessed += 1;
                continue;
            }
            await yieldToEventLoop();
            const inserted = await upsertCards(setCards, set);
            cardsUpserted += inserted;
            setsProcessed += 1;
            logger_1.logger.info(`Catalog sync (${label}): ${set.id} → ${inserted} cards (${setsProcessed}/${sets.length})`);
        }
        catch (error) {
            logger_1.logger.warn(`Failed to sync set (${label}) ${set.name || set.id}`, {
                error: error.message,
            });
        }
        await delay(SET_DELAY_MS);
    }
    return { setsProcessed, cardsUpserted };
};
/** Persist already-fetched JA catalog rows (e.g. live search hits). */
const upsertJapaneseCatalogCards = async (cards) => {
    if (!cards.length)
        return 0;
    return upsertCards(cards);
};
exports.upsertJapaneseCatalogCards = upsertJapaneseCatalogCards;
const syncCatalogData = async (provider = pokemonCatalogProvider_1.pokemonCatalogProvider) => {
    const result = await (0, dbJobLock_1.withDbJobLock)('catalog_sync', async () => {
        const en = await syncWithProvider(provider, 'en', 250);
        let ja = { setsProcessed: 0, cardsUpserted: 0 };
        try {
            ja = await syncWithProvider(tcgdexJaCatalogProvider_1.tcgdexJaCatalogProvider, 'ja', JA_SET_LIMIT, {
                priorityOnly: true,
            });
        }
        catch (error) {
            logger_1.logger.warn('Japanese catalog sync failed', {
                error: error.message,
            });
        }
        logger_1.logger.info('Catalog sync complete', {
            enSets: en.setsProcessed,
            enCards: en.cardsUpserted,
            jaSets: ja.setsProcessed,
            jaCards: ja.cardsUpserted,
        });
        return {
            setsProcessed: en.setsProcessed + ja.setsProcessed,
            cardsUpserted: en.cardsUpserted + ja.cardsUpserted,
        };
    }, { skipIfBusy: true });
    if ((0, dbJobLock_1.isSkippedDbJob)(result)) {
        return { setsProcessed: 0, cardsUpserted: 0 };
    }
    return result;
};
exports.syncCatalogData = syncCatalogData;
/** Sync Japanese catalog only (admin / backfill). Pass priorityOnly:false for every TCGdex JA set. */
const syncJapaneseCatalogData = async (setLimit = JA_SET_LIMIT, options) => {
    // priorityOnly true → bootstrap list; false/large limit → full ranked catalog.
    const resolvedPriority = (options === null || options === void 0 ? void 0 : options.priorityOnly) !== undefined
        ? options.priorityOnly
        : setLimit <= JA_SET_LIMIT;
    const cappedLimit = Math.min(Math.max(setLimit, 1), resolvedPriority ? Math.max(JA_SET_LIMIT, setLimit) : JA_FULL_SET_LIMIT);
    const result = await (0, dbJobLock_1.withDbJobLock)('catalog_sync_ja', async () => syncWithProvider(tcgdexJaCatalogProvider_1.tcgdexJaCatalogProvider, 'ja', cappedLimit, {
        priorityOnly: resolvedPriority,
    }), { skipIfBusy: true });
    if ((0, dbJobLock_1.isSkippedDbJob)(result)) {
        return { setsProcessed: 0, cardsUpserted: 0 };
    }
    return result;
};
exports.syncJapaneseCatalogData = syncJapaneseCatalogData;
