"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listTradesForUser = listTradesForUser;
exports.getTradeByShareToken = getTradeByShareToken;
exports.upsertTrade = upsertTrade;
exports.deleteTrade = deleteTrade;
exports.toClientTrade = toClientTrade;
const crypto_1 = require("crypto");
const database_1 = require("../db/database");
const run = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().run(sql, params, (err) => (err ? reject(err) : resolve()));
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
});
const all = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().all(sql, params, (err, rows) => (err ? reject(err) : resolve((rows || []))));
});
function newShareToken() {
    return (0, crypto_1.randomBytes)(9).toString('base64url');
}
function rowToRecord(row) {
    return {
        id: row.id,
        userId: row.user_id,
        shareToken: row.share_token,
        title: row.title,
        game: row.game,
        payload: JSON.parse(row.payload_json),
        giveTotal: row.give_total,
        getTotal: row.get_total,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
async function listTradesForUser(userId) {
    const rows = await all(`SELECT * FROM trades WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`, [userId]);
    return rows.map(rowToRecord);
}
async function getTradeByShareToken(token) {
    const row = await get(`SELECT * FROM trades WHERE share_token = ?`, [token]);
    return row ? rowToRecord(row) : null;
}
async function upsertTrade(input) {
    const title = (input.title || input.payload.t || '').slice(0, 120);
    if (input.id) {
        const existing = await get(`SELECT * FROM trades WHERE id = ? AND user_id = ?`, [
            input.id,
            input.userId,
        ]);
        if (existing) {
            await run(`UPDATE trades
         SET title = ?, game = ?, payload_json = ?, give_total = ?, get_total = ?, updated_at = datetime('now')
         WHERE id = ? AND user_id = ?`, [
                title,
                input.game,
                JSON.stringify(input.payload),
                input.giveTotal,
                input.getTotal,
                input.id,
                input.userId,
            ]);
            const updated = await get(`SELECT * FROM trades WHERE id = ?`, [input.id]);
            return rowToRecord(updated);
        }
    }
    const id = input.id || (0, crypto_1.randomBytes)(16).toString('hex');
    const shareToken = newShareToken();
    await run(`INSERT INTO trades (id, user_id, share_token, title, game, payload_json, give_total, get_total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, input.userId, shareToken, title, input.game, JSON.stringify(input.payload), input.giveTotal, input.getTotal]);
    const created = await get(`SELECT * FROM trades WHERE id = ?`, [id]);
    return rowToRecord(created);
}
async function deleteTrade(userId, id) {
    const existing = await get(`SELECT id FROM trades WHERE id = ? AND user_id = ?`, [
        id,
        userId,
    ]);
    if (!existing)
        return false;
    await run(`DELETE FROM trades WHERE id = ? AND user_id = ?`, [id, userId]);
    return true;
}
function toClientTrade(record) {
    return {
        id: record.id,
        shareToken: record.shareToken,
        title: record.title,
        game: record.game,
        payload: record.payload,
        giveTotal: record.giveTotal,
        getTotal: record.getTotal,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}
