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
exports.mapLocalRowsToPokemonCards = exports.getLocalCardsForQuery = void 0;
// Database query utilities for cards
const database_1 = require("../db/database");
const cardImageUtils_1 = require("./cardImageUtils");
const getLocalCardsForQuery = (query_1, setId_1, ...args_1) => __awaiter(void 0, [query_1, setId_1, ...args_1], void 0, function* (query, setId, limit = 250) {
    const db = (0, database_1.getDb)();
    const likeQuery = `%${query}%`;
    const params = [likeQuery];
    let whereClause = 'cm.cardName LIKE ?';
    if (setId) {
        whereClause += ' AND (cm.setId = ? OR cm.setName LIKE ?)';
        params.push(setId, `%${setId}%`);
    }
    const imageColumns = yield (0, cardImageUtils_1.getImageColumnSelectFragment)();
    const sql = `
    SELECT 
      cm.cardId,
      cm.cardName,
      cm.setId,
      cm.setName,
      cm.cardNumber,
      cm.rarity,
      cm.tcgplayerProductId,
      cm.uniqueIdentifier,
      ${imageColumns}
      ph.marketPrice as latestPrice,
      ph.date as priceDate
    FROM card_mappings cm
    LEFT JOIN (
      SELECT uniqueIdentifier, marketPrice, date
      FROM price_history
      WHERE (uniqueIdentifier, date) IN (
        SELECT uniqueIdentifier, MAX(date)
        FROM price_history
        GROUP BY uniqueIdentifier
      )
    ) ph ON cm.uniqueIdentifier = ph.uniqueIdentifier
    WHERE ${whereClause}
    ORDER BY cm.cardName ASC
    LIMIT ?
  `;
    params.push(limit);
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                return reject(err);
            }
            resolve(rows || []);
        });
    });
});
exports.getLocalCardsForQuery = getLocalCardsForQuery;
const mapLocalRowsToPokemonCards = (rows) => __awaiter(void 0, void 0, void 0, function* () {
    return yield Promise.all(rows.map((row) => __awaiter(void 0, void 0, void 0, function* () {
        // PRIORITY ORDER for images:
        // 1. Stored images from database (most reliable)
        // 2. Deterministic Pokemon TCG API URLs
        // No placeholder - only show real images
        let images;
        let imageSource = row.imageSource;
        if (row.imageSmall && row.imageLarge) {
            // Use stored images (best option)
            images = {
                small: row.imageSmall,
                large: row.imageLarge
            };
            imageSource = imageSource || 'stored';
        }
        else {
            // Try deterministic URLs - if not available, return undefined (no image)
            const deterministicImages = yield (0, cardImageUtils_1.buildDeterministicImageUrls)(row.setId, row.cardNumber, row.setName);
            if (deterministicImages) {
                images = deterministicImages;
                imageSource = 'deterministic';
            }
            else {
                // No image available - return undefined
                images = undefined;
                imageSource = undefined;
            }
        }
        return {
            id: row.cardId || `${row.setId}-${row.cardNumber || 'na'}`,
            name: row.cardName,
            number: row.cardNumber,
            rarity: row.rarity,
            set: {
                id: row.setId,
                name: row.setName,
                releaseDate: '2020-01-01',
                total: 100
            },
            images,
            imageSource,
            tcgplayer: row.latestPrice ? {
                productId: row.tcgplayerProductId,
                prices: {
                    normal: { market: row.latestPrice }
                }
            } : undefined,
            marketPrice: row.latestPrice || 0,
            uniqueIdentifier: row.uniqueIdentifier,
            isLocalDbCard: true,
            source: 'local_database'
        };
    })));
});
exports.mapLocalRowsToPokemonCards = mapLocalRowsToPokemonCards;
