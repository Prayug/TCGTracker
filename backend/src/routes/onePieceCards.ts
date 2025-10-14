import { Router } from 'express';
import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import { allDbRows, getDbRow } from '../utils/dbAsync';
import {
  getAllOptcgCards,
  getOptcgSetCards,
  getOptcgSets,
} from '../services/providers/onePieceOptcgClient';
import { buildOnePieceCatalogId, isOnePieceCatalogId } from '../services/onePieceCatalogId';
import { enrichOnePieceApiCards } from '../services/onePiecePriceResolver';
import {
  cardMatchesQuery,
  mapRawToApiCard,
  mapRowToApiCard,
  OnePieceCatalogRow,
} from '../services/onePieceMapper';

const router = Router();

router.get('/onepiece', async (req, res) => {
  try {
    const { query, setId, limit = '500' } = req.query;

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return res.status(400).json({ error: 'Query parameter with at least 2 characters is required.' });
    }

    const sanitizedQuery = query.trim();
    const normalizedSetId =
      typeof setId === 'string' && setId.trim().length > 0 ? setId.trim() : undefined;
    const searchLimit = Math.min(Math.max(parseInt(limit as string, 10) || 500, 1), 3000);

    const allCards = await getAllOptcgCards();
    let matches = allCards.filter((raw) => cardMatchesQuery(raw, sanitizedQuery));

    if (normalizedSetId) {
      matches = matches.filter(
        (c) => c.set_id === normalizedSetId || c.set_name.toLowerCase().includes(normalizedSetId.toLowerCase())
      );
    }

    const apiCards = matches.map((raw) => mapRawToApiCard(raw));
    const cards = await enrichOnePieceApiCards(apiCards.slice(0, searchLimit));

    logger.info(
      `One Piece search: ${cards.length}/${apiCards.length} results for "${sanitizedQuery}" (${allCards.length} catalog)`
    );

    res.json({
      data: cards,
      count: cards.length,
      totalMatches: apiCards.length,
      catalogSize: allCards.length,
      source: 'optcg_full_catalog_tcgplayer_enriched',
    });
  } catch (error) {
    logger.error('One Piece card search failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    });
  }
});

router.get('/onepiece/sets', async (_req, res) => {
  try {
    const liveSets = await getOptcgSets();
    const db = getDb();
    const localCounts = await allDbRows<{ setId: string; cardCount: number }>(
      db,
      `SELECT setId, COUNT(*) AS cardCount FROM onepiece_catalog GROUP BY setId`
    );
    const countMap = new Map(localCounts.map((r) => [r.setId, r.cardCount]));

    res.json({
      data: liveSets.map((s) => ({
        id: s.set_id,
        name: s.set_name,
        total: countMap.get(s.set_id),
      })),
      count: liveSets.length,
      source: 'optcg_live',
    });
  } catch (error) {
    logger.error('One Piece sets fetch failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    });
  }
});

router.get('/onepiece/stats', async (_req, res) => {
  try {
    const cards = await getAllOptcgCards();
    res.json({
      totalCards: cards.length,
      sources: {
        note: 'Includes booster sets, starter decks, promos, and Don!! cards from OPTCG bulk endpoints',
      },
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/onepiece/card/:catalogId', async (req, res) => {
  try {
    const catalogId = decodeURIComponent(req.params.catalogId);
    const allCards = await getAllOptcgCards();

    if (isOnePieceCatalogId(catalogId)) {
      const db = getDb();
      const row = await getDbRow<OnePieceCatalogRow>(
        db,
        `SELECT
          oc.*,
          latest.marketPrice AS latestMarketPrice,
          latest.inventoryPrice AS latestInventoryPrice
         FROM onepiece_catalog oc
         LEFT JOIN (
           SELECT oph1.catalogId, oph1.marketPrice, oph1.inventoryPrice
           FROM onepiece_price_history oph1
           INNER JOIN (
             SELECT catalogId, MAX(date) AS maxDate
             FROM onepiece_price_history
             GROUP BY catalogId
           ) latest_dates
             ON oph1.catalogId = latest_dates.catalogId AND oph1.date = latest_dates.maxDate
         ) latest ON oc.catalogId = latest.catalogId
         WHERE oc.catalogId = ?`,
        [catalogId]
      );

      if (row) {
        const enriched = await enrichOnePieceApiCards([mapRowToApiCard(row)]);
        return res.json({ data: enriched[0], source: 'local_database_tcgplayer_enriched' });
      }

      const live = allCards.find((c) => buildOnePieceCatalogId(c) === catalogId);
      if (live) {
        const enriched = await enrichOnePieceApiCards([mapRawToApiCard(live)]);
        return res.json({ data: enriched[0], source: 'optcg_full_catalog_tcgplayer_enriched' });
      }
    }

    const cardSetId = catalogId;
    const db = getDb();
    const rows = await allDbRows<OnePieceCatalogRow>(
      db,
      `SELECT oc.*,
          latest.marketPrice AS latestMarketPrice,
          latest.inventoryPrice AS latestInventoryPrice
       FROM onepiece_catalog oc
       LEFT JOIN (
         SELECT oph1.catalogId, oph1.marketPrice, oph1.inventoryPrice
         FROM onepiece_price_history oph1
         INNER JOIN (
           SELECT catalogId, MAX(date) AS maxDate FROM onepiece_price_history GROUP BY catalogId
         ) latest_dates ON oph1.catalogId = latest_dates.catalogId AND oph1.date = latest_dates.maxDate
       ) latest ON oc.catalogId = latest.catalogId
       WHERE oc.cardSetId = ?`,
      [cardSetId]
    );

    if (rows.length > 0) {
      const sorted = await enrichOnePieceApiCards(
        rows.map((row) => mapRowToApiCard(row)).sort((a, b) => (b.marketPrice ?? 0) - (a.marketPrice ?? 0))
      );
      return res.json({ data: sorted[0], variants: sorted, source: 'local_database_tcgplayer_enriched' });
    }

    const liveVariants = await enrichOnePieceApiCards(
      allCards
        .filter((c) => c.card_set_id === cardSetId)
        .map((raw) => mapRawToApiCard(raw))
        .sort((a, b) => (b.marketPrice ?? 0) - (a.marketPrice ?? 0))
    );

    if (!liveVariants.length) {
      return res.status(404).json({ error: 'Card not found', catalogId: cardSetId });
    }

    res.json({
      data: liveVariants[0],
      variants: liveVariants,
      source: 'optcg_full_catalog_tcgplayer_enriched',
    });
  } catch (error) {
    logger.error(`One Piece card fetch failed for ${req.params.catalogId}:`, error);
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    });
  }
});

router.get('/onepiece/set/:setId', async (req, res) => {
  try {
    const setId = decodeURIComponent(req.params.setId);
    const rawCards = await getOptcgSetCards(setId);
    const cards = await enrichOnePieceApiCards(rawCards.map((raw) => mapRawToApiCard(raw)));

    res.json({
      data: cards,
      count: cards.length,
      source: 'optcg_live_tcgplayer_enriched',
    });
  } catch (error) {
    logger.error(`One Piece set cards fetch failed for ${req.params.setId}:`, error);
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    });
  }
});

export default router;
