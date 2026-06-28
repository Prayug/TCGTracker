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
exports.searchExternalSignals = searchExternalSignals;
exports.getExternalSignalsForCard = getExternalSignalsForCard;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const SIGNAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * External market signals are not yet integrated.
 * Returns cached signals from the database or an empty array.
 *
 * TODO: Implement real signal sources (news RSS, social media sentiment, tournament data).
 * When implemented, populate the external_market_signals table via a separate cron job.
 */
function searchExternalSignals(cardName, setName) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const cached = yield getCachedSignals(cardName, setName);
            if (cached)
                return cached;
            return [];
        }
        catch (err) {
            logger_1.logger.warn(`External signal search failed for ${cardName}:`, err);
            return [];
        }
    });
}
function getCachedSignals(cardName, setName) {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM external_market_signals
       WHERE card_id = ? AND created_at >= datetime('now', '-1 day')
       ORDER BY created_at DESC LIMIT 10`, [`ext|${cardName}|${setName}`], (err, rows) => {
            if (err)
                return reject(err);
            if (!rows || rows.length === 0)
                return resolve(null);
            resolve(rows.map((r) => ({
                sourceUrl: r.source_url,
                sourceType: r.source_type,
                title: r.title,
                summary: r.summary,
                sentiment: r.sentiment_score,
                relevance: r.relevance_score,
                type: r.risk_type || 'unknown',
            })));
        });
    });
}
function getExternalSignalsForCard(cardId) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, database_1.getDb)();
        return new Promise((resolve, reject) => {
            db.all(`SELECT * FROM external_market_signals
       WHERE card_id = ? AND (expires_at IS NULL OR expires_at >= datetime('now'))
       ORDER BY created_at DESC LIMIT 20`, [cardId], (err, rows) => {
                if (err)
                    return reject(err);
                resolve(rows.map((r) => ({
                    sourceUrl: r.source_url,
                    sourceType: r.source_type,
                    title: r.title,
                    summary: r.summary,
                    sentiment: r.sentiment_score,
                    relevance: r.relevance_score,
                    type: r.risk_type || 'unknown',
                })));
            });
        });
    });
}
