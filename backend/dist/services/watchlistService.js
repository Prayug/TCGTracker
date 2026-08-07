"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WatchlistService = void 0;
const dbAsync_1 = require("../utils/dbAsync");
class WatchlistService {
    constructor(db) {
        this.db = db;
    }
    async ensureSchema() {
        await (0, dbAsync_1.runDb)(this.db, `CREATE TABLE IF NOT EXISTS user_watchlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        card_id TEXT NOT NULL,
        card_name TEXT NOT NULL,
        game TEXT NOT NULL DEFAULT 'pokemon',
        list_type TEXT NOT NULL CHECK(list_type IN ('watchlist', 'wishlist', 'tracked')),
        priority TEXT,
        target_price REAL,
        notes TEXT,
        card_data TEXT,
        client_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, card_id, list_type, game),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
        await (0, dbAsync_1.runDb)(this.db, 'CREATE INDEX IF NOT EXISTS idx_user_watchlists_user ON user_watchlists(user_id)');
        await (0, dbAsync_1.runDb)(this.db, 'CREATE INDEX IF NOT EXISTS idx_user_watchlists_type ON user_watchlists(list_type)');
    }
    async getForUser(userId, listType) {
        if (listType) {
            return (0, dbAsync_1.allDbRows)(this.db, 'SELECT * FROM user_watchlists WHERE user_id = ? AND list_type = ? ORDER BY updated_at DESC', [userId, listType]);
        }
        return (0, dbAsync_1.allDbRows)(this.db, 'SELECT * FROM user_watchlists WHERE user_id = ? ORDER BY list_type, updated_at DESC', [userId]);
    }
    /**
     * Full-replace sync scoped to the list_types present in `items`.
     * Other list types for the user are left untouched so wishlist/tracked
     * can sync independently.
     */
    async syncForUser(userId, items) {
        var _a, _b, _c, _d;
        const types = [...new Set(items.map((i) => i.listType))];
        await (0, dbAsync_1.runDb)(this.db, 'BEGIN IMMEDIATE');
        try {
            if (types.length === 0) {
                // Empty payload with no types → clear nothing; callers that want a
                // full wipe should send an explicit listType wipe via remove APIs.
            }
            else {
                const placeholders = types.map(() => '?').join(',');
                await (0, dbAsync_1.runDb)(this.db, `DELETE FROM user_watchlists WHERE user_id = ? AND list_type IN (${placeholders})`, [userId, ...types]);
            }
            for (const item of items) {
                await (0, dbAsync_1.runDb)(this.db, `INSERT INTO user_watchlists
             (user_id, card_id, card_name, game, list_type, priority, target_price, notes, card_data, client_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    userId,
                    item.cardId,
                    item.cardName,
                    item.game || 'pokemon',
                    item.listType,
                    (_a = item.priority) !== null && _a !== void 0 ? _a : null,
                    (_c = (_b = item.targetPrice) !== null && _b !== void 0 ? _b : item.initialPrice) !== null && _c !== void 0 ? _c : null,
                    (_d = item.notes) !== null && _d !== void 0 ? _d : null,
                    item.card ? JSON.stringify(item) : null,
                    item.id,
                ]);
            }
            await (0, dbAsync_1.runDb)(this.db, 'COMMIT');
        }
        catch (error) {
            await (0, dbAsync_1.runDb)(this.db, 'ROLLBACK');
            throw error;
        }
        return this.getForUser(userId);
    }
    async upsert(userId, item) {
        var _a, _b, _c, _d;
        await (0, dbAsync_1.runDb)(this.db, `INSERT INTO user_watchlists
         (user_id, card_id, card_name, game, list_type, priority, target_price, notes, card_data, client_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, card_id, list_type, game) DO UPDATE SET
         card_name = excluded.card_name,
         priority = excluded.priority,
         target_price = excluded.target_price,
         notes = excluded.notes,
         card_data = excluded.card_data,
         client_id = excluded.client_id,
         updated_at = CURRENT_TIMESTAMP`, [
            userId,
            item.cardId,
            item.cardName,
            item.game || 'pokemon',
            item.listType,
            (_a = item.priority) !== null && _a !== void 0 ? _a : null,
            (_c = (_b = item.targetPrice) !== null && _b !== void 0 ? _b : item.initialPrice) !== null && _c !== void 0 ? _c : null,
            (_d = item.notes) !== null && _d !== void 0 ? _d : null,
            item.card ? JSON.stringify(item) : null,
            item.id,
        ]);
        const row = await (0, dbAsync_1.getDbRow)(this.db, `SELECT * FROM user_watchlists
       WHERE user_id = ? AND card_id = ? AND list_type = ? AND game = ?`, [userId, item.cardId, item.listType, item.game || 'pokemon']);
        if (!row)
            throw new Error('Failed to upsert watchlist item');
        return row;
    }
    async remove(userId, cardId, listType, game = 'pokemon') {
        await (0, dbAsync_1.runDb)(this.db, 'DELETE FROM user_watchlists WHERE user_id = ? AND card_id = ? AND list_type = ? AND game = ?', [userId, cardId, listType, game]);
    }
    async wipeListTypes(userId, listTypes) {
        if (listTypes.length === 0)
            return;
        const placeholders = listTypes.map(() => '?').join(',');
        await (0, dbAsync_1.runDb)(this.db, `DELETE FROM user_watchlists WHERE user_id = ? AND list_type IN (${placeholders})`, [userId, ...listTypes]);
    }
}
exports.WatchlistService = WatchlistService;
