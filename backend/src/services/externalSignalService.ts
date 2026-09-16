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

function dbGet<T>(sql: string, params: unknown[]): Promise<T | undefined> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row as T | undefined);
    });
  });
}

function dbAll<T>(sql: string, params: unknown[]): Promise<T[]> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve((rows || []) as T[]);
    });
  });
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
  try {
    const rows = await dbAll<any>(
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
      [cardName, cardName, setName]
    );
    return rows.map(mapRow);
  } catch (err) {
    logger.warn(`External signal search failed for ${cardName}:`, err);
    return [];
  }
}

async function resolveCardIdentity(cardId: string): Promise<{ cardName: string; setName: string }> {
  const fromMappings = await dbGet<{ cardName?: string; setName?: string }>(
    `SELECT cardName, setName FROM card_mappings WHERE cardId = ? LIMIT 1`,
    [cardId]
  ).catch(() => undefined);

  if (fromMappings?.cardName || fromMappings?.setName) {
    return {
      cardName: fromMappings.cardName ?? '',
      setName: fromMappings.setName ?? '',
    };
  }

  const fromCatalog = await dbGet<{ cardName?: string; setName?: string }>(
    `SELECT cardName, setName FROM catalog_cards WHERE cardId = ? LIMIT 1`,
    [cardId]
  ).catch(() => undefined);

  return {
    cardName: fromCatalog?.cardName ?? '',
    setName: fromCatalog?.setName ?? '',
  };
}

export async function getExternalSignalsForCard(cardId: string): Promise<ExternalSignal[]> {
  try {
    const { cardName, setName } = await resolveCardIdentity(cardId);
    const rows = await dbAll<any>(
      `SELECT * FROM external_market_signals
       WHERE (expires_at IS NULL OR expires_at >= datetime('now'))
         AND (
           card_id = ?
           OR (card_name IS NOT NULL AND ? != '' AND LOWER(card_name) = LOWER(?))
           OR (card_name IS NULL AND card_id IS NULL AND set_name IS NOT NULL
               AND ? != '' AND LOWER(set_name) = LOWER(?))
         )
       ORDER BY relevance_score DESC, created_at DESC
       LIMIT 20`,
      [cardId, cardName, cardName, setName, setName]
    );
    return rows.map(mapRow);
  } catch (err) {
    // Never 500 the Insights UI for missing tables / transient DB errors —
    // return an empty list so the panel can show a calm empty state.
    logger.warn(`External signals lookup failed for ${cardId}:`, err);
    return [];
  }
}
