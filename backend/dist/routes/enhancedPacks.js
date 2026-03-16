"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../db/database");
const enhancedPackService_1 = require("../services/enhancedPackService");
const setCodeService_1 = require("../services/setCodeService");
const logger_1 = require("../utils/logger");
const pokemonApiClient_1 = require("../services/pokemonApiClient");
const router = (0, express_1.Router)();
/**
 * Get available sets for pack opening
 */
router.get('/sets', async (req, res) => {
    try {
        const sets = await enhancedPackService_1.enhancedPackService.getAvailableSets();
        res.json({
            data: sets,
            count: sets.length,
            source: 'enhanced_pack_service'
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching available sets:', error);
        res.status(500).json({
            error: 'Failed to fetch available sets',
            message: error.message
        });
    }
});
/**
 * Open a pack from a specific set
 */
router.post('/open/:setId', async (req, res) => {
    try {
        const { setId } = req.params;
        const { packPrice, packName } = req.body;
        if (!setId) {
            return res.status(400).json({
                error: 'Set ID is required'
            });
        }
        // Custom pack configuration if provided
        const packConfig = packPrice || packName ? {
            price: packPrice || 4.99,
            name: packName || 'Custom Pack'
        } : {};
        const result = await enhancedPackService_1.enhancedPackService.openPack(setId, packConfig);
        res.json({
            success: true,
            data: result,
            message: `Successfully opened ${result.cards.length} cards from ${setId}`
        });
    }
    catch (error) {
        logger_1.logger.error(`Error opening pack for set ${req.params.setId}:`, error);
        res.status(500).json({
            error: 'Failed to open pack',
            message: error.message
        });
    }
});
/**
 * Resolve database set ID to Pokemon TCG API set code
 */
router.get('/resolve-set-code/:setId', async (req, res) => {
    try {
        const { setId } = req.params;
        if (!setId) {
            return res.status(400).json({
                error: 'Set ID is required'
            });
        }
        const apiSetCode = await setCodeService_1.setCodeService.getApiSetCode(setId);
        if (!apiSetCode) {
            return res.status(404).json({
                error: 'Could not resolve set code',
                databaseSetId: setId
            });
        }
        res.json({
            databaseSetId: setId,
            apiSetCode,
            resolved: true
        });
    }
    catch (error) {
        logger_1.logger.error(`Error resolving set code for ${req.params.setId}:`, error);
        res.status(500).json({
            error: 'Failed to resolve set code',
            message: error.message
        });
    }
});
/**
 * Get pack statistics for a set
 */
router.get('/stats/:setId', async (req, res) => {
    try {
        const { setId } = req.params;
        if (!setId) {
            return res.status(400).json({
                error: 'Set ID is required'
            });
        }
        const db = (0, database_1.getDb)();
        // Get card count and average price for the set
        const stats = await new Promise((resolve, reject) => {
            const sql = `
        SELECT
          COUNT(DISTINCT cm.cardName) as totalCards,
          AVG(ph.marketPrice) as avgPrice,
          COUNT(DISTINCT cm.rarity) as rarityCount
        FROM card_mappings cm
        LEFT JOIN (
          SELECT uniqueIdentifier, marketPrice
          FROM price_history
          WHERE (uniqueIdentifier, date) IN (
            SELECT uniqueIdentifier, MAX(date)
            FROM price_history
            GROUP BY uniqueIdentifier
          )
        ) ph ON cm.uniqueIdentifier = ph.uniqueIdentifier
        WHERE cm.setId = ? OR cm.setName LIKE ?
      `;
            db.get(sql, [setId, `%${setId}%`], (err, row) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(row);
                }
            });
        });
        res.json({
            setId,
            stats,
            source: 'enhanced_pack_service'
        });
    }
    catch (error) {
        logger_1.logger.error(`Error getting stats for set ${req.params.setId}:`, error);
        res.status(500).json({
            error: 'Failed to get set statistics',
            message: error.message
        });
    }
});
/**
 * Debug endpoint: Get set code service status
 */
router.get('/debug/set-codes', async (req, res) => {
    try {
        const stats = setCodeService_1.setCodeService.getSetMappingStats();
        const isInitialized = setCodeService_1.setCodeService.isInitialized();
        res.json({
            initialized: isInitialized,
            stats,
            message: isInitialized
                ? '✅ Set code service is initialized and ready'
                : '❌ Set code service is NOT initialized - images may not load'
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting set code debug info:', error);
        res.status(500).json({
            error: 'Failed to get set code debug info',
            message: error.message
        });
    }
});
/**
 * Debug endpoint: Test set normalization
 */
router.get('/debug/normalize-set/:setId', async (req, res) => {
    try {
        const { setId } = req.params;
        const { setName } = req.query;
        if (!setId) {
            return res.status(400).json({
                error: 'Set ID is required'
            });
        }
        const normalizedSetId = await setCodeService_1.setCodeService.normalizeSetIdForImageUrl(setId, setName);
        const imageUrls = await setCodeService_1.setCodeService.buildDeterministicImageUrls(setId, '1', setName);
        res.json({
            input: {
                setId,
                setName: setName || null
            },
            normalized: normalizedSetId,
            exampleImageUrl: imageUrls,
            success: !!normalizedSetId
        });
    }
    catch (error) {
        logger_1.logger.error('Error testing set normalization:', error);
        res.status(500).json({
            error: 'Failed to test set normalization',
            message: error.message
        });
    }
});
/**
 * Debug endpoint: Get all Pokemon TCG API sets
 */
router.get('/debug/all-sets', async (req, res) => {
    try {
        const sets = await pokemonApiClient_1.pokemonApiClient.getSets(1000);
        res.json({
            count: sets.length,
            sets: sets.map(s => ({
                id: s.id,
                name: s.name,
                series: s.series,
                ptcgoCode: s.ptcgoCode,
                releaseDate: s.releaseDate
            }))
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting all sets:', error);
        res.status(500).json({
            error: 'Failed to get all sets',
            message: error.message
        });
    }
});
exports.default = router;
