import cron from 'node-cron';
import { updatePriceData, recoverMissedPriceUpdates } from './services/dataFetcher';
import { syncCatalogData } from './services/catalogSync';
import { syncOnePieceData } from './services/onePieceSync';
import { backfillCardMappingImages } from './services/cardImageBackfillService';
import { AlertService } from './services/alertService';
import { logger } from './utils/logger';

const PRICE_CATCHUP_INTERVAL_MS = 10 * 60 * 1000;

async function runDailyPriceUpdate(alertService: AlertService): Promise<void> {
  logger.info('Running scheduled daily price data update...');
  try {
    const result = await updatePriceData();
    if (result.skipped) {
      logger.warn('Daily price data update skipped', {
        reason: (result as { reason?: string }).reason,
      });
      return;
    }
    logger.info('Daily price data update completed', result);
    const imageResult = await backfillCardMappingImages();
    logger.info('Post-price-update image backfill completed', imageResult);
    try {
      const { materializeCanonicalPrices } = await import('./services/canonicalPriceService');
      const canonical = await materializeCanonicalPrices();
      logger.info('Canonical prices refreshed', canonical);
    } catch (canonErr: any) {
      logger.warn('Canonical price materialization failed', { error: canonErr.message });
    }
    try {
      const triggered = await alertService.evaluateAllSmartAlertsFromPrices();
      logger.info('Smart alerts evaluated after price update', { triggered });
    } catch (alertErr: any) {
      logger.warn('Smart alert evaluation failed', { error: alertErr.message });
    }
  } catch (error: any) {
    logger.error('Failed to update price data', { error: error.message });
  }
}

async function runPriceUpdateCatchUp(alertService: AlertService): Promise<void> {
  try {
    const result = await recoverMissedPriceUpdates();
    if (result.skipped) {
      logger.info('Price update catch-up skipped', {
        reason: (result as { reason?: string }).reason,
      });
      return;
    }
    logger.info('Price update catch-up completed', result);
    const imageResult = await backfillCardMappingImages();
    logger.info('Post-catch-up image backfill completed', imageResult);
    try {
      const triggered = await alertService.evaluateAllSmartAlertsFromPrices();
      logger.info('Smart alerts evaluated after catch-up', { triggered });
    } catch (alertErr: any) {
      logger.warn('Smart alert evaluation failed after catch-up', { error: alertErr.message });
    }
  } catch (error: any) {
    logger.error('Price update catch-up failed', { error: error.message });
  }
}

async function runGradedHistoryCatchUp(): Promise<void> {
  try {
    const { snapshotAllGradedPricesToHistory, backfillGradedHistoryFromCache } = await import(
      './services/gradedPriceService'
    );
    const { withDbJobLock } = await import('./utils/dbJobLock');
    await withDbJobLock(
      'graded-history-snapshot',
      async () => {
        await backfillGradedHistoryFromCache();
        return snapshotAllGradedPricesToHistory();
      },
      { skipIfBusy: true }
    );
  } catch (error: any) {
    logger.warn('Graded history catch-up failed', { error: error.message });
  }
}

async function runGradedDataRefresh(): Promise<void> {
  logger.info('Running scheduled graded data refresh...');
  try {
    const { snapshotAllGradedPricesToHistory, backfillGradedHistoryFromCache } = await import(
      './services/gradedPriceService'
    );
    const { runAllCardsRefresh } = await import('./services/gradedRefreshService');

    const snap = await snapshotAllGradedPricesToHistory();
    logger.info('Graded history daily snapshot completed', snap);

    const result = await runAllCardsRefresh({
      maxDurationMs: 1000 * 60 * 60 * 6,
      delayMs: 750,
    });
    logger.info('Graded data refresh completed', result);

    const snap2 = await snapshotAllGradedPricesToHistory();
    logger.info('Graded history post-scrape snapshot completed', snap2);

    const backfill = await backfillGradedHistoryFromCache();
    logger.info('Graded history cache backfill completed', backfill);
  } catch (error: any) {
    logger.error('Graded data refresh failed', { error: error.message });
  }
}

async function runSignalScrapeJob(label: string): Promise<void> {
  logger.info(label);
  try {
    const { runSignalScrape } = await import('./services/scrapers/scraperRunner');
    const result = await runSignalScrape();
    logger.info(label.replace('Running', 'Completed').replace('...', ''), result);
  } catch (error: any) {
    logger.error('Failed to run signal scrape', { error: error.message });
  }
}

export function setupScheduledJobs(alertService: AlertService): void {
  cron.schedule(
    '0 2 * * *',
    () => {
      void runDailyPriceUpdate(alertService);
    },
    { timezone: 'America/New_York' }
  );

  setTimeout(() => void runPriceUpdateCatchUp(alertService), 60_000);
  setInterval(() => void runPriceUpdateCatchUp(alertService), PRICE_CATCHUP_INTERVAL_MS);

  cron.schedule(
    '0 16 * * *',
    () => {
      logger.info('Running afternoon price snapshot (16:00 ET)...');
      void runPriceUpdateCatchUp(alertService);
    },
    { timezone: 'America/New_York' }
  );

  cron.schedule(
    '30 1 * * *',
    async () => {
      logger.info('Running scheduled catalog sync...');
      try {
        const result = await syncCatalogData();
        logger.info('Catalog sync completed', result);
        const imageResult = await backfillCardMappingImages();
        logger.info('Post-catalog image backfill completed', imageResult);
      } catch (error: any) {
        logger.error('Failed to sync card catalog', { error: error.message });
      }
    },
    { timezone: 'America/New_York' }
  );

  cron.schedule(
    '45 1 * * *',
    async () => {
      logger.info('Running scheduled One Piece catalog and price sync...');
      try {
        const result = await syncOnePieceData();
        logger.info('One Piece sync completed', result);
      } catch (error: any) {
        logger.error('Failed to sync One Piece data', { error: error.message });
      }
    },
    { timezone: 'America/New_York' }
  );

  cron.schedule(
    '30 2 * * *',
    () => {
      void runGradedDataRefresh();
    },
    { timezone: 'America/New_York' }
  );

  setTimeout(() => void runGradedHistoryCatchUp(), 60_000);
  setInterval(() => void runGradedHistoryCatchUp(), 6 * 60 * 60 * 1000);

  cron.schedule(
    '0 12,18 * * *',
    () => {
      void runGradedHistoryCatchUp();
    },
    { timezone: 'America/New_York' }
  );

  cron.schedule(
    '0 3 * * *',
    async () => {
      logger.info('Running scheduled prediction run...');
      try {
        const { runPredictions } = await import('./services/predictionEngine');
        const { updateActualResults } = await import('./services/forwardTestTracker');
        await runPredictions();
        await updateActualResults();
        logger.info('Scheduled prediction run completed');
        const { runSlabPredictions } = await import('./services/slabPredictionEngine');
        const { updateSlabActualResults } = await import('./services/slabForwardTest');
        await runSlabPredictions();
        await updateSlabActualResults();
        logger.info('Scheduled slab prediction run completed');
      } catch (error: any) {
        logger.error('Failed to run predictions', { error: error.message });
      }
    },
    { timezone: 'America/New_York' }
  );

  cron.schedule(
    '30 3 * * *',
    async () => {
      logger.info('Running data quality checks and retention...');
      try {
        const { runDataQualityChecks } = await import('./services/dataQualityService');
        const { runRetentionPolicies } = await import('./services/retentionService');
        const quality = await runDataQualityChecks();
        const retention = await runRetentionPolicies({ keepPredictionRuns: 30 });
        logger.info('Data quality + retention completed', {
          passed: quality.passed,
          warned: quality.warned,
          failed: quality.failed,
          ...retention,
        });
      } catch (error: any) {
        logger.error('Data quality / retention failed', { error: error.message });
      }
    },
    { timezone: 'America/New_York' }
  );

  cron.schedule(
    '0 4 * * *',
    () => {
      void runSignalScrapeJob('Running scheduled signal scrape...');
    },
    { timezone: 'America/New_York' }
  );

  cron.schedule(
    '30 */6 * * *',
    () => {
      void runSignalScrapeJob('Running scheduled social signal scrape...');
    },
    { timezone: 'America/New_York' }
  );

  cron.schedule(
    '0 5 * * 0',
    () => {
      void runSignalScrapeJob('Running scheduled weekly signal scrape...');
    },
    { timezone: 'America/New_York' }
  );
}
