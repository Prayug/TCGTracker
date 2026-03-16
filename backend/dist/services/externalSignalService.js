"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchExternalSignals = searchExternalSignals;
exports.getExternalSignalsForCard = getExternalSignalsForCard;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
function mapRow(r) {
    var _a;
    return {
        sourceUrl: r.source_url,
        sourceType: r.source_type,
        title: r.title,
        summary: r.summary,
        sentiment: r.sentiment_score,
        relevance: r.relevance_score,
        type: r.risk_type || 'unknown',
        createdAt: r.created_at,
        expiresAt: (_a = r.expires_at) !== null && _a !== void 0 ? _a : null,
    };
}
/**
 * Finds active external market signals relevant to a card. Signals are
 * populated by the scraper pipeline (see services/scrapers/) and matched by:
 *  - resolved card_id (via card_mappings/catalog_cards),
 *  - mentioned card name, or
 *  - set-level signals (e.g. upcoming set releases) matching the card's set.
 */
async function searchExternalSignals(cardName, setName) {
    const db = (0, database_1.getDb)();
    try {
        return await new Promise((resolve, reject) => {
            db.all(`SELECT * FROM external_market_signals
         WHERE (expires_at IS NULL OR expires_at >= datetime('now'))
           AND (
             (card_name IS NOT NULL AND (
               LOWER(card_name) = LOWER(?) OR LOWER(?) LIKE LOWER(card_name) || '%'
             ))
             OR (card_name IS NULL AND card_id IS NULL AND set_name IS NOT NULL
                 AND LOWER(set_name) = LOWER(?))
           )
         ORDER BY relevance_score DESC, created_at DESC
         LIMIT 10`, [cardName, cardName, setName], (err, rows) => {
                if (err)
                    return reject(err);
                resolve((rows || []).map(mapRow));
            });
        });
    }
    catch (err) {
        logger_1.logger.warn(`External signal search failed for ${cardName}:`, err);
        return [];
    }
}
async function getExternalSignalsForCard(cardId) {
    const db = (0, database_1.getDb)();
    // Resolve the card's name/set so name-matched and set-level signals are included.
    const cardInfo = await new Promise((resolve) => {
        db.get(`SELECT cardName, setName FROM card_mappings WHERE cardId = ? LIMIT 1`, [cardId], (err, row) => {
            if (err || !row)
                return resolve({});
            resolve({ cardName: row.cardName, setName: row.setName });
        });
    });
    return new Promise((resolve, reject) => {
        var _a, _b;
        db.all(`SELECT * FROM external_market_signals
       WHERE (expires_at IS NULL OR expires_at >= datetime('now'))
         AND (
           card_id = ?
           OR (card_name IS NOT NULL AND LOWER(card_name) = LOWER(?))
           OR (card_name IS NULL AND card_id IS NULL AND set_name IS NOT NULL
               AND LOWER(set_name) = LOWER(?))
         )
       ORDER BY relevance_score DESC, created_at DESC
       LIMIT 20`, [cardId, (_a = cardInfo.cardName) !== null && _a !== void 0 ? _a : '', (_b = cardInfo.setName) !== null && _b !== void 0 ? _b : ''], (err, rows) => {
            if (err)
                return reject(err);
            resolve((rows || []).map(mapRow));
        });
    });
}
