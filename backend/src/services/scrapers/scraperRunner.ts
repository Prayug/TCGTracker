import { getDb } from '../../db/database';
import { logger } from '../../utils/logger';
import { ScrapedSignal, ScrapeResult } from './types';
import { PokemonTcgioSetScraper } from './pokemonTcgioSetScraper';
import { RedditSentimentScraper } from './redditSentimentScraper';
import { YoutubeScraper } from './youtubeScraper';
import { PkmnPricesNewsScraper } from './pkmnPricesNewsScraper';
import { SetCalendarScraper } from './setCalendarScraper';

/**
 * Card name matching keywords for fuzzy matching signals to cards.
 */
const CARD_NAME_PATTERNS: Record<string, string[]> = {
  'charizard': ['charizard'],
  'pikachu': ['pikachu'],
  'mew': ['mew'],
  'lugia': ['lugia'],
  'umbreon': ['umbreon'],
  'espeon': ['espeon'],
  'rayquaza': ['rayquaza'],
  'arceus': ['arceus'],
  'giratina': ['giratina'],
  'palkia': ['palkia'],
  'darkrai': ['darkrai'],
};

/**
 * Matches a signal to a card ID by searching catalog_cards.
 */
async function matchSignalToCard(
  signal: ScrapedSignal
): Promise<{ cardId: string; cardName: string } | null> {
  const db = getDb();

  // Try to match by card name if provided
  if (signal.cardName) {
    const normalizedName = signal.cardName.toLowerCase().trim();
    const rows: any[] = await new Promise((resolve, reject) => {
      db.all(
        `SELECT cardId, cardName FROM catalog_cards
         WHERE LOWER(cardName) LIKE ?
         ORDER BY
           CASE WHEN LOWER(cardName) = ? THEN 0
                WHEN LOWER(cardName) LIKE ? THEN 1
                ELSE 2
           END
         LIMIT 1`,
        [`%${normalizedName}%`, normalizedName, `${normalizedName}%`],
        (err, r) => err ? reject(err) : resolve(r || [])
      );
    });
    if (rows.length > 0) {
      return { cardId: rows[0].cardId, cardName: rows[0].cardName };
    }
  }

  // Try to match by set name if provided
  if (signal.setName) {
    const normalizedSet = signal.setName.toLowerCase().trim();
    const rows: any[] = await new Promise((resolve, reject) => {
      db.all(
        `SELECT cardId, cardName FROM catalog_cards
         WHERE LOWER(setName) LIKE ?
         ORDER BY cardName ASC
         LIMIT 1`,
        [`%${normalizedSet}%`],
        (err, r) => err ? reject(err) : resolve(r || [])
      );
    });
    if (rows.length > 0) {
      return { cardId: rows[0].cardId, cardName: rows[0].cardName };
    }
  }

  return null;
}

/**
 * Deduplicates signals by (source_url, card_id) to avoid storing duplicates.
 */
function deduplicateSignals(signals: ScrapedSignal[]): ScrapedSignal[] {
  const seen = new Set<string>();
  const unique: ScrapedSignal[] = [];

  for (const signal of signals) {
    const key = `${signal.sourceUrl}|${signal.cardId || 'global'}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(signal);
    }
  }

  return unique;
}

/**
 * Runs all registered scrapers, matches signals to cards, deduplicates,
 * and stores results in the external_market_signals table.
 */
export async function runSignalScrape(): Promise<ScrapeResult> {
  const scrapers = [
    new PokemonTcgioSetScraper(),
    new RedditSentimentScraper(),
    new YoutubeScraper(),
    new PkmnPricesNewsScraper(),
    new SetCalendarScraper(),
  ];

  let allSignals: ScrapedSignal[] = [];
  const errors: string[] = [];

  // Run scrapers sequentially to respect rate limits
  for (const scraper of scrapers) {
    try {
      logger.info(`Running scraper: ${scraper.name}`);
      const signals = await scraper.scrape();
      allSignals.push(...signals);
      logger.info(`Scraper ${scraper.name} returned ${signals.length} signals`);
    } catch (err) {
      const msg = `Scraper ${scraper.name} failed: ${(err as Error).message}`;
      logger.error(msg);
      errors.push(msg);
    }
  }

  // Match signals to card IDs
  for (const signal of allSignals) {
    const match = await matchSignalToCard(signal);
    if (match) {
      signal.cardId = match.cardId;
      signal.cardName = match.cardName;
    }
  }

  // Deduplicate
  const uniqueSignals = deduplicateSignals(allSignals);
  logger.info(`Total unique signals after dedup: ${uniqueSignals.length}`);

  // Store in database
  const db = getDb();
  let stored = 0;

  const insertStmt = `INSERT INTO external_market_signals
    (card_id, source_url, source_type, title, summary, sentiment_score, relevance_score, risk_type, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  for (const signal of uniqueSignals) {
    try {
      await new Promise<void>((resolve, reject) => {
        db.run(insertStmt, [
          signal.cardId || null,
          signal.sourceUrl,
          signal.sourceType,
          signal.title,
          signal.summary,
          Math.round(signal.sentiment * 100), // store as integer [-100, 100]
          Math.round(signal.relevance * 100),
          signal.riskType || null,
          signal.expiresAt || null,
        ], function (err) {
          if (err) reject(err);
          else resolve();
        });
      });
      stored++;
    } catch (err) {
      logger.warn(`Failed to store signal: ${(err as Error).message}`);
    }
  }

  // Expire old signals
  const expireResult = await new Promise<number>((resolve) => {
    db.run(
      `DELETE FROM external_market_signals WHERE expires_at IS NOT NULL AND expires_at < datetime('now')`,
      [],
      function (err) {
        resolve(err ? 0 : this.changes);
      }
    );
  });
  if (expireResult > 0) {
    logger.info(`Expired ${expireResult} old signals`);
  }

  logger.info(`Signal scrape complete: ${uniqueSignals.length} scraped, ${stored} stored`);
  return { scraped: uniqueSignals.length, stored, errors };
}
