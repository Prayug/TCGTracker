"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncCatalogData = void 0;
const database_1 = require("../db/database");
const pokemonCatalogProvider_1 = require("./providers/pokemonCatalogProvider");
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
const upsertCards = (cards, setMeta) => __awaiter(void 0, void 0, void 0, function* () {
    const db = (0, database_1.getDb)();
    if (!cards.length) {
        return 0;
    }
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            const stmt = db.prepare(upsertCatalogCardSql);
            let upserted = 0;
            try {
                for (const card of cards) {
                    const setReleaseDate = card.setReleaseDate || (setMeta === null || setMeta === void 0 ? void 0 : setMeta.releaseDate) || null;
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
});
const syncCatalogData = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (provider = pokemonCatalogProvider_1.pokemonCatalogProvider) {
    const sets = yield provider.getSets(250);
    let setsProcessed = 0;
    let cardsUpserted = 0;
    for (const set of sets) {
        const setCards = yield provider.getCardsForSet(set.id);
        if (!setCards.length) {
            continue;
        }
        const inserted = yield upsertCards(setCards, set);
        cardsUpserted += inserted;
        setsProcessed += 1;
    }
    return { setsProcessed, cardsUpserted };
});
exports.syncCatalogData = syncCatalogData;
