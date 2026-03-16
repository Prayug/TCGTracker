"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertService = void 0;
const logger_1 = require("../utils/logger");
class AlertService {
    constructor(db) {
        this.initialized = false;
        this.db = db;
    }
    async init() {
        if (this.initialized)
            return;
        this.initialized = true;
        const run = (sql) => new Promise((resolve, reject) => {
            this.db.run(sql, (err) => (err ? reject(err) : resolve()));
        });
        await run(`
      CREATE TABLE IF NOT EXISTS price_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        card_id TEXT NOT NULL,
        card_name TEXT NOT NULL,
        target_price REAL NOT NULL,
        condition TEXT CHECK(condition IN ('above', 'below')) NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        triggered_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
        await run(`CREATE INDEX IF NOT EXISTS idx_alerts_user ON price_alerts(user_id)`);
        await run(`CREATE INDEX IF NOT EXISTS idx_alerts_card ON price_alerts(card_id)`);
        await run(`CREATE INDEX IF NOT EXISTS idx_alerts_active ON price_alerts(is_active)`);
    }
    async createAlert(userId, cardId, cardName, targetPrice, condition) {
        return new Promise((resolve, reject) => {
            this.db.run(`INSERT INTO price_alerts (user_id, card_id, card_name, target_price, condition) 
         VALUES (?, ?, ?, ?, ?)`, [userId, cardId, cardName, targetPrice, condition], function (err) {
                if (err)
                    return reject(err);
                const alertId = this.lastID;
                resolve({
                    id: alertId,
                    user_id: userId,
                    card_id: cardId,
                    card_name: cardName,
                    target_price: targetPrice,
                    condition,
                    is_active: true,
                    created_at: new Date().toISOString(),
                });
            });
        });
    }
    async getAlertsByUser(userId) {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM price_alerts WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, rows) => {
                if (err)
                    return reject(err);
                resolve(rows || []);
            });
        });
    }
    async getActiveAlerts() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM price_alerts WHERE is_active = 1', [], (err, rows) => {
                if (err)
                    return reject(err);
                resolve(rows || []);
            });
        });
    }
    async deleteAlert(alertId, userId) {
        return new Promise((resolve, reject) => {
            this.db.run('DELETE FROM price_alerts WHERE id = ? AND user_id = ?', [alertId, userId], (err) => {
                if (err)
                    return reject(err);
                resolve();
            });
        });
    }
    async toggleAlert(alertId, userId, isActive) {
        return new Promise((resolve, reject) => {
            this.db.run('UPDATE price_alerts SET is_active = ? WHERE id = ? AND user_id = ?', [isActive ? 1 : 0, alertId, userId], (err) => {
                if (err)
                    return reject(err);
                resolve();
            });
        });
    }
    async triggerAlert(alertId) {
        return new Promise((resolve, reject) => {
            this.db.run('UPDATE price_alerts SET is_active = 0, triggered_at = CURRENT_TIMESTAMP WHERE id = ?', [alertId], (err) => {
                if (err)
                    return reject(err);
                resolve();
            });
        });
    }
    async checkAlerts(cardId, currentPrice) {
        return new Promise((resolve, reject) => {
            this.db.all(`SELECT * FROM price_alerts 
         WHERE card_id = ? AND is_active = 1 AND (
           (condition = 'above' AND target_price <= ?) OR
           (condition = 'below' AND target_price >= ?)
         )`, [cardId, currentPrice, currentPrice], (err, rows) => {
                if (err)
                    return reject(err);
                // Trigger all matched alerts
                rows.forEach((alert) => {
                    this.triggerAlert(alert.id)
                        .then(() => {
                        logger_1.logger.info('Price alert triggered', {
                            alertId: alert.id,
                            cardId: alert.card_id,
                            targetPrice: alert.target_price,
                            currentPrice,
                        });
                    })
                        .catch((err) => {
                        logger_1.logger.error('Failed to trigger alert', { error: err.message });
                    });
                });
                resolve(rows || []);
            });
        });
    }
}
exports.AlertService = AlertService;
