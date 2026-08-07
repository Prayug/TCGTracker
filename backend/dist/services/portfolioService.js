"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PortfolioService = void 0;
const dbAsync_1 = require("../utils/dbAsync");
const canonicalPriceService_1 = require("./canonicalPriceService");
class PortfolioService {
    constructor(db) {
        this.db = db;
    }
    async addToCollection(userId, cardId, cardName, quantity = 1, purchasePrice, purchaseDate, condition, notes, cardData, clientVaultId) {
        const { lastID } = await (0, dbAsync_1.runDb)(this.db, `INSERT INTO user_collections
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
        // Mirror open lot for P&L tracking (idempotent-ish: one open lot per collection upsert).
        if (purchasePrice != null && purchasePrice >= 0) {
            await this.ensureOpenLot(userId, lastID, cardId, cardName, quantity, purchasePrice, purchaseDate, condition);
        }
        const row = await this.getItemById(lastID, userId);
        if (!row)
            throw new Error('Failed to load created portfolio item');
        return row;
    }
    async ensureOpenLot(userId, collectionId, cardId, cardName, quantity, costBasis, acquiredAt, condition) {
        const existing = await (0, dbAsync_1.getDbRow)(this.db, `SELECT id FROM portfolio_lots
       WHERE user_id = ? AND collection_id = ? AND sold_at IS NULL
       LIMIT 1`, [userId, collectionId]);
        if (existing) {
            await (0, dbAsync_1.runDb)(this.db, `UPDATE portfolio_lots
         SET quantity = ?, cost_basis = ?, acquired_at = ?, condition = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`, [quantity, costBasis, acquiredAt !== null && acquiredAt !== void 0 ? acquiredAt : null, condition !== null && condition !== void 0 ? condition : null, existing.id]);
            return;
        }
        await (0, dbAsync_1.runDb)(this.db, `INSERT INTO portfolio_lots
         (user_id, collection_id, card_id, card_name, quantity, cost_basis, acquired_at, condition)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [userId, collectionId, cardId, cardName, quantity, costBasis, acquiredAt !== null && acquiredAt !== void 0 ? acquiredAt : null, condition !== null && condition !== void 0 ? condition : null]);
    }
    async getItemById(itemId, userId) {
        return (0, dbAsync_1.getDbRow)(this.db, 'SELECT * FROM user_collections WHERE id = ? AND user_id = ?', [itemId, userId]);
    }
    async getCollection(userId) {
        return (0, dbAsync_1.allDbRows)(this.db, 'SELECT * FROM user_collections WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    }
    async getLots(userId, openOnly = false) {
        const sql = openOnly
            ? 'SELECT * FROM portfolio_lots WHERE user_id = ? AND sold_at IS NULL ORDER BY acquired_at DESC'
            : 'SELECT * FROM portfolio_lots WHERE user_id = ? ORDER BY acquired_at DESC';
        return (0, dbAsync_1.allDbRows)(this.db, sql, [userId]);
    }
    async closeLot(userId, lotId, salePrice, soldAt) {
        const lot = await (0, dbAsync_1.getDbRow)(this.db, 'SELECT * FROM portfolio_lots WHERE id = ? AND user_id = ?', [lotId, userId]);
        if (!lot)
            return undefined;
        const realized = (salePrice - lot.cost_basis) * lot.quantity;
        await (0, dbAsync_1.runDb)(this.db, `UPDATE portfolio_lots
       SET sold_at = ?, sale_price = ?, realized_pnl = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`, [soldAt !== null && soldAt !== void 0 ? soldAt : new Date().toISOString().slice(0, 10), salePrice, realized, lotId, userId]);
        return (0, dbAsync_1.getDbRow)(this.db, 'SELECT * FROM portfolio_lots WHERE id = ? AND user_id = ?', [lotId, userId]);
    }
    async syncVault(userId, cards) {
        var _a, _b;
        await (0, dbAsync_1.runDb)(this.db, 'BEGIN IMMEDIATE');
        try {
            await (0, dbAsync_1.runDb)(this.db, 'DELETE FROM portfolio_lots WHERE user_id = ? AND sold_at IS NULL', [
                userId,
            ]);
            await (0, dbAsync_1.runDb)(this.db, 'DELETE FROM user_collections WHERE user_id = ?', [userId]);
            // Merge duplicate catalog card + condition rows so UNIQUE(user_id, card_id, condition) cannot fail.
            const merged = new Map();
            for (const entry of cards) {
                const card = entry.card;
                const cardId = (card === null || card === void 0 ? void 0 : card.id) || entry.id;
                const key = `${cardId}::${entry.condition || 'raw'}`;
                const existing = merged.get(key);
                if (!existing) {
                    merged.set(key, { ...entry, quantity: entry.quantity });
                    continue;
                }
                existing.quantity += entry.quantity;
                if ((entry.purchasePrice || 0) > 0 && !(existing.purchasePrice > 0)) {
                    existing.purchasePrice = entry.purchasePrice;
                    existing.purchaseDate = entry.purchaseDate;
                }
            }
            for (const entry of merged.values()) {
                const card = entry.card;
                const { lastID } = await (0, dbAsync_1.runDb)(this.db, `INSERT INTO user_collections
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
                await (0, dbAsync_1.runDb)(this.db, `INSERT INTO portfolio_lots
             (user_id, collection_id, card_id, card_name, quantity, cost_basis, acquired_at, condition, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    userId,
                    lastID,
                    (card === null || card === void 0 ? void 0 : card.id) || entry.id,
                    (card === null || card === void 0 ? void 0 : card.name) || 'Unknown',
                    entry.quantity,
                    entry.purchasePrice,
                    entry.purchaseDate,
                    entry.condition,
                    (_b = entry.notes) !== null && _b !== void 0 ? _b : null,
                ]);
            }
            await (0, dbAsync_1.runDb)(this.db, 'COMMIT');
        }
        catch (error) {
            await (0, dbAsync_1.runDb)(this.db, 'ROLLBACK');
            throw error;
        }
        return this.getCollection(userId);
    }
    async updateItem(itemId, userId, updates) {
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
        await (0, dbAsync_1.runDb)(this.db, `UPDATE user_collections SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
    }
    async removeFromCollection(itemId, userId) {
        await (0, dbAsync_1.runDb)(this.db, 'DELETE FROM portfolio_lots WHERE collection_id = ? AND user_id = ?', [
            itemId,
            userId,
        ]);
        await (0, dbAsync_1.runDb)(this.db, 'DELETE FROM user_collections WHERE id = ? AND user_id = ?', [
            itemId,
            userId,
        ]);
    }
    async resolveMarketPrice(item) {
        var _a;
        // Prefer live canonical series over stale vault snapshot.
        try {
            const canonical = await (0, canonicalPriceService_1.getLatestCanonicalPriceByCardId)(item.card_id);
            if (canonical && canonical.price > 0) {
                return { price: canonical.price, source: 'canonical' };
            }
        }
        catch (_b) {
            /* fall through */
        }
        if (item.card_data) {
            try {
                const parsed = JSON.parse(item.card_data);
                const market = (_a = parsed.card) === null || _a === void 0 ? void 0 : _a.marketPrice;
                if (market && market > 0)
                    return { price: market, source: 'snapshot' };
            }
            catch (_c) {
                /* fall through */
            }
        }
        return { price: item.purchase_price || 0, source: 'cost' };
    }
    async getPortfolioStats(userId) {
        var _a, _b, _c;
        const collection = await this.getCollection(userId);
        const closedLots = await (0, dbAsync_1.allDbRows)(this.db, 'SELECT * FROM portfolio_lots WHERE user_id = ? AND sold_at IS NOT NULL', [userId]);
        let totalCards = 0;
        let totalInvestment = 0;
        let totalValue = 0;
        let unrealizedPnl = 0;
        const holdings = [];
        const setValues = new Map();
        for (const item of collection) {
            totalCards += item.quantity;
            const purchasePrice = item.purchase_price || 0;
            totalInvestment += purchasePrice * item.quantity;
            const { price: currentPrice, source } = await this.resolveMarketPrice(item);
            const marketValue = currentPrice * item.quantity;
            totalValue += marketValue;
            const unrealized = (currentPrice - purchasePrice) * item.quantity;
            unrealizedPnl += unrealized;
            holdings.push({
                card_id: item.card_id,
                card_name: item.card_name,
                quantity: item.quantity,
                costBasis: purchasePrice,
                marketPrice: currentPrice,
                marketValue,
                unrealizedPnl: unrealized,
                unrealizedPnlPct: purchasePrice > 0 ? ((currentPrice - purchasePrice) / purchasePrice) * 100 : 0,
                priceSource: source,
            });
            let setName = 'Unknown';
            if (item.card_data) {
                try {
                    const parsed = JSON.parse(item.card_data);
                    setName =
                        ((_b = (_a = parsed.card) === null || _a === void 0 ? void 0 : _a.set) === null || _b === void 0 ? void 0 : _b.name) ||
                            ((_c = parsed.card) === null || _c === void 0 ? void 0 : _c.setName) ||
                            'Unknown';
                }
                catch (_d) {
                    /* keep Unknown */
                }
            }
            setValues.set(setName, (setValues.get(setName) || 0) + marketValue);
        }
        const realizedPnl = closedLots.reduce((sum, lot) => sum + (lot.realized_pnl || 0), 0);
        const profitLoss = totalValue - totalInvestment;
        const profitLossPercentage = totalInvestment > 0 ? (profitLoss / totalInvestment) * 100 : 0;
        const sorted = [...holdings].sort((a, b) => b.unrealizedPnlPct - a.unrealizedPnlPct);
        const allocationBySet = [...setValues.entries()]
            .map(([setName, value]) => ({
            setName,
            value,
            pct: totalValue > 0 ? (value / totalValue) * 100 : 0,
        }))
            .sort((a, b) => b.value - a.value);
        return {
            totalCards,
            totalValue,
            totalInvestment,
            profitLoss,
            profitLossPercentage,
            realizedPnl,
            unrealizedPnl,
            holdings,
            topGainers: sorted
                .filter((p) => p.unrealizedPnl > 0)
                .slice(0, 5)
                .map((p) => ({
                card_name: p.card_name,
                gain: p.unrealizedPnl,
                gainPercentage: p.unrealizedPnlPct,
            })),
            topLosers: sorted
                .filter((p) => p.unrealizedPnl < 0)
                .slice(-5)
                .reverse()
                .map((p) => ({
                card_name: p.card_name,
                loss: Math.abs(p.unrealizedPnl),
                lossPercentage: Math.abs(p.unrealizedPnlPct),
            })),
            allocationBySet,
        };
    }
}
exports.PortfolioService = PortfolioService;
