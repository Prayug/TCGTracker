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
exports.PortfolioService = void 0;
const dbAsync_1 = require("../utils/dbAsync");
class PortfolioService {
    constructor(db) {
        this.db = db;
    }
    addToCollection(userId_1, cardId_1, cardName_1) {
        return __awaiter(this, arguments, void 0, function* (userId, cardId, cardName, quantity = 1, purchasePrice, purchaseDate, condition, notes, cardData, clientVaultId) {
            const { lastID } = yield (0, dbAsync_1.runDb)(this.db, `INSERT INTO user_collections
         (user_id, card_id, card_name, quantity, purchase_price, purchase_date, condition, notes, card_data, client_vault_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, card_id, condition) DO UPDATE SET
         quantity = excluded.quantity,
         purchase_price = excluded.purchase_price,
         purchase_date = excluded.purchase_date,
         notes = excluded.notes,
         card_data = excluded.card_data,
         client_vault_id = excluded.client_vault_id,
         updated_at = CURRENT_TIMESTAMP`, [
                userId,
                cardId,
                cardName,
                quantity,
                purchasePrice !== null && purchasePrice !== void 0 ? purchasePrice : null,
                purchaseDate !== null && purchaseDate !== void 0 ? purchaseDate : null,
                condition !== null && condition !== void 0 ? condition : null,
                notes !== null && notes !== void 0 ? notes : null,
                cardData !== null && cardData !== void 0 ? cardData : null,
                clientVaultId !== null && clientVaultId !== void 0 ? clientVaultId : null,
            ]);
            const row = yield this.getItemById(lastID, userId);
            if (!row)
                throw new Error('Failed to load created portfolio item');
            return row;
        });
    }
    getItemById(itemId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return (0, dbAsync_1.getDbRow)(this.db, 'SELECT * FROM user_collections WHERE id = ? AND user_id = ?', [itemId, userId]);
        });
    }
    getCollection(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return (0, dbAsync_1.allDbRows)(this.db, 'SELECT * FROM user_collections WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        });
    }
    syncVault(userId, cards) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            yield (0, dbAsync_1.runDb)(this.db, 'BEGIN IMMEDIATE');
            try {
                yield (0, dbAsync_1.runDb)(this.db, 'DELETE FROM user_collections WHERE user_id = ?', [userId]);
                for (const entry of cards) {
                    const card = entry.card;
                    yield (0, dbAsync_1.runDb)(this.db, `INSERT INTO user_collections
             (user_id, card_id, card_name, quantity, purchase_price, purchase_date, condition, notes, card_data, client_vault_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                        userId,
                        (card === null || card === void 0 ? void 0 : card.id) || entry.id,
                        (card === null || card === void 0 ? void 0 : card.name) || 'Unknown',
                        entry.quantity,
                        entry.purchasePrice,
                        entry.purchaseDate,
                        entry.condition,
                        (_a = entry.notes) !== null && _a !== void 0 ? _a : null,
                        JSON.stringify(entry),
                        entry.id,
                    ]);
                }
                yield (0, dbAsync_1.runDb)(this.db, 'COMMIT');
            }
            catch (error) {
                yield (0, dbAsync_1.runDb)(this.db, 'ROLLBACK');
                throw error;
            }
            return this.getCollection(userId);
        });
    }
    updateItem(itemId, userId, updates) {
        return __awaiter(this, void 0, void 0, function* () {
            const fields = [];
            const values = [];
            Object.entries(updates).forEach(([key, value]) => {
                if (value !== undefined) {
                    fields.push(`${key} = ?`);
                    values.push(value);
                }
            });
            if (fields.length === 0)
                return;
            fields.push('updated_at = CURRENT_TIMESTAMP');
            values.push(itemId, userId);
            yield (0, dbAsync_1.runDb)(this.db, `UPDATE user_collections SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
        });
    }
    removeFromCollection(itemId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield (0, dbAsync_1.runDb)(this.db, 'DELETE FROM user_collections WHERE id = ? AND user_id = ?', [
                itemId,
                userId,
            ]);
        });
    }
    getPortfolioStats(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const collection = yield this.getCollection(userId);
            let totalCards = 0;
            let totalInvestment = 0;
            let totalValue = 0;
            const cardPerformance = [];
            collection.forEach((item) => {
                var _a;
                totalCards += item.quantity;
                const purchasePrice = item.purchase_price || 0;
                totalInvestment += purchasePrice * item.quantity;
                let currentPrice = purchasePrice;
                if (item.card_data) {
                    try {
                        const parsed = JSON.parse(item.card_data);
                        const market = (_a = parsed.card) === null || _a === void 0 ? void 0 : _a.marketPrice;
                        if (market && market > 0)
                            currentPrice = market;
                    }
                    catch (_b) {
                        /* use purchase price */
                    }
                }
                totalValue += currentPrice * item.quantity;
                const gain = (currentPrice - purchasePrice) * item.quantity;
                const gainPercentage = purchasePrice > 0 ? ((currentPrice - purchasePrice) / purchasePrice) * 100 : 0;
                cardPerformance.push({ card_name: item.card_name, gain, gainPercentage });
            });
            const profitLoss = totalValue - totalInvestment;
            const profitLossPercentage = totalInvestment > 0 ? (profitLoss / totalInvestment) * 100 : 0;
            cardPerformance.sort((a, b) => b.gainPercentage - a.gainPercentage);
            return {
                totalCards,
                totalValue,
                totalInvestment,
                profitLoss,
                profitLossPercentage,
                topGainers: cardPerformance.filter((p) => p.gain > 0).slice(0, 5),
                topLosers: cardPerformance
                    .filter((p) => p.gain < 0)
                    .map((p) => ({
                    card_name: p.card_name,
                    loss: Math.abs(p.gain),
                    lossPercentage: Math.abs(p.gainPercentage),
                }))
                    .slice(0, 5),
            };
        });
    }
}
exports.PortfolioService = PortfolioService;
