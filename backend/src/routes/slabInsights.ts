import { Router, Response } from 'express';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';
import { computeSetAgeDays, type PredictionWindow } from '../services/predictionEngine';
import { getGradedHorizonSupportStatus, windowToHorizonDays } from '../services/horizonSupport';
import {
  SLAB_MODEL_VERSION,
  getLatestSlabPredictions,
  getSlabCardPrediction,
  getSlabOverview,
  getSlabPredictionResult,
  isPredictionWindow,
  startSlabPredictionsInBackground,
  getSlabPredictionRunStatus,
  updateSlabExplanation,
} from '../services/slabPredictionEngine';
import { getSlabBacktestResults, runSlabBacktest } from '../services/slabBacktestEngine';
import { getSlabForwardTestStatus, updateSlabActualResults } from '../services/slabForwardTest';
import { getSlabDataQuality } from '../services/slabDataQuality';
import { getCalibrationModels, getCalibrationStatus } from '../services/returnCalibration';
import { getExternalSignalsForCard } from '../services/externalSignalService';
import {
  generateAiExplanation,
  isAiExplanation,
  ExplanationContext,
} from '../services/aiExplanationService';

const router = Router();

const asyncHandler =
  (fn: (req: AuthRequest, res: Response) => Promise<any>) => (req: AuthRequest, res: Response) => {
    fn(req, res).catch((err: any) => {
      logger.error('Slab insights route error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    });
  };

router.get(
  '/predictions',
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const category = req.query.category as string | undefined;
    const search = req.query.search as string | undefined;
    const sortBy = (req.query.sortBy as string) || 'return';
    const sortOrder = (req.query.sortOrder as string) || 'desc';
    const minPrice =
      req.query.minPrice !== undefined ? parseFloat(req.query.minPrice as string) : undefined;
    const maxPrice =
      req.query.maxPrice !== undefined ? parseFloat(req.query.maxPrice as string) : undefined;
    const minConfidence =
      req.query.minConfidence !== undefined
        ? parseFloat(req.query.minConfidence as string)
        : undefined;
    const rarities = req.query.rarities
      ? (req.query.rarities as string)
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean)
      : undefined;
    const eras = req.query.eras
      ? (req.query.eras as string)
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean)
      : undefined;
    const setIds = req.query.setIds
      ? (req.query.setIds as string)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    const releaseDateFrom = req.query.releaseDateFrom as string | undefined;
    const releaseDateTo = req.query.releaseDateTo as string | undefined;

    const windowParam = (req.query.window as string) || '90d';
    const window: PredictionWindow = isPredictionWindow(windowParam) ? windowParam : '90d';
    const horizonSupport = await getGradedHorizonSupportStatus();
    const horizonDays = windowToHorizonDays(window);

    let effectiveWindow = window;
    if (horizonSupport.unsupported.includes(horizonDays)) {
      const usable = [...horizonSupport.supported, ...horizonSupport.experimental];
      const fallback = ([7, 30, 90] as const).find((h) => usable.includes(h));
      if (fallback) effectiveWindow = `${fallback}d` as PredictionWindow;
    }

    const predictions = await getLatestSlabPredictions(
      limit,
      category,
      {
        minPrice,
        maxPrice,
        minConfidence,
        rarities,
        eras,
        setIds,
        releaseDateFrom,
        releaseDateTo,
        search,
        sortBy: sortBy as 'return' | 'confidence' | 'price' | 'name' | 'risk',
        sortOrder: sortOrder as 'asc' | 'desc',
        game: 'pokemon',
      },
      effectiveWindow
    );

    res.json({
      data: predictions,
      count: predictions.length,
      window: effectiveWindow,
      requestedWindow: window,
      horizonSupport,
      experimental: horizonSupport.experimental.includes(windowToHorizonDays(effectiveWindow)),
      modelVersion: SLAB_MODEL_VERSION,
    });
  })
);

router.get(
  '/horizon-support',
  asyncHandler(async (_req, res) => {
    const horizonSupport = await getGradedHorizonSupportStatus(true);
    res.json({ data: horizonSupport });
  })
);

router.get(
  '/data-quality',
  asyncHandler(async (_req, res) => {
    const summary = await getSlabDataQuality();
    res.json({
      data: summary.checks,
      runAt: summary.runAt,
      passed: summary.passed,
      warned: summary.warned,
      failed: summary.failed,
    });
  })
);

router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const overview = await getSlabOverview();
    res.json(overview);
  })
);

router.get(
  '/card/:cardId',
  asyncHandler(async (req, res) => {
    const { cardId } = req.params;
    const prediction = await getSlabCardPrediction(cardId);
    if (!prediction) {
      return res.status(404).json({ error: 'No slab prediction found for this card' });
    }
    const result = await getSlabPredictionResult(prediction.id);
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
        uniqueIdentifier: prediction.unique_identifier || undefined,
        variantKey: prediction.variant_key || 'psa10',
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
        predicted180d:
          prediction.predicted_180d_mid != null
            ? {
                low: prediction.predicted_180d_low,
                mid: prediction.predicted_180d_mid,
                high: prediction.predicted_180d_high,
              }
            : null,
        predicted365d:
          prediction.predicted_365d_mid != null
            ? {
                low: prediction.predicted_365d_low,
                mid: prediction.predicted_365d_mid,
                high: prediction.predicted_365d_high,
              }
            : null,
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
      result: result
        ? {
            actual7dPrice: result.actual_7d_price,
            actual30dPrice: result.actual_30d_price,
            actual90dPrice: result.actual_90d_price,
            actual180dPrice: result.actual_180d_price ?? null,
            actual365dPrice: result.actual_365d_price ?? null,
            status: result.status,
          }
        : null,
    });
  })
);

router.post(
  '/run-predictions',
  asyncHandler(async (_req, res) => {
    logger.info('Manual slab prediction run requested');
    const kick = startSlabPredictionsInBackground();
    const status = getSlabPredictionRunStatus();
    const message = kick.alreadyRunning
      ? 'A slab prediction run is already in progress. Scoring every PSA 10 with enough history.'
      : 'Scoring all PSA 10 slabs in the background. This can take a few minutes — keep this tab open.';
    res.status(202).json({
      success: true,
      running: true,
      alreadyRunning: kick.alreadyRunning,
      startedAt: status.startedAt,
      message,
    });
  })
);

router.get(
  '/run-status',
  asyncHandler(async (_req, res) => {
    const status = getSlabPredictionRunStatus();
    res.json({
      running: status.running,
      startedAt: status.startedAt,
      last: status.last,
    });
  })
);

router.post(
  '/backtest',
  asyncHandler(async (req, res) => {
    const { backtestDate, windowDays = 90, cardIds } = req.body;
    if (!backtestDate) {
      return res.status(400).json({ error: 'backtestDate is required (YYYY-MM-DD)' });
    }
    logger.info(`Slab backtest requested for date ${backtestDate}, window ${windowDays} days`);
    const result = await runSlabBacktest(backtestDate, windowDays, cardIds || undefined);
    res.json(result);
  })
);

router.get(
  '/calibration/status',
  asyncHandler(async (_req, res) => {
    const models = await getCalibrationModels();
    res.json({ data: getCalibrationStatus(models) });
  })
);

router.get(
  '/backtest-results',
  asyncHandler(async (_req, res) => {
    const results = await getSlabBacktestResults();
    res.json({ data: results });
  })
);

router.get(
  '/forward-test',
  asyncHandler(async (_req, res) => {
    const status = await getSlabForwardTestStatus();
    res.json(status);
  })
);

router.post(
  '/forward-test/update',
  asyncHandler(async (_req, res) => {
    const result = await updateSlabActualResults();
    res.json({ success: true, updated: result.updated });
  })
);

router.get(
  '/external-signals/:cardId',
  asyncHandler(async (req, res) => {
    const { cardId } = req.params;
    const signals = await getExternalSignalsForCard(cardId);
    res.json({ data: signals });
  })
);

router.get(
  '/card/:cardId/explanation',
  asyncHandler(async (req, res) => {
    const { cardId } = req.params;
    const prediction = await getSlabCardPrediction(cardId);
    if (!prediction) {
      return res.status(404).json({ error: 'No slab prediction found for this card' });
    }

    const existingExplanation: string = prediction.explanation ?? '';
    if (isAiExplanation(existingExplanation)) {
      return res.json({ explanation: existingExplanation, cached: true });
    }

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
      setAgeDays: computeSetAgeDays(null),
    };

    let aiExplanation: string;
    try {
      aiExplanation = await generateAiExplanation(ctx);
    } catch (err: any) {
      const msg = err?.message || 'AI explanation generation failed';
      logger.warn(`Slab AI explanation failed for ${ctx.cardName}: ${msg}`);
      return res.status(503).json({ error: msg });
    }

    await updateSlabExplanation(prediction.id, aiExplanation);
    res.json({ explanation: aiExplanation, cached: false });
  })
);

export default router;
