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
const express_1 = require("express");
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const dbAsync_1 = require("../utils/dbAsync");
const onePieceOptcgClient_1 = require("../services/providers/onePieceOptcgClient");
const onePieceCatalogId_1 = require("../services/onePieceCatalogId");
const onePiecePriceResolver_1 = require("../services/onePiecePriceResolver");
const onePieceMapper_1 = require("../services/onePieceMapper");
const router = (0, express_1.Router)();
router.get('/onepiece', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { query, setId, limit = '500' } = req.query;
        if (!query || typeof query !== 'string' || query.trim().length < 2) {
            return res.status(400).json({ error: 'Query parameter with at least 2 characters is required.' });
        }
        const sanitizedQuery = query.trim();
        const normalizedSetId = typeof setId === 'string' && setId.trim().length > 0 ? setId.trim() : undefined;
        const searchLimit = Math.min(Math.max(parseInt(limit, 10) || 500, 1), 3000);
        const allCards = yield (0, onePieceOptcgClient_1.getAllOptcgCards)();
        let matches = allCards.filter((raw) => (0, onePieceMapper_1.cardMatchesQuery)(raw, sanitizedQuery));
        if (normalizedSetId) {
            matches = matches.filter((c) => c.set_id === normalizedSetId || c.set_name.toLowerCase().includes(normalizedSetId.toLowerCase()));
        }
        const apiCards = matches.map((raw) => (0, onePieceMapper_1.mapRawToApiCard)(raw));
        const cards = yield (0, onePiecePriceResolver_1.enrichOnePieceApiCards)(apiCards.slice(0, searchLimit));
        logger_1.logger.info(`One Piece search: ${cards.length}/${apiCards.length} results for "${sanitizedQuery}" (${allCards.length} catalog)`);
        res.json({
            data: cards,
            count: cards.length,
            totalMatches: apiCards.length,
            catalogSize: allCards.length,
            source: 'optcg_full_catalog_tcgplayer_enriched',
        });
    }
    catch (error) {
        logger_1.logger.error('One Piece card search failed:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
}));
router.get('/onepiece/sets', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const liveSets = yield (0, onePieceOptcgClient_1.getOptcgSets)();
        const db = (0, database_1.getDb)();
        const localCounts = yield (0, dbAsync_1.allDbRows)(db, `SELECT setId, COUNT(*) AS cardCount FROM onepiece_catalog GROUP BY setId`);
        const countMap = new Map(localCounts.map((r) => [r.setId, r.cardCount]));
        res.json({
            data: liveSets.map((s) => ({
                id: s.set_id,
                name: s.set_name,
                total: countMap.get(s.set_id),
            })),
            count: liveSets.length,
            source: 'optcg_live',
        });
    }
    catch (error) {
        logger_1.logger.error('One Piece sets fetch failed:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
}));
router.get('/onepiece/stats', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const cards = yield (0, onePieceOptcgClient_1.getAllOptcgCards)();
        res.json({
            totalCards: cards.length,
            sources: {
                note: 'Includes booster sets, starter decks, promos, and Don!! cards from OPTCG bulk endpoints',
            },
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
router.get('/onepiece/card/:catalogId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const catalogId = decodeURIComponent(req.params.catalogId);
        const allCards = yield (0, onePieceOptcgClient_1.getAllOptcgCards)();
        if ((0, onePieceCatalogId_1.isOnePieceCatalogId)(catalogId)) {
            const db = (0, database_1.getDb)();
            const row = yield (0, dbAsync_1.getDbRow)(db, `SELECT
          oc.*,
          latest.marketPrice AS latestMarketPrice,
          latest.inventoryPrice AS latestInventoryPrice
         FROM onepiece_catalog oc
         LEFT JOIN (
           SELECT oph1.catalogId, oph1.marketPrice, oph1.inventoryPrice
           FROM onepiece_price_history oph1
           INNER JOIN (
             SELECT catalogId, MAX(date) AS maxDate
             FROM onepiece_price_history
             GROUP BY catalogId
           ) latest_dates
             ON oph1.catalogId = latest_dates.catalogId AND oph1.date = latest_dates.maxDate
         ) latest ON oc.catalogId = latest.catalogId
         WHERE oc.catalogId = ?`, [catalogId]);
            if (row) {
                const enriched = yield (0, onePiecePriceResolver_1.enrichOnePieceApiCards)([(0, onePieceMapper_1.mapRowToApiCard)(row)]);
                return res.json({ data: enriched[0], source: 'local_database_tcgplayer_enriched' });
            }
            const live = allCards.find((c) => (0, onePieceCatalogId_1.buildOnePieceCatalogId)(c) === catalogId);
            if (live) {
                const enriched = yield (0, onePiecePriceResolver_1.enrichOnePieceApiCards)([(0, onePieceMapper_1.mapRawToApiCard)(live)]);
                return res.json({ data: enriched[0], source: 'optcg_full_catalog_tcgplayer_enriched' });
            }
        }
        const cardSetId = catalogId;
        const db = (0, database_1.getDb)();
        const rows = yield (0, dbAsync_1.allDbRows)(db, `SELECT oc.*,
          latest.marketPrice AS latestMarketPrice,
          latest.inventoryPrice AS latestInventoryPrice
       FROM onepiece_catalog oc
       LEFT JOIN (
         SELECT oph1.catalogId, oph1.marketPrice, oph1.inventoryPrice
         FROM onepiece_price_history oph1
         INNER JOIN (
           SELECT catalogId, MAX(date) AS maxDate FROM onepiece_price_history GROUP BY catalogId
         ) latest_dates ON oph1.catalogId = latest_dates.catalogId AND oph1.date = latest_dates.maxDate
       ) latest ON oc.catalogId = latest.catalogId
       WHERE oc.cardSetId = ?`, [cardSetId]);
        if (rows.length > 0) {
            const sorted = yield (0, onePiecePriceResolver_1.enrichOnePieceApiCards)(rows.map((row) => (0, onePieceMapper_1.mapRowToApiCard)(row)).sort((a, b) => { var _a, _b; return ((_a = b.marketPrice) !== null && _a !== void 0 ? _a : 0) - ((_b = a.marketPrice) !== null && _b !== void 0 ? _b : 0); }));
            return res.json({ data: sorted[0], variants: sorted, source: 'local_database_tcgplayer_enriched' });
        }
        const liveVariants = yield (0, onePiecePriceResolver_1.enrichOnePieceApiCards)(allCards
            .filter((c) => c.card_set_id === cardSetId)
            .map((raw) => (0, onePieceMapper_1.mapRawToApiCard)(raw))
            .sort((a, b) => { var _a, _b; return ((_a = b.marketPrice) !== null && _a !== void 0 ? _a : 0) - ((_b = a.marketPrice) !== null && _b !== void 0 ? _b : 0); }));
        if (!liveVariants.length) {
            return res.status(404).json({ error: 'Card not found', catalogId: cardSetId });
        }
        res.json({
            data: liveVariants[0],
            variants: liveVariants,
            source: 'optcg_full_catalog_tcgplayer_enriched',
        });
    }
    catch (error) {
        logger_1.logger.error(`One Piece card fetch failed for ${req.params.catalogId}:`, error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
}));
router.get('/onepiece/set/:setId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const setId = decodeURIComponent(req.params.setId);
        const rawCards = yield (0, onePieceOptcgClient_1.getOptcgSetCards)(setId);
        const cards = yield (0, onePiecePriceResolver_1.enrichOnePieceApiCards)(rawCards.map((raw) => (0, onePieceMapper_1.mapRawToApiCard)(raw)));
        res.json({
            data: cards,
            count: cards.length,
            source: 'optcg_live_tcgplayer_enriched',
        });
    }
    catch (error) {
        logger_1.logger.error(`One Piece set cards fetch failed for ${req.params.setId}:`, error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
}));
exports.default = router;
