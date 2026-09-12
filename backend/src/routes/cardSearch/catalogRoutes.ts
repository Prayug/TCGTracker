import { Router } from 'express';
import { getDb } from '../../db/database';
import { logger } from '../../utils/logger';
import { setCodeService } from '../../services/setCodeService';

const router = Router();

/**
 * Get all unique sets from local database, enriched with era, series, and logos
 */
router.get('/sets', async (_req, res) => {
  try {
    const { getEnrichedSets } = await import('../../services/setListService');
    const sets = await getEnrichedSets();

    res.json({
      data: sets,
      count: sets.length,
      source: 'catalog_sync_enriched',
    });
  } catch (error) {
    logger.error('Error fetching sets:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    });
  }
});

/**
 * Get card statistics
 */
router.get('/stats', async (_req, res) => {
  try {
    const db = getDb();

    const sql = `
      SELECT 
        COUNT(DISTINCT cardName) as totalCards,
        COUNT(DISTINCT setId) as totalSets,
        COUNT(*) as totalEntries
      FROM card_mappings
    `;

    db.get(sql, [], (err, row: any) => {
      if (err) {
        logger.error('Error fetching stats:', err);
        return res.status(500).json({
          error: 'Database error',
          message: err.message,
        });
      }

      res.json({
        totalCards: row.totalCards || 0,
        totalSets: row.totalSets || 0,
        totalEntries: row.totalEntries || 0,
        source: 'local_database',
      });
    });
  } catch (error) {
    logger.error('Error fetching stats:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    });
  }
});

/**
 * Refresh Pokemon TCG set mappings from API
 * This endpoint manually triggers a refresh of the set mappings cache
 */
router.post('/refresh-set-mappings', async (_req, res) => {
  try {
    logger.info('🔄 Manual refresh of Pokemon TCG set mappings requested');

    const mappings = await setCodeService.refreshSetMappings();

    res.json({
      success: true,
      message: `Refreshed ${mappings.size} set mappings`,
      mappingsCount: mappings.size,
      source: 'pokemon_tcg_api',
    });
  } catch (error) {
    logger.error('❌ Failed to refresh set mappings:', error);
    res.status(500).json({
      error: 'Failed to refresh set mappings',
      message: (error as Error).message,
    });
  }
});

/**
 * Get set mapping statistics
 */
router.get('/set-mappings/stats', async (_req, res) => {
  try {
    const stats = await setCodeService.getSetMappingStats();

    res.json({
      totalMappingsInDb: stats.databaseMappings,
      cachedMappings: stats.cachedMappings,
      lastRefreshed: stats.lastRefreshed ? new Date(stats.lastRefreshed).toISOString() : null,
      cacheAge: stats.lastRefreshed ? Date.now() - stats.lastRefreshed : null,
      cacheTtl: stats.cacheTtl,
    });
  } catch (error) {
    logger.error('Error fetching set mapping stats:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    });
  }
});

export default router;
