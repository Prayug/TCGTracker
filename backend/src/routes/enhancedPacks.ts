import { Router } from 'express';
import { getDb } from '../db/database';
import { enhancedPackService } from '../services/enhancedPackService';
import { setCodeService } from '../services/setCodeService';
import { logger } from '../utils/logger';
import { pokemonApiClient } from '../services/pokemonApiClient';

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

    const db = getDb();

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

/**
 * Debug endpoint: Get set code service status
 */
router.get('/debug/set-codes', async (req, res) => {
  try {
    const stats = setCodeService.getSetMappingStats();
    const isInitialized = setCodeService.isInitialized();
    
    res.json({
      initialized: isInitialized,
      stats,
      message: isInitialized 
        ? '✅ Set code service is initialized and ready' 
        : '❌ Set code service is NOT initialized - images may not load'
    });
  } catch (error) {
    logger.error('Error getting set code debug info:', error);
    res.status(500).json({
      error: 'Failed to get set code debug info',
      message: (error as Error).message
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

    const normalizedSetId = await setCodeService.normalizeSetIdForImageUrl(
      setId, 
      setName as string | undefined
    );
    
    const imageUrls = await setCodeService.buildDeterministicImageUrls(
      setId,
      '1',
      setName as string | undefined
    );

    res.json({
      input: {
        setId,
        setName: setName || null
      },
      normalized: normalizedSetId,
      exampleImageUrl: imageUrls,
      success: !!normalizedSetId
    });
  } catch (error) {
    logger.error('Error testing set normalization:', error);
    res.status(500).json({
      error: 'Failed to test set normalization',
      message: (error as Error).message
    });
  }
});

/**
 * Debug endpoint: Get all Pokemon TCG API sets
 */
router.get('/debug/all-sets', async (req, res) => {
  try {
    const sets = await pokemonApiClient.getSets(1000);
    
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
  } catch (error) {
    logger.error('Error getting all sets:', error);
    res.status(500).json({
      error: 'Failed to get all sets',
      message: (error as Error).message
    });
  }
});

export default router;
