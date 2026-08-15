"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../../db/database");
const logger_1 = require("../../utils/logger");
const setCodeService_1 = require("../../services/setCodeService");
const router = (0, express_1.Router)();
/**
 * Get all unique sets from local database, enriched with era, series, and logos
 */
router.get('/sets', async (_req, res) => {
    try {
        const { getEnrichedSets } = await Promise.resolve().then(() => __importStar(require('../../services/setListService')));
        const sets = await getEnrichedSets();
        res.json({
            data: sets,
            count: sets.length,
            source: 'catalog_sync_enriched',
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching sets:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});
/**
 * Get card statistics
 */
router.get('/stats', async (_req, res) => {
    try {
        const db = (0, database_1.getDb)();
        const sql = `
      SELECT 
        COUNT(DISTINCT cardName) as totalCards,
        COUNT(DISTINCT setId) as totalSets,
        COUNT(*) as totalEntries
      FROM card_mappings
    `;
        db.get(sql, [], (err, row) => {
            if (err) {
                logger_1.logger.error('Error fetching stats:', err);
                return res.status(500).json({
                    error: 'Database error',
                    message: err.message
                });
            }
            res.json({
                totalCards: row.totalCards || 0,
                totalSets: row.totalSets || 0,
                totalEntries: row.totalEntries || 0,
                source: 'local_database'
            });
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching stats:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});
/**
 * Refresh Pokemon TCG set mappings from API
 * This endpoint manually triggers a refresh of the set mappings cache
 */
router.post('/refresh-set-mappings', async (_req, res) => {
    try {
        logger_1.logger.info('🔄 Manual refresh of Pokemon TCG set mappings requested');
        const mappings = await setCodeService_1.setCodeService.refreshSetMappings();
        res.json({
            success: true,
            message: `Refreshed ${mappings.size} set mappings`,
            mappingsCount: mappings.size,
            source: 'pokemon_tcg_api'
        });
    }
    catch (error) {
        logger_1.logger.error('❌ Failed to refresh set mappings:', error);
        res.status(500).json({
            error: 'Failed to refresh set mappings',
            message: error.message
        });
    }
});
/**
 * Get set mapping statistics
 */
router.get('/set-mappings/stats', async (_req, res) => {
    try {
        const stats = await setCodeService_1.setCodeService.getSetMappingStats();
        res.json({
            totalMappingsInDb: stats.databaseMappings,
            cachedMappings: stats.cachedMappings,
            lastRefreshed: stats.lastRefreshed ? new Date(stats.lastRefreshed).toISOString() : null,
            cacheAge: stats.lastRefreshed ? Date.now() - stats.lastRefreshed : null,
            cacheTtl: stats.cacheTtl
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching set mapping stats:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});
exports.default = router;
