import { Router } from 'express';
import { logger } from '../utils/logger';
import {
  resolveSetMeta,
  fetchSetCatalogRows,
  rowToSetCardDto,
  computeSetSummary,
  fetchSetValueHistory,
  type ValueHistoryRange,
} from '../services/setTrackerService';

const router = Router();

const parseOwnedIds = (raw: unknown): Set<string> => {
  if (typeof raw !== 'string' || !raw.trim()) return new Set();
  return new Set(
    raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  );
};

/**
 * GET /api/cards/sets/:setId/cards — full set checklist with latest prices
 */
router.get('/sets/:setId/cards', async (req, res) => {
  try {
    const { setId } = req.params;
    if (!setId?.trim()) {
      return res.status(400).json({ error: 'Set ID is required' });
    }

    const setMeta = await resolveSetMeta(setId);
    if (!setMeta) {
      return res.status(404).json({ error: 'Set not found', setId });
    }

    const rows = await fetchSetCatalogRows(setId);
    const cards = rows.map((row) => rowToSetCardDto(row, setMeta));
    const ownedIds = parseOwnedIds(req.query.ownedIds);

    const data = cards.map((card) => ({
      ...card,
      owned: ownedIds.has(card.id),
    }));

    res.json({
      set: setMeta,
      data,
      count: data.length,
      source: 'catalog',
    });
  } catch (error) {
    logger.error('Error fetching set cards:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/cards/sets/:setId/summary — completion and value metrics
 * Query: ownedIds (comma-separated card IDs from vault)
 */
router.get('/sets/:setId/summary', async (req, res) => {
  try {
    const { setId } = req.params;
    if (!setId?.trim()) {
      return res.status(400).json({ error: 'Set ID is required' });
    }

    const setMeta = await resolveSetMeta(setId);
    if (!setMeta) {
      return res.status(404).json({ error: 'Set not found', setId });
    }

    const rows = await fetchSetCatalogRows(setId);
    const cards = rows.map((row) => rowToSetCardDto(row, setMeta));
    const ownedIds = parseOwnedIds(req.query.ownedIds);
    const wishlistIds = parseOwnedIds(req.query.wishlistIds);

    const summary = computeSetSummary(cards, ownedIds, wishlistIds);

    res.json({ set: setMeta, summary });
  } catch (error) {
    logger.error('Error fetching set summary:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/cards/sets/:setId/value-history — aggregated set value over time
 * Query: range = 30d | 90d | 1y | all
 */
router.get('/sets/:setId/value-history', async (req, res) => {
  try {
    const { setId } = req.params;
    const range = (req.query.range as ValueHistoryRange) || '90d';
    const validRanges: ValueHistoryRange[] = ['30d', '90d', '1y', 'all'];

    if (!setId?.trim()) {
      return res.status(400).json({ error: 'Set ID is required' });
    }

    if (!validRanges.includes(range)) {
      return res.status(400).json({
        error: 'Invalid range',
        valid: validRanges,
      });
    }

    const setMeta = await resolveSetMeta(setId);
    if (!setMeta) {
      return res.status(404).json({ error: 'Set not found', setId });
    }

    const history = await fetchSetValueHistory(setId, range);

    res.json({
      setId: setMeta.id,
      setName: setMeta.name,
      range,
      data: history,
      count: history.length,
      disclaimer:
        'Values sum cards with price history only; sparse dates use last-known price carry-forward.',
    });
  } catch (error) {
    logger.error('Error fetching set value history:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    });
  }
});

export default router;
