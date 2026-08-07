"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertService = void 0;
const logger_1 = require("../utils/logger");
const emailService_1 = require("./emailService");
class AlertService {
    constructor(db) {
        this.initialized = false;
        this.db = db;
    }
    async init() {
        if (this.initialized)
            return;
        this.initialized = true;
        // Schema is owned by migrations — only ensure indexes exist.
        const run = (sql) => new Promise((resolve, reject) => {
            this.db.run(sql, (err) => (err ? reject(err) : resolve()));
        });
        await run(`CREATE INDEX IF NOT EXISTS idx_alerts_user ON price_alerts(user_id)`);
        await run(`CREATE INDEX IF NOT EXISTS idx_alerts_card ON price_alerts(card_id)`);
        await run(`CREATE INDEX IF NOT EXISTS idx_alerts_active ON price_alerts(is_active)`);
    }
    async createAlert(userId, cardId, cardName, targetPrice, condition, extras) {
        var _a;
        const alertType = (_a = extras === null || extras === void 0 ? void 0 : extras.alertType) !== null && _a !== void 0 ? _a : 'price_threshold';
        return new Promise((resolve, reject) => {
            var _a, _b;
            this.db.run(`INSERT INTO price_alerts
           (user_id, card_id, card_name, target_price, condition, alert_type, threshold_pct, baseline_price, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                userId,
                cardId,
                cardName,
                targetPrice !== null && targetPrice !== void 0 ? targetPrice : 0,
                condition !== null && condition !== void 0 ? condition : 'above',
                alertType,
                (_a = extras === null || extras === void 0 ? void 0 : extras.thresholdPct) !== null && _a !== void 0 ? _a : null,
                (_b = extras === null || extras === void 0 ? void 0 : extras.baselinePrice) !== null && _b !== void 0 ? _b : null,
                (extras === null || extras === void 0 ? void 0 : extras.metadata) ? JSON.stringify(extras.metadata) : null,
            ], function (err) {
                var _a, _b;
                if (err)
                    return reject(err);
                resolve({
                    id: this.lastID,
                    user_id: userId,
                    card_id: cardId,
                    card_name: cardName,
                    target_price: targetPrice !== null && targetPrice !== void 0 ? targetPrice : 0,
                    condition: condition !== null && condition !== void 0 ? condition : 'above',
                    alert_type: alertType,
                    threshold_pct: (_a = extras === null || extras === void 0 ? void 0 : extras.thresholdPct) !== null && _a !== void 0 ? _a : null,
                    baseline_price: (_b = extras === null || extras === void 0 ? void 0 : extras.baselinePrice) !== null && _b !== void 0 ? _b : null,
                    metadata_json: (extras === null || extras === void 0 ? void 0 : extras.metadata) ? JSON.stringify(extras.metadata) : null,
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
    async getUserEmail(userId) {
        return new Promise((resolve) => {
            this.db.get('SELECT email FROM users WHERE id = ?', [userId], (err, row) => {
                if (err || !(row === null || row === void 0 ? void 0 : row.email))
                    return resolve(null);
                resolve(row.email);
            });
        });
    }
    /** Best-effort email; never throws — in-app alerts must keep working. */
    async notifyAlertEmail(alert, extra) {
        if (!(0, emailService_1.isEmailConfigured)())
            return;
        try {
            const email = await this.getUserEmail(alert.user_id);
            if (!email)
                return;
            const { subject, text } = (0, emailService_1.formatAlertEmail)(alert);
            const body = (extra === null || extra === void 0 ? void 0 : extra.currentPrice) != null
                ? `${text}\n\nCurrent price: $${Number(extra.currentPrice).toFixed(2)}`
                : text;
            await (0, emailService_1.sendEmail)({ to: email, subject, text: body });
        }
        catch (err) {
            logger_1.logger.warn('Alert email notification failed', {
                alertId: alert.id,
                error: (err === null || err === void 0 ? void 0 : err.message) || String(err),
            });
        }
    }
    /** Classic absolute price threshold alerts. */
    async checkAlerts(cardId, currentPrice) {
        return new Promise((resolve, reject) => {
            this.db.all(`SELECT * FROM price_alerts
         WHERE card_id = ? AND is_active = 1
           AND (alert_type IS NULL OR alert_type = 'price_threshold')
           AND (
             (condition = 'above' AND target_price <= ?) OR
             (condition = 'below' AND target_price >= ?)
           )`, [cardId, currentPrice, currentPrice], (err, rows) => {
                if (err)
                    return reject(err);
                (rows || []).forEach((alert) => {
                    this.triggerAlert(alert.id)
                        .then(() => {
                        logger_1.logger.info('Price alert triggered', {
                            alertId: alert.id,
                            cardId: alert.card_id,
                            targetPrice: alert.target_price,
                            currentPrice,
                        });
                        void this.notifyAlertEmail(alert, { currentPrice });
                    })
                        .catch((triggerErr) => {
                        logger_1.logger.error('Failed to trigger alert', { error: triggerErr.message });
                    });
                });
                resolve(rows || []);
            });
        });
    }
    /**
     * Evaluate richer alert types against a market snapshot.
     * Call from the daily price cron after prices update.
     */
    async evaluateSmartAlerts(snapshot) {
        var _a;
        const alerts = await new Promise((resolve, reject) => {
            this.db.all(`SELECT * FROM price_alerts
         WHERE card_id = ? AND is_active = 1
           AND alert_type IN ('percent_change', 'volume_drop', 'category_change', 'graded_premium')`, [snapshot.cardId], (err, rows) => (err ? reject(err) : resolve(rows || [])));
        });
        const triggered = [];
        for (const alert of alerts) {
            let hit = false;
            const pct = (_a = alert.threshold_pct) !== null && _a !== void 0 ? _a : 0;
            if (alert.alert_type === 'percent_change' && snapshot.priorPrice && snapshot.priorPrice > 0) {
                const changePct = ((snapshot.currentPrice - snapshot.priorPrice) / snapshot.priorPrice) * 100;
                if (alert.condition === 'above' && changePct >= pct)
                    hit = true;
                if (alert.condition === 'below' && changePct <= -Math.abs(pct))
                    hit = true;
            }
            if (alert.alert_type === 'volume_drop' &&
                snapshot.volume != null &&
                snapshot.priorVolume != null &&
                snapshot.priorVolume > 0) {
                const dropPct = ((snapshot.priorVolume - snapshot.volume) / snapshot.priorVolume) * 100;
                if (dropPct >= Math.abs(pct || 50))
                    hit = true;
            }
            if (alert.alert_type === 'category_change' &&
                snapshot.category &&
                snapshot.priorCategory &&
                snapshot.category !== snapshot.priorCategory) {
                hit = true;
            }
            if (alert.alert_type === 'graded_premium' &&
                snapshot.gradedPremiumPct != null &&
                snapshot.gradedPremiumPct >= (pct || 100)) {
                hit = true;
            }
            if (hit) {
                await this.triggerAlert(alert.id);
                triggered.push(alert);
                logger_1.logger.info('Smart alert triggered', {
                    alertId: alert.id,
                    type: alert.alert_type,
                    cardId: snapshot.cardId,
                });
                void this.notifyAlertEmail(alert, { currentPrice: snapshot.currentPrice });
            }
        }
        return triggered;
    }
    /**
     * Minimal post-price-update sweep: for each card with active smart alerts,
     * load latest + prior day prices from price_history and evaluate.
     */
    async evaluateAllSmartAlertsFromPrices() {
        var _a, _b, _c, _d, _e;
        const cardIds = await new Promise((resolve, reject) => {
            this.db.all(`SELECT DISTINCT card_id AS cardId FROM price_alerts
         WHERE is_active = 1
           AND alert_type IN ('percent_change', 'volume_drop', 'category_change', 'graded_premium')`, [], (err, rows) => err ? reject(err) : resolve((rows || []).map((r) => r.cardId)));
        });
        let triggeredCount = 0;
        for (const cardId of cardIds) {
            const prices = await new Promise((resolve, reject) => {
                this.db.all(`SELECT COALESCE(ph.marketPrice, ph.price) AS price, ph.volume, ph.date
           FROM price_history ph
           INNER JOIN card_mappings cm ON cm.uniqueIdentifier = ph.uniqueIdentifier
           WHERE cm.cardId = ? AND COALESCE(ph.marketPrice, ph.price) > 0
           ORDER BY ph.date DESC
           LIMIT 2`, [cardId], (err, rows) => (err ? reject(err) : resolve(rows || [])));
            });
            if (!prices.length || !(prices[0].price > 0))
                continue;
            const triggered = await this.evaluateSmartAlerts({
                cardId,
                currentPrice: prices[0].price,
                priorPrice: (_b = (_a = prices[1]) === null || _a === void 0 ? void 0 : _a.price) !== null && _b !== void 0 ? _b : null,
                volume: (_c = prices[0].volume) !== null && _c !== void 0 ? _c : null,
                priorVolume: (_e = (_d = prices[1]) === null || _d === void 0 ? void 0 : _d.volume) !== null && _e !== void 0 ? _e : null,
            });
            triggeredCount += triggered.length;
        }
        return triggeredCount;
    }
}
exports.AlertService = AlertService;
