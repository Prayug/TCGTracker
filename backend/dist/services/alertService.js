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
exports.alertService = exports.AlertService = void 0;
const database_1 = require("../db/database");
class AlertService {
    checkPriceAlerts() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log('Checking price alerts...');
                const alerts = yield this.getActiveAlerts();
                if (alerts.length === 0) {
                    console.log('No active alerts to check');
                    return;
                }
                for (const alert of alerts) {
                    yield this.processAlert(alert);
                }
                console.log(`Checked ${alerts.length} price alerts`);
            }
            catch (error) {
                console.error('Error checking price alerts:', error);
            }
        });
    }
    getActiveAlerts() {
        return __awaiter(this, void 0, void 0, function* () {
            const db = (0, database_1.getDb)();
            return new Promise((resolve, reject) => {
                const sql = 'SELECT * FROM price_alerts WHERE isActive = 1';
                db.all(sql, [], (err, rows) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(rows || []);
                    }
                });
            });
        });
    }
    processAlert(alert) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let priceData = null;
                if (alert.productId) {
                    priceData = yield this.getCurrentPrice(alert.productId);
                }
                else if (alert.cardId) {
                    priceData = yield this.getCurrentPriceByCardId(alert.cardId);
                }
                if (!priceData) {
                    console.log(`No price data found for alert ${alert.id}`);
                    return;
                }
                const shouldTrigger = this.shouldTriggerAlert(alert, priceData);
                if (shouldTrigger) {
                    yield this.triggerAlert(alert, priceData);
                }
            }
            catch (error) {
                console.error(`Error processing alert ${alert.id}:`, error);
            }
        });
    }
    getCurrentPrice(productId) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = (0, database_1.getDb)();
            return new Promise((resolve, reject) => {
                const sql = `
        SELECT 
          productId,
          price as currentPrice,
          productName,
          date
        FROM price_history 
        WHERE productId = ? 
        ORDER BY date DESC 
        LIMIT 1
      `;
                db.get(sql, [productId], (err, row) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(row ? {
                            productId: row.productId,
                            currentPrice: row.currentPrice,
                            productName: row.productName
                        } : null);
                    }
                });
            });
        });
    }
    getCurrentPriceByCardId(cardId) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = (0, database_1.getDb)();
            return new Promise((resolve, reject) => {
                const sql = `
        SELECT 
          cardId,
          marketPrice as currentPrice,
          date
        FROM rolling_averages 
        WHERE cardId = ? 
        ORDER BY date DESC 
        LIMIT 1
      `;
                db.get(sql, [cardId], (err, row) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(row ? {
                            productId: 0,
                            cardId: row.cardId,
                            currentPrice: row.currentPrice,
                            productName: cardId
                        } : null);
                    }
                });
            });
        });
    }
    shouldTriggerAlert(alert, priceData) {
        const { currentPrice } = priceData;
        // Check if alert was recently triggered (within last hour)
        if (alert.lastTriggered) {
            const lastTriggeredTime = new Date(alert.lastTriggered).getTime();
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            if (lastTriggeredTime > oneHourAgo) {
                return false; // Don't spam alerts
            }
        }
        switch (alert.alertType) {
            case 'above':
                return currentPrice >= alert.targetPrice;
            case 'below':
                return currentPrice <= alert.targetPrice;
            case 'change_percent':
                if (priceData.previousPrice) {
                    const changePercent = ((currentPrice - priceData.previousPrice) / priceData.previousPrice) * 100;
                    return Math.abs(changePercent) >= alert.threshold;
                }
                return false;
            default:
                return false;
        }
    }
    triggerAlert(alert, priceData) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`🚨 PRICE ALERT TRIGGERED!`);
            console.log(`Alert ID: ${alert.id}`);
            console.log(`Card/Product: ${priceData.productName || priceData.cardId}`);
            console.log(`Current Price: $${priceData.currentPrice.toFixed(2)}`);
            console.log(`Alert Type: ${alert.alertType}`);
            console.log(`Target/Threshold: ${alert.alertType === 'change_percent' ? alert.threshold + '%' : '$' + alert.targetPrice}`);
            // Update last triggered timestamp
            const db = (0, database_1.getDb)();
            const updateSql = 'UPDATE price_alerts SET lastTriggered = datetime("now") WHERE id = ?';
            return new Promise((resolve, reject) => {
                db.run(updateSql, [alert.id], (err) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
            });
            // Here you could add:
            // - Email notifications
            // - Push notifications  
            // - Webhook calls
            // - Discord/Slack notifications
            // etc.
        });
    }
    getAlertHistory() {
        return __awaiter(this, arguments, void 0, function* (days = 7) {
            const db = (0, database_1.getDb)();
            return new Promise((resolve, reject) => {
                const sql = `
        SELECT * FROM price_alerts 
        WHERE lastTriggered IS NOT NULL 
          AND lastTriggered >= datetime('now', '-${days} days')
        ORDER BY lastTriggered DESC
      `;
                db.all(sql, [], (err, rows) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(rows || []);
                    }
                });
            });
        });
    }
}
exports.AlertService = AlertService;
exports.alertService = new AlertService();
