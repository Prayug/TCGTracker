import { Router } from 'express';
import { logger } from '../../utils/logger';
import {
  getGradedPrices,
  getGradedPriceHistory,
  getAllGradedPriceHistory,
} from '../../services/gradedPriceService';
import { recordGradedRequest } from '../../services/gradedRefreshService';
import { parseCsvParam } from './parseCsvParam';

const router = Router();

router.get('/graded-prices', async (req, res) => {
  try {
    const { cardId, cardName, setId, setName, cardNumber, language, matchName, variant, game, cardImageId } = req.query;

    if (!cardId || !cardName) {
      return res.status(400).json({ error: 'cardId and cardName are required' });
    }

    const result = await getGradedPrices(
      String(cardId),
      String(cardName),
      setId ? String(setId) : undefined,
      setName ? String(setName) : undefined,
      cardNumber ? String(cardNumber) : undefined,
      {
        language: language ? String(language) : undefined,
        matchName: matchName ? String(matchName) : undefined,
        variant: variant ? String(variant) : undefined,
        game: game === 'onepiece' || game === 'pokemon' ? game : undefined,
        cardImageId: cardImageId ? String(cardImageId) : undefined,
      }
    );

    void recordGradedRequest({
      cardId: String(cardId),
      cardName: String(cardName),
      setId: setId ? String(setId) : undefined,
      setName: setName ? String(setName) : undefined,
      cardNumber: cardNumber ? String(cardNumber) : undefined,
      language: language ? String(language) : undefined,
      matchName: matchName ? String(matchName) : undefined,
      variant: variant ? String(variant) : undefined,
    });

    res.json({ data: result });
  } catch (error: any) {
    logger.error('Graded prices lookup failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch graded prices' });
  }
});

router.get('/graded-price-history', async (req, res) => {
  try {
    const cardId = req.query.cardId ? String(req.query.cardId) : '';
    const days = req.query.days ? parseInt(String(req.query.days), 10) : 365;
    const safeDays = Number.isFinite(days) ? days : 365;
    const variant = req.query.variant ? String(req.query.variant) : undefined;

    if (!cardId) {
      return res.status(400).json({ error: 'cardId is required' });
    }

    // Omit grader to fetch every series for a multi-line chart.
    if (!req.query.grader) {
      const all = await getAllGradedPriceHistory(cardId, safeDays, variant);
      return res.json({ data: all });
    }

    const grader = String(req.query.grader);
    const grade = req.query.grade ? String(req.query.grade) : '10';
    const result = await getGradedPriceHistory(cardId, grader, grade, safeDays, variant);
    res.json({ data: result });
  } catch (error: any) {
    logger.error('Graded price history lookup failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch graded price history' });
  }
});

router.get('/graded-spreads', async (req, res) => {
  try {
    const {
      getGradedSpreadsForCard,
      getTopGradedPremiums,
      getPsa10SpreadsForCards,
    } = await import('../../services/gradedSpreadService');
    const cardId = req.query.cardId ? String(req.query.cardId) : null;
    const variant = req.query.variant ? String(req.query.variant) : undefined;
    if (cardId) {
      const summary = await getGradedSpreadsForCard(cardId, variant);
      return res.json({ data: summary });
    }
    const cardIds = parseCsvParam(req.query.cardIds);
    if (cardIds && cardIds.length > 0) {
      const batch = await getPsa10SpreadsForCards(cardIds);
      return res.json({ data: batch, count: batch.length });
    }
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
    const tradeableOnly =
      String(req.query.tradeableOnly || '') === '1' ||
      String(req.query.tradeableOnly || '').toLowerCase() === 'true';
    const top = await getTopGradedPremiums(limit, { tradeableOnly });
    res.json({ data: top, count: top.length });
  } catch (error: any) {
    logger.error('Graded spreads lookup failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch graded spreads' });
  }
});

router.get('/graded-premium-movers', async (req, res) => {
  try {
    const { getTopPremiumMovers } = await import('../../services/gradedSpreadService');
    const days = Math.min(parseInt(String(req.query.days || '30'), 10) || 30, 90);
    const limit = Math.min(parseInt(String(req.query.limit || '12'), 10) || 12, 50);
    const movers = await getTopPremiumMovers({ days, limit });
    res.json({ data: movers, count: movers.length, days });
  } catch (error: any) {
    logger.error('Graded premium movers lookup failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch premium movers' });
  }
});

router.get('/cross-grader-arbs', async (req, res) => {
  try {
    const { getCrossGraderArbs } = await import('../../services/gradedSpreadService');
    const limit = Math.min(parseInt(String(req.query.limit || '12'), 10) || 12, 50);
    const rows = await getCrossGraderArbs(limit);
    res.json({ data: rows, count: rows.length });
  } catch (error: any) {
    logger.error('Cross-grader arb lookup failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch cross-grader arbs' });
  }
});

/**
 * Cards most worth submitting for a PSA 10: high slab premium × easy gem rate.
 * Optional ?cardIds=a,b,c (or POST body) scopes to a vault / subset.
 */
router.get('/grade-worthiness', async (req, res) => {
  try {
    const { getGradeWorthinessLeaderboard, parseGradeWorthinessSort } = await import(
      '../../services/gradeWorthinessService'
    );
    const limit = Math.min(parseInt(String(req.query.limit || '40'), 10) || 40, 200);
    const result = await getGradeWorthinessLeaderboard({
      limit,
      cardIds: parseCsvParam(req.query.cardIds),
      eras: parseCsvParam(req.query.eras),
      setIds: parseCsvParam(req.query.setIds),
      sort: parseGradeWorthinessSort(req.query.sort),
    });
    res.json({ data: result });
  } catch (error: any) {
    logger.error('Grade worthiness lookup failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch grade worthiness' });
  }
});

router.post('/grade-worthiness', async (req, res) => {
  try {
    const { getGradeWorthinessLeaderboard, parseGradeWorthinessSort } = await import(
      '../../services/gradeWorthinessService'
    );
    const limit = Math.min(
      parseInt(String(req.query.limit || req.body?.limit || '40'), 10) || 40,
      200
    );
    const result = await getGradeWorthinessLeaderboard({
      limit,
      cardIds: parseCsvParam(req.body?.cardIds),
      eras: parseCsvParam(req.body?.eras ?? req.query.eras),
      setIds: parseCsvParam(req.body?.setIds ?? req.query.setIds),
      sort: parseGradeWorthinessSort(req.body?.sort ?? req.query.sort),
    });
    res.json({ data: result });
  } catch (error: any) {
    logger.error('Grade worthiness lookup failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch grade worthiness' });
  }
});

/**
 * Submit vs buy PSA 10 decision engine.
 */
router.get('/submit-vs-buy', async (req, res) => {
  try {
    const { getSubmitVsBuyLeaderboard } = await import('../../services/slabInsightsService');
    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);
    const result = await getSubmitVsBuyLeaderboard({
      limit,
      cardIds: parseCsvParam(req.query.cardIds),
    });
    res.json({ data: result });
  } catch (error: any) {
    logger.error('Submit vs buy lookup failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch submit vs buy' });
  }
});

router.post('/submit-vs-buy', async (req, res) => {
  try {
    const { getSubmitVsBuyLeaderboard } = await import('../../services/slabInsightsService');
    const limit = Math.min(
      parseInt(String(req.query.limit || req.body?.limit || '20'), 10) || 20,
      100
    );
    const result = await getSubmitVsBuyLeaderboard({
      limit,
      cardIds: parseCsvParam(req.body?.cardIds ?? req.query.cardIds),
    });
    res.json({ data: result });
  } catch (error: any) {
    logger.error('Submit vs buy lookup failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch submit vs buy' });
  }
});

/** Set-level slab heatmap / regime map */
router.get('/set-slab-heatmap', async (req, res) => {
  try {
    const { getSetSlabHeatmap } = await import('../../services/slabInsightsService');
    const limit = Math.min(parseInt(String(req.query.limit || '40'), 10) || 40, 100);
    const minCards = Math.min(parseInt(String(req.query.minCards || '3'), 10) || 3, 50);
    const result = await getSetSlabHeatmap({ limit, minCards });
    res.json({ data: result });
  } catch (error: any) {
    logger.error('Set slab heatmap failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch set slab heatmap' });
  }
});

/** Population regime / pop-report radar */
router.get('/pop-regime', async (req, res) => {
  try {
    const { getPopRegimeRadar } = await import('../../services/slabInsightsService');
    const days = Math.min(parseInt(String(req.query.days || '30'), 10) || 30, 90);
    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 50);
    const result = await getPopRegimeRadar({ days, limit });
    res.json({ data: result });
  } catch (error: any) {
    logger.error('Pop regime radar failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch pop regime' });
  }
});

/** Full grade-ladder economics */
router.get('/grade-ladder', async (req, res) => {
  try {
    const { getGradeLadderLeaderboard } = await import('../../services/slabInsightsService');
    const limit = Math.min(parseInt(String(req.query.limit || '15'), 10) || 15, 50);
    const result = await getGradeLadderLeaderboard({
      limit,
      cardIds: parseCsvParam(req.query.cardIds),
    });
    res.json({ data: result });
  } catch (error: any) {
    logger.error('Grade ladder lookup failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch grade ladder' });
  }
});

/** Crack-and-regrade EV scanner */
router.get('/crack-regrade', async (req, res) => {
  try {
    const { getCrackRegradeScanner } = await import('../../services/slabInsightsService');
    const limit = Math.min(parseInt(String(req.query.limit || '12'), 10) || 12, 50);
    const result = await getCrackRegradeScanner(limit);
    res.json({ data: result });
  } catch (error: any) {
    logger.error('Crack-regrade scanner failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch crack-regrade opportunities' });
  }
});

/** Mark-to-market for owned slab book lots */
router.post('/slab-marks', async (req, res) => {
  try {
    const { getSlabMarksForLots } = await import('../../services/slabInsightsService');
    const lots = Array.isArray(req.body?.lots) ? req.body.lots : [];
    const normalized = lots
      .map((l: any) => ({
        cardId: String(l?.cardId || '').trim(),
        grader: String(l?.grader || 'PSA').trim(),
        grade: String(l?.grade || '10').trim(),
      }))
      .filter((l: { cardId: string }) => l.cardId);
    const marks = await getSlabMarksForLots(normalized);
    res.json({ data: marks, count: marks.length });
  } catch (error: any) {
    logger.error('Slab marks lookup failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch slab marks' });
  }
});

/**
 * Manually trigger the nightly slab-price + population refresh. One request per
 * card serves both tables; data is strictly matched against PriceCharting.
 * ?all=1 runs the full-catalog sweep instead of the priority queue.
 */
router.post('/refresh-graded-data', async (req, res) => {
  try {
    const { runGradedRefresh, runAllCardsRefresh } = await import('../../services/gradedRefreshService');
    const { withDbJobLock } = await import('../../utils/dbJobLock');
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
    const all = String(req.query.all || '') === '1';
    const result = await withDbJobLock(
      'graded-refresh',
      () => (all ? runAllCardsRefresh({ limit, delayMs: 1000 }) : runGradedRefresh(limit)),
      { skipIfBusy: true }
    );
    res.json({ data: result });
  } catch (error: any) {
    logger.error('Graded data refresh failed', { error: error.message });
    res.status(500).json({ error: 'Failed to refresh graded data' });
  }
});

export default router;
