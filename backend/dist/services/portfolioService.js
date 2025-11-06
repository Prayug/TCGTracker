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
class PortfolioService {
    constructor(db) {
        this.db = db;
    }
    addToCollection(userId_1, cardId_1, cardName_1) {
        return __awaiter(this, arguments, void 0, function* (userId, cardId, cardName, quantity = 1, purchasePrice, purchaseDate, condition, notes) {
            return new Promise((resolve, reject) => {
                this.db.run(`INSERT INTO user_collections (user_id, card_id, card_name, quantity, purchase_price, purchase_date, condition, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, card_id, condition) DO UPDATE SET
           quantity = quantity + excluded.quantity,
           updated_at = CURRENT_TIMESTAMP`, [userId, cardId, cardName, quantity, purchasePrice, purchaseDate, condition, notes], function (err) {
                    if (err)
                        return reject(err);
                    const itemId = this.lastID;
                    resolve({
                        id: itemId,
                        user_id: userId,
                        card_id: cardId,
                        card_name: cardName,
                        quantity,
                        purchase_price: purchasePrice,
                        purchase_date: purchaseDate,
                        condition,
                        notes,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    });
                });
            });
        });
    }
    getCollection(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.db.all('SELECT * FROM user_collections WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, rows) => {
                    if (err)
                        return reject(err);
                    resolve(rows || []);
                });
            });
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
            return new Promise((resolve, reject) => {
                this.db.run(`UPDATE user_collections SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values, (err) => {
                    if (err)
                        return reject(err);
                    resolve();
                });
            });
        });
    }
    removeFromCollection(itemId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.db.run('DELETE FROM user_collections WHERE id = ? AND user_id = ?', [itemId, userId], (err) => {
                    if (err)
                        return reject(err);
                    resolve();
                });
            });
        });
    }
    getPortfolioStats(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const collection = yield this.getCollection(userId);
                    let totalCards = 0;
                    let totalInvestment = 0;
                    let totalValue = 0; // This would come from current market prices
                    const cardPerformance = [];
                    collection.forEach((item) => {
                        totalCards += item.quantity;
                        if (item.purchase_price) {
                            totalInvestment += item.purchase_price * item.quantity;
                        }
                        // TODO: Fetch current market price for accurate calculation
                        // For now, using mock calculation
                        const currentPrice = item.purchase_price || 0;
                        const purchasePrice = item.purchase_price || 0;
                        const gain = (currentPrice - purchasePrice) * item.quantity;
                        const gainPercentage = purchasePrice > 0 ? ((currentPrice - purchasePrice) / purchasePrice) * 100 : 0;
                        cardPerformance.push({
                            card_name: item.card_name,
                            gain,
                            gainPercentage,
                        });
                    });
                    const profitLoss = totalValue - totalInvestment;
                    const profitLossPercentage = totalInvestment > 0 ? (profitLoss / totalInvestment) * 100 : 0;
                    cardPerformance.sort((a, b) => b.gainPercentage - a.gainPercentage);
                    resolve({
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
                    });
                }
                catch (error) {
                    reject(error);
                }
            }));
        });
    }
}
exports.PortfolioService = PortfolioService;
