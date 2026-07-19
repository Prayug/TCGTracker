import { getDb } from '../db/database';
import { logger } from '../utils/logger';

export interface ExternalSignal {
  sourceUrl: string;
  sourceType: string;
  title: string;
  summary: string;
  sentiment: number;
  relevance: number;
  type: string;
  createdAt?: string;
  expiresAt?: string | null;
}

function mapRow(r: any): ExternalSignal {
  return {
    sourceUrl: r.source_url,
    sourceType: r.source_type,
    title: r.title,
    summary: r.summary,
    sentiment: r.sentiment_score,
    relevance: r.relevance_score,
    type: r.risk_type || 'unknown',
    createdAt: r.created_at,
    expiresAt: r.expires_at ?? null,
  };
}

/**
 * Finds active external market signals relevant to a card. Signals are
 * populated by the scraper pipeline (see services/scrapers/) and matched by:
 *  - resolved card_id (via card_mappings/catalog_cards),
 *  - mentioned card name, or
 *  - set-level signals (e.g. upcoming set releases) matching the card's set.
 */
export async function searchExternalSignals(
  cardName: string,
  setName: string
): Promise<ExternalSignal[]> {
  const db = getDb();
  try {
    return await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM external_market_signals
         WHERE (expires_at IS NULL OR expires_at >= datetime('now'))
           AND (
             (card_name IS NOT NULL AND (
               LOWER(card_name) = LOWER(?) OR LOWER(?) LIKE LOWER(card_name) || '%'
             ))
             OR (card_name IS NULL AND card_id IS NULL AND set_name IS NOT NULL
                 AND LOWER(set_name) = LOWER(?))
           )
         ORDER BY relevance_score DESC, created_at DESC
         LIMIT 10`,
        [cardName, cardName, setName],
        (err, rows: any[]) => {
          if (err) return reject(err);
          resolve((rows || []).map(mapRow));
        }
      );
    });
  } catch (err) {
    logger.warn(`External signal search failed for ${cardName}:`, err);
    return [];
  }
}

export async function getExternalSignalsForCard(cardId: string): Promise<ExternalSignal[]> {
  const db = getDb();

  // Resolve the card's name/set so name-matched and set-level signals are included.
  const cardInfo: { cardName?: string; setName?: string } = await new Promise((resolve) => {
    db.get(
      `SELECT cardName, setName FROM card_mappings WHERE cardId = ? LIMIT 1`,
      [cardId],
      (err, row: any) => {
        if (err || !row) return resolve({});
        resolve({ cardName: row.cardName, setName: row.setName });
      }
    );
  });

  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM external_market_signals
       WHERE (expires_at IS NULL OR expires_at >= datetime('now'))
         AND (
           card_id = ?
           OR (card_name IS NOT NULL AND LOWER(card_name) = LOWER(?))
           OR (card_name IS NULL AND card_id IS NULL AND set_name IS NOT NULL
               AND LOWER(set_name) = LOWER(?))
         )
       ORDER BY relevance_score DESC, created_at DESC
       LIMIT 20`,
      [cardId, cardInfo.cardName ?? '', cardInfo.setName ?? ''],
      (err, rows: any[]) => {
        if (err) return reject(err);
        resolve((rows || []).map(mapRow));
      }
    );
  });
}
