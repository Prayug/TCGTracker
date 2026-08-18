import { Router, Response } from 'express';
import { getDb } from '../../db/database';
import { logger } from '../../utils/logger';
import { getImageColumnSelectFragment } from '../../services/cardImageUtils';
import { mapLocalRowsToPokemonCards } from '../../services/cardDatabase';
import { dedupePackPoolCards } from '../../utils/packPoolDedupe';
import {
  buildStratifiedPackPoolSql,
  packEraBandFromSet,
  stratifiedPoolSliceSizes,
  PACK_ERA_BANDS,
} from '../../utils/packEraBand';

const router = Router();

// Exclude fake "sets" that are actually TCGPlayer product categories
// These will NEVER have images in the Pokemon API
const EXCLUDED_FAKE_SET_NAMES = [
  'World Championship Decks',
  'Miscellaneous Cards & Products',
  'Prize Pack Series Cards',
  'Deck Exclusives',
  'League & Championship Cards',
  'Jumbo Cards',
  'Blister Exclusives',
  'McDonald%',  // McDonald's promos
  'Burger King Promos',
  'Countdown Calendar Promos',
  'Professor Program Promos',
  'Best of Promos',
  'Pikachu World Collection Promos',
  'ME01: Mega Evolution',
  'ME: Mega Evolution Promo',
  'MEE: Mega Evolution Energies',
  'SVE: Scarlet & Violet Energies',
];

const EXCLUDED_FAKE_SET_IDS = [
  'worldchampionshipdecks',
  'miscellaneouscardsproducts',
  'prizepackseriescards',
  'deckexclusives',
  'leaguechampionshipcards',
  'jumbocards',
  'blisterexclusives',
];

// Exclude all promo sets (any set with "promo" in name or ID)
const PROMO_EXCLUSION_CLAUSE = `cm.setName NOT LIKE '%promo%' AND cm.setName NOT LIKE '%Promo%' AND cm.setId NOT LIKE '%promo%' AND cm.setId NOT LIKE '%Promo%'`;

function buildPackPoolExclusions(): { exclusionSql: string; exclusionParams: string[] } {
  const exclusionClauses: string[] = [];
  const exclusionParams: string[] = [];

  for (const setName of EXCLUDED_FAKE_SET_NAMES) {
    if (setName.includes('%')) {
      exclusionClauses.push('cm.setName NOT LIKE ?');
    } else {
      exclusionClauses.push('cm.setName != ?');
    }
    exclusionParams.push(setName);
  }

  for (const setId of EXCLUDED_FAKE_SET_IDS) {
    exclusionClauses.push('cm.setId != ?');
    exclusionParams.push(setId);
  }

  exclusionClauses.push(PROMO_EXCLUSION_CLAUSE);
  return { exclusionSql: exclusionClauses.join(' AND '), exclusionParams };
}

async function attachPsa10Prices(
  db: ReturnType<typeof getDb>,
  cards: any[]
): Promise<any[]> {
  const cardIds = [...new Set(cards.map((c: any) => c.id).filter(Boolean))] as string[];
  const psa10ByCardId = new Map<string, number>();
  const BATCH = 400;

  for (let i = 0; i < cardIds.length; i += BATCH) {
    const batch = cardIds.slice(i, i + BATCH);
    const placeholders = batch.map(() => '?').join(',');
    const gradedRows = await new Promise<
      Array<{ cardId: string; price: number }>
    >((resolve, reject) => {
      db.all(
        `SELECT cardId, price
         FROM graded_prices
         WHERE cardId IN (${placeholders})
           AND grader = 'psa'
           AND grade = '10'
           AND verified = 1
           AND price IS NOT NULL
           AND price > 0`,
        batch,
        (gradedErr, result) => {
          if (gradedErr) reject(gradedErr);
          else resolve((result || []) as Array<{ cardId: string; price: number }>);
        }
      );
    });
    for (const gr of gradedRows) {
      if (typeof gr.price === 'number' && gr.price > 0) {
        psa10ByCardId.set(gr.cardId, gr.price);
      }
    }
  }

  return cards.map((card: any) => {
    const psa10Price = psa10ByCardId.get(card.id);
    return psa10Price != null ? { ...card, psa10Price } : card;
  });
}

async function mapAndSendPoolCards(
  res: Response,
  db: ReturnType<typeof getDb>,
  rows: any[],
  withSlabs: boolean
): Promise<void> {
  // Use the helper function to properly map cards with stored images
  let cards = await mapLocalRowsToPokemonCards(rows);

  if (withSlabs && cards.length > 0) {
    cards = await attachPsa10Prices(db, cards);
  }

  cards = dedupePackPoolCards(cards).map((card) => ({
    ...card,
    eraBand: packEraBandFromSet(card.set),
  }));

  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({
    data: cards,
    count: cards.length,
    source: 'local_database',
    includeSlabs: withSlabs,
  });
}

/**
 * Get a random pool of cards with latest market prices from local DB.
 * Pass includeSlabs=1 to attach verified PSA 10 prices (psa10Price) via a
 * second batched lookup — keep this off the RANDOM() query so pack opens
 * don't hang on a graded_prices join.
 */
router.get('/pool', async (req, res) => {
  try {
    const db = getDb();

    const { limit = '250', minPrice = '0', maxPrice = '100000', includeSlabs } = req.query;
    const poolLimit = Math.min(parseInt(limit as string) || 250, 10000); // Increased max to 10000 for better pool diversity
    const withSlabs =
      includeSlabs === '1' ||
      includeSlabs === 'true' ||
      includeSlabs === 'yes';

    const imageColumns = await getImageColumnSelectFragment();
    const { exclusionSql, exclusionParams } = buildPackPoolExclusions();

    // Canonicalize duplicate API/TCGCSV rows, then take equal random slices
    // from each era band (bulk + chase) so EX-era cards cannot fill the pool.
    const sql = buildStratifiedPackPoolSql(imageColumns, exclusionSql);
    const { bulk, chase } = stratifiedPoolSliceSizes(poolLimit);
    const sliceLimits = PACK_ERA_BANDS.flatMap(() => [bulk, chase]);

    db.all(sql, [minPrice, maxPrice, ...exclusionParams, ...sliceLimits], async (err, rows: any[]) => {
      if (err) {
        logger.error('Error fetching random card pool:', err);
        return res.status(500).json({
          error: 'Database error',
          message: err.message
        });
      }

      try {
        await mapAndSendPoolCards(res, db, rows, withSlabs);
      } catch (mapErr) {
        logger.error('Error mapping/enriching card pool:', mapErr);
        res.status(500).json({
          error: 'Internal server error',
          message: (mapErr as Error).message,
        });
      }
    });
  } catch (error) {
    logger.error('Error building card pool:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: (error as Error).message 
    });
  }
});

export default router;
