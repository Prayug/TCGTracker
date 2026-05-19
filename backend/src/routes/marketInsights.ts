import { Router, Response } from 'express';
import { logger } from '../utils/logger';
import { runPredictions, getLatestPredictions, isPredictionWindow, PredictionWindow, computeSetAgeDays } from '../services/predictionEngine';
import { runBacktest, getBacktestResults } from '../services/backtestEngine';
import { updateActualResults, getForwardTestStatus } from '../services/forwardTestTracker';
import { getExternalSignalsForCard } from '../services/externalSignalService';
import { runSignalScrape } from '../services/scrapers/scraperRunner';
import { generateAiExplanation, isAiExplanation, ExplanationContext } from '../services/aiExplanationService';
import { getDb } from '../db/database';
import { AuthRequest } from '../middleware/auth';

const router = Router();

const asyncHandler = (fn: (req: AuthRequest, res: Response) => Promise<any>) =>
  (req: AuthRequest, res: Response) => {
    fn(req, res).catch((err: any) => {
      logger.error('Market insights route error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    });
  };

router.get('/predictions', asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const category = req.query.category as string | undefined;

  const minPrice = req.query.minPrice !== undefined ? parseFloat(req.query.minPrice as string) : undefined;
  const maxPrice = req.query.maxPrice !== undefined ? parseFloat(req.query.maxPrice as string) : undefined;
  const minConfidence = req.query.minConfidence !== undefined ? parseFloat(req.query.minConfidence as string) : undefined;
  const rarities = req.query.rarities
    ? (req.query.rarities as string).split(',').map(r => r.trim()).filter(Boolean)
    : undefined;

  const eras = req.query.eras
    ? (req.query.eras as string).split(',').map(e => e.trim()).filter(Boolean)
    : undefined;
  const setIds = req.query.setIds
    ? (req.query.setIds as string).split(',').map(s => s.trim()).filter(Boolean)
    : undefined;
  const releaseDateFrom = req.query.releaseDateFrom as string | undefined;
  const releaseDateTo = req.query.releaseDateTo as string | undefined;

  const windowParam = (req.query.window as string) || '90d';
  const window: PredictionWindow = isPredictionWindow(windowParam) ? windowParam : '90d';

  const predictions = await getLatestPredictions(limit, category, {
    minPrice,
    maxPrice,
    minConfidence,
    rarities,
    eras,
    setIds,
    releaseDateFrom,
    releaseDateTo,
  }, window);

  res.json({
    data: predictions,
    count: predictions.length,
    window,
    modelVersion: '3.2.0',
  });
}));

router.get('/card/:cardId', asyncHandler(async (req, res) => {
  const { cardId } = req.params;
  const db = getDb();

  const prediction: any = await new Promise((resolve, reject) => {
    db.get(
      `       SELECT cp.*,
              cm.cardName, cm.setName, cm.setId, cm.cardNumber,
              COALESCE(NULLIF(TRIM(cm.rarity), ''), cc.rarity) AS rarity,
              cm.imageSmall, cm.imageLarge, cm.tcgplayerProductId
       FROM card_predictions cp
       LEFT JOIN (
         SELECT cardId, MIN(cardName) AS cardName, MIN(setName) AS setName, MIN(setId) AS setId,
                MIN(cardNumber) AS cardNumber, MIN(rarity) AS rarity,
                 MIN(COALESCE(NULLIF(imageLarge, ''), NULLIF(image_large, ''))) AS imageLarge,
                 MIN(COALESCE(NULLIF(imageSmall, ''), NULLIF(image_small, ''))) AS imageSmall,
                MIN(COALESCE(tcgplayerProductId, CAST(productId AS TEXT))) AS tcgplayerProductId
         FROM card_mappings
         GROUP BY cardId
       ) cm ON cm.cardId = cp.card_id
       LEFT JOIN catalog_cards cc ON cc.cardId = cp.card_id
       WHERE cp.card_id = ? AND cp.run_id = (SELECT MAX(id) FROM prediction_runs)
       LIMIT 1`,
      [cardId],
      (err, row: any) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });

  if (!prediction) {
    return res.status(404).json({ error: 'No prediction found for this card' });
  }

  const result: any = await new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM prediction_results WHERE prediction_id = ?`,
      [prediction.id],
      (err, row: any) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });

  res.json({
    prediction: {
      id: prediction.id,
      cardId: prediction.card_id,
      cardName: prediction.cardName || '',
      setId: prediction.setId || '',
      setName: prediction.setName || '',
      cardNumber: prediction.cardNumber || '',
      rarity: prediction.rarity || '',
      imageSmall: prediction.imageSmall || undefined,
      imageLarge: prediction.imageLarge || undefined,
      tcgplayerProductId: prediction.tcgplayerProductId || undefined,
      currentPrice: prediction.current_price,
      predicted7d: {
        low: prediction.predicted_7d_low,
        mid: prediction.predicted_7d_mid,
        high: prediction.predicted_7d_high,
      },
      predicted30d: {
        low: prediction.predicted_30d_low,
        mid: prediction.predicted_30d_mid,
        high: prediction.predicted_30d_high,
      },
      predicted90d: {
        low: prediction.predicted_90d_low,
        mid: prediction.predicted_90d_mid,
        high: prediction.predicted_90d_high,
      },
      predicted180d: prediction.predicted_180d_mid != null ? {
        low: prediction.predicted_180d_low,
        mid: prediction.predicted_180d_mid,
        high: prediction.predicted_180d_high,
      } : null,
      predicted365d: prediction.predicted_365d_mid != null ? {
        low: prediction.predicted_365d_low,
        mid: prediction.predicted_365d_mid,
        high: prediction.predicted_365d_high,
      } : null,
      expected7dReturn: prediction.expected_7d_return,
      expected30dReturn: prediction.expected_30d_return,
      expected90dReturn: prediction.expected_90d_return,
      expected180dReturn: prediction.expected_180d_return ?? null,
      expected365dReturn: prediction.expected_365d_return ?? null,
      confidenceScore: prediction.confidence_score,
      riskScore: prediction.risk_score,
      category: prediction.category,
      suggestedAction: prediction.suggested_action,
      explanation: prediction.explanation,
      riskFactors: prediction.risk_factors,
      externalSignals: prediction.external_signals_json,
    },
    result: result ? {
      actual7dPrice: result.actual_7d_price,
      actual30dPrice: result.actual_30d_price,
      actual90dPrice: result.actual_90d_price,
      actual180dPrice: result.actual_180d_price ?? null,
      actual365dPrice: result.actual_365d_price ?? null,
      status: result.status,
    } : null,
  });
}));

router.post('/run-predictions', asyncHandler(async (_req, res) => {
  logger.info('Manual prediction run requested');
  const result = await runPredictions();
  res.status(202).json({
    success: true,
    runId: result.runId,
    total: result.total,
    succeeded: result.succeeded,
    failed: result.failed,
    message: `Prediction run complete: ${result.succeeded} predictions generated, ${result.failed} skipped`,
  });
}));

router.post('/backtest', asyncHandler(async (req, res) => {
  const { backtestDate, windowDays = 90, cardIds } = req.body;

  if (!backtestDate) {
    return res.status(400).json({ error: 'backtestDate is required (YYYY-MM-DD)' });
  }

  logger.info(`Backtest requested for date ${backtestDate}, window ${windowDays} days`);
  const result = await runBacktest(backtestDate, windowDays, cardIds || undefined);
  res.json(result);
}));

router.get('/backtest-results', asyncHandler(async (_req, res) => {
  const results = await getBacktestResults();
  res.json({ data: results });
}));

router.get('/forward-test', asyncHandler(async (_req, res) => {
  const status = await getForwardTestStatus();
  res.json(status);
}));

router.post('/forward-test/update', asyncHandler(async (_req, res) => {
  const result = await updateActualResults();
  res.json({ success: true, updated: result.updated });
}));

router.get('/external-signals/:cardId', asyncHandler(async (req, res) => {
  const { cardId } = req.params;
  const signals = await getExternalSignalsForCard(cardId);
  res.json({ data: signals });
}));

router.post('/run-scrape', asyncHandler(async (_req, res) => {
  logger.info('Manual signal scrape requested');
  const result = await runSignalScrape();
  res.status(202).json({
    success: true,
    scraped: result.scraped,
    stored: result.stored,
    errors: result.errors,
    message: `Signal scrape complete: ${result.stored} signals stored from ${result.scraped} unique signals`,
  });
}));

router.get('/card/:cardId/explanation', asyncHandler(async (req, res) => {
  const { cardId } = req.params;
  const db = getDb();

  const prediction: any = await new Promise((resolve, reject) => {
    db.get(
      `SELECT cp.*, cm.cardName, cm.setName, cm.rarity
       FROM card_predictions cp
       LEFT JOIN (
         SELECT cardId, MIN(cardName) AS cardName, MIN(setName) AS setName,
                COALESCE(NULLIF(TRIM(MIN(rarity)), ''), '') AS rarity
         FROM card_mappings
         GROUP BY cardId
       ) cm ON cm.cardId = cp.card_id
       LEFT JOIN catalog_cards cc ON cc.cardId = cp.card_id
       WHERE cp.card_id = ? AND cp.run_id = (SELECT MAX(id) FROM prediction_runs)
       LIMIT 1`,
      [cardId],
      (err, row: any) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });

  if (!prediction) {
    return res.status(404).json({ error: 'No prediction found for this card' });
  }

  const existingExplanation: string = prediction.explanation ?? '';

  if (isAiExplanation(existingExplanation)) {
    return res.json({ explanation: existingExplanation, cached: true });
  }

  const setReleaseDate: string | null = await new Promise((resolve) => {
    db.get(
      `SELECT setReleaseDate FROM catalog_cards
       WHERE cardId = ? AND setReleaseDate IS NOT NULL AND TRIM(setReleaseDate) <> ''
       LIMIT 1`,
      [cardId],
      (err, row: any) => resolve(err || !row ? null : row.setReleaseDate)
    );
  });

  const ctx: ExplanationContext = {
    cardName: prediction.cardName || prediction.card_id,
    setName: prediction.setName || '',
    currentPrice: prediction.current_price ?? 0,
    category: prediction.category ?? '',
    rarity: prediction.rarity || undefined,
    predictedReturns: {
      d7: prediction.expected_7d_return ?? 0,
      d30: prediction.expected_30d_return ?? 0,
      d90: prediction.expected_90d_return ?? 0,
    },
    confidence: prediction.confidence_score ?? 0,
    riskScore: prediction.risk_score ?? 0,
    externalSignals: prediction.external_signals_json ?? '[]',
    setAgeDays: setReleaseDate ? computeSetAgeDays(setReleaseDate) : null,
  };

  let aiExplanation: string;
  try {
    aiExplanation = await generateAiExplanation(ctx);
  } catch (err: any) {
    const msg = err?.message || 'AI explanation generation failed';
    logger.warn(`AI explanation failed for ${ctx.cardName}: ${msg}`);
    return res.status(503).json({ error: msg });
  }

  await new Promise<void>((resolve, reject) => {
    db.run(
      `UPDATE card_predictions SET explanation = ? WHERE id = ?`,
      [aiExplanation, prediction.id],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  res.json({ explanation: aiExplanation, cached: false });
}));

export default router;
