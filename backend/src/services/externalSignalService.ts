import { getDb } from '../db/database';
import { logger } from '../utils/logger';

const SIGNAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface ExternalSignal {
  sourceUrl: string;
  sourceType: string;
  title: string;
  summary: string;
  sentiment: number;
  relevance: number;
  type: string;
}

/** External market signals are not yet integrated — returns cached or empty. */
export async function searchExternalSignals(
  cardName: string,
  setName: string
): Promise<ExternalSignal[]> {
  try {
    const cached = await getCachedSignals(cardName, setName);
    if (cached) return cached;
    return [];
  } catch (err) {
    logger.warn(`External signal search failed for ${cardName}:`, err);
    return [];
  }
}

function getCachedSignals(cardName: string, setName: string): Promise<ExternalSignal[] | null> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM external_market_signals
       WHERE card_id = ? AND created_at >= datetime('now', '-1 day')
       ORDER BY created_at DESC LIMIT 10`,
      [`ext|${cardName}|${setName}`],
      (err, rows: any[]) => {
        if (err) return reject(err);
        if (!rows || rows.length === 0) return resolve(null);
        resolve(
          rows.map((r) => ({
            sourceUrl: r.source_url,
            sourceType: r.source_type,
            title: r.title,
            summary: r.summary,
            sentiment: r.sentiment_score,
            relevance: r.relevance_score,
            type: r.risk_type || 'unknown',
          }))
        );
      }
    );
  });
}

export async function getExternalSignalsForCard(cardId: string): Promise<ExternalSignal[]> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM external_market_signals
       WHERE card_id = ? AND (expires_at IS NULL OR expires_at >= datetime('now'))
       ORDER BY created_at DESC LIMIT 20`,
      [cardId],
      (err, rows: any[]) => {
        if (err) return reject(err);
        resolve(
          rows.map((r) => ({
            sourceUrl: r.source_url,
            sourceType: r.source_type,
            title: r.title,
            summary: r.summary,
            sentiment: r.sentiment_score,
            relevance: r.relevance_score,
            type: r.risk_type || 'unknown',
          }))
        );
      }
    );
  });
}
