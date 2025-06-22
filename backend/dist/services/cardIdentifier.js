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
exports.updateRollingAveragesWithIdentifier = exports.updatePriceHistoryWithIdentifier = exports.getCardRollingAverages = exports.getCardPriceHistory = exports.findCardByDetails = exports.findCardByIdentifier = exports.storeCardMapping = exports.generateUniqueIdentifier = void 0;
const database_1 = require("../db/database");
/**
 * Generates a unique identifier for a card based on its properties
 * Format: setId|cardNumber|cardName (normalized)
 */
const generateUniqueIdentifier = (setId, cardNumber, cardName) => {
    const normalizedName = cardName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedSetId = setId.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedCardNumber = cardNumber ? cardNumber.replace(/[^a-z0-9]/g, '') : '';
    return `${normalizedSetId}|${normalizedCardNumber}|${normalizedName}`;
};
exports.generateUniqueIdentifier = generateUniqueIdentifier;
/**
 * Stores or updates card mapping information
 */
const storeCardMapping = (cardData) => __awaiter(void 0, void 0, void 0, function* () {
    const db = (0, database_1.getDb)();
    const uniqueIdentifier = (0, exports.generateUniqueIdentifier)(cardData.setId, cardData.cardNumber, cardData.cardName);
    return new Promise((resolve, reject) => {
        const sql = `
      INSERT OR REPLACE INTO card_mappings 
      (cardId, productId, cardName, setId, setName, cardNumber, rarity, tcgplayerProductId, uniqueIdentifier, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `;
        db.run(sql, [
            cardData.cardId,
            cardData.productId || null,
            cardData.cardName,
            cardData.setId,
            cardData.setName,
            cardData.cardNumber || null,
            cardData.rarity || null,
            cardData.tcgplayerProductId || null,
            uniqueIdentifier
        ], function (err) {
            if (err) {
                reject(err);
            }
            else {
                resolve(uniqueIdentifier);
            }
        });
    });
});
exports.storeCardMapping = storeCardMapping;
/**
 * Finds card mapping by unique identifier
 */
const findCardByIdentifier = (uniqueIdentifier) => __awaiter(void 0, void 0, void 0, function* () {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        const sql = 'SELECT * FROM card_mappings WHERE uniqueIdentifier = ?';
        db.get(sql, [uniqueIdentifier], (err, row) => {
            if (err) {
                reject(err);
            }
            else if (row) {
                resolve({
                    cardId: row.cardId,
                    productId: row.productId,
                    cardName: row.cardName,
                    setId: row.setId,
                    setName: row.setName,
                    cardNumber: row.cardNumber,
                    rarity: row.rarity,
                    tcgplayerProductId: row.tcgplayerProductId,
                    uniqueIdentifier: row.uniqueIdentifier
                });
            }
            else {
                resolve(null);
            }
        });
    });
});
exports.findCardByIdentifier = findCardByIdentifier;
/**
 * Finds card mapping by card name, set, and optional card number
 */
const findCardByDetails = (cardName, setId, cardNumber) => __awaiter(void 0, void 0, void 0, function* () {
    const uniqueIdentifier = (0, exports.generateUniqueIdentifier)(setId, cardNumber, cardName);
    return (0, exports.findCardByIdentifier)(uniqueIdentifier);
});
exports.findCardByDetails = findCardByDetails;
/**
 * Gets all price history for a specific card using its unique identifier
 */
const getCardPriceHistory = (uniqueIdentifier) => __awaiter(void 0, void 0, void 0, function* () {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        const sql = `
      SELECT * FROM price_history 
      WHERE uniqueIdentifier = ? 
      ORDER BY date ASC
    `;
        db.all(sql, [uniqueIdentifier], (err, rows) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(rows || []);
            }
        });
    });
});
exports.getCardPriceHistory = getCardPriceHistory;
/**
 * Gets rolling averages for a specific card using its unique identifier
 */
const getCardRollingAverages = (uniqueIdentifier) => __awaiter(void 0, void 0, void 0, function* () {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        const sql = `
      SELECT * FROM rolling_averages 
      WHERE uniqueIdentifier = ? 
      ORDER BY date ASC
    `;
        db.all(sql, [uniqueIdentifier], (err, rows) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(rows || []);
            }
        });
    });
});
exports.getCardRollingAverages = getCardRollingAverages;
/**
 * Updates price history with unique identifier
 */
const updatePriceHistoryWithIdentifier = (productId, uniqueIdentifier) => __awaiter(void 0, void 0, void 0, function* () {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        const sql = 'UPDATE price_history SET uniqueIdentifier = ? WHERE productId = ?';
        db.run(sql, [uniqueIdentifier, productId], (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
});
exports.updatePriceHistoryWithIdentifier = updatePriceHistoryWithIdentifier;
/**
 * Updates rolling averages with unique identifier
 */
const updateRollingAveragesWithIdentifier = (cardId, uniqueIdentifier) => __awaiter(void 0, void 0, void 0, function* () {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        const sql = 'UPDATE rolling_averages SET uniqueIdentifier = ? WHERE cardId = ?';
        db.run(sql, [uniqueIdentifier, cardId], (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
});
exports.updateRollingAveragesWithIdentifier = updateRollingAveragesWithIdentifier;
