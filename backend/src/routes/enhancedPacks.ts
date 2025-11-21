import { Router } from 'express';
import { enhancedPackService } from '../services/enhancedPackService';
import { setCodeService } from '../services/setCodeService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Get available sets for pack opening
 */
router.get('/sets', async (req, res) => {
  try {
    const sets = await enhancedPackService.getAvailableSets();

    res.json({
      data: sets,
      count: sets.length,
      source: 'enhanced_pack_service'
    });
  } catch (error) {
    logger.error('Error fetching available sets:', error);
    res.status(500).json({
      error: 'Failed to fetch available sets',
      message: (error as Error).message
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

    const result = await enhancedPackService.openPack(setId, packConfig);

    res.json({
      success: true,
      data: result,
      message: `Successfully opened ${result.cards.length} cards from ${setId}`
    });
  } catch (error) {
    logger.error(`Error opening pack for set ${req.params.setId}:`, error);
    res.status(500).json({
      error: 'Failed to open pack',
      message: (error as Error).message
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

    const apiSetCode = await setCodeService.getApiSetCode(setId);

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
  } catch (error) {
    logger.error(`Error resolving set code for ${req.params.setId}:`, error);
    res.status(500).json({
      error: 'Failed to resolve set code',
      message: (error as Error).message
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

    const db = require('../db/database').getDb();

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

      db.get(sql, [setId, `%${setId}%`], (err: any, row: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });

    res.json({
      setId,
      stats,
      source: 'enhanced_pack_service'
    });
  } catch (error) {
    logger.error(`Error getting stats for set ${req.params.setId}:`, error);
    res.status(500).json({
      error: 'Failed to get set statistics',
      message: (error as Error).message
    });
  }
});

export default router;
