import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import {
  fetchPriceChartingHtml,
  searchBestProduct,
  type ProductMatchInput,
} from './priceChartingClient';
import {
  parseSoldGuideSeries,
  type SoldGuidePoint,
  type ParsedChartSeries,
} from './soldGuideHistoryParse';

export const SOLD_GUIDE_SOURCE = 'pricecharting_sold';
export type { SoldGuidePoint, ParsedChartSeries };
export { extractChartDataBlob, parseSoldGuideSeries } from './soldGuideHistoryParse';

async function upsertPriceHistory(
  uniqueIdentifier: string,
  points: SoldGuidePoint[],
  productName?: string
): Promise<number> {
  if (!points.length) return 0;
  const db = getDb();
  let upserted = 0;
  await new Promise<void>((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN');
      const stmt = db.prepare(
        `INSERT INTO price_history (
           uniqueIdentifier, date, price, marketPrice, lowPrice, highPrice,
           volume, source, productName, groupName
         ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, NULL)
         ON CONFLICT(uniqueIdentifier, date, source) DO UPDATE SET
           price = excluded.price,
           marketPrice = excluded.marketPrice,
           productName = COALESCE(excluded.productName, price_history.productName)`
      );
      for (const p of points) {
        stmt.run(
          uniqueIdentifier,
          p.date,
          p.price,
          p.price,
          SOLD_GUIDE_SOURCE,
          productName ?? null,
          (err: Error | null) => {
            if (err) logger.warn('sold-guide upsert failed', { err: err.message, date: p.date });
            else upserted++;
          }
        );
      }
      stmt.finalize((err) => {
        if (err) {
          db.run('ROLLBACK');
          reject(err);
          return;
        }
        db.run('COMMIT', (commitErr) => (commitErr ? reject(commitErr) : resolve()));
      });
    });
  });
  return upserted;
}

export async function upsertGradedHistory(
  cardId: string,
  variantKey: string,
  grade: '9' | '10',
  points: SoldGuidePoint[],
  productId: string | null
): Promise<number> {
  if (!points.length) return 0;
  const db = getDb();
  let upserted = 0;
  await new Promise<void>((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN');
      const stmt = db.prepare(
        `INSERT INTO graded_price_history (
           cardId, variantKey, date, grader, grade, price, soldListings, listedCount, productId, source
         ) VALUES (?, ?, ?, 'psa', ?, ?, NULL, NULL, ?, 'pricecharting')
         ON CONFLICT(cardId, variantKey, date, grader, grade) DO UPDATE SET
           price = excluded.price,
           productId = COALESCE(excluded.productId, graded_price_history.productId)`
      );
      for (const p of points) {
        stmt.run(
          cardId,
          variantKey || 'normal',
          p.date,
          grade,
          p.price,
          productId,
          (err: Error | null) => {
            if (err) logger.warn('graded sold-guide upsert failed', { err: err.message });
            else upserted++;
          }
        );
      }
      stmt.finalize((err) => {
        if (err) {
          db.run('ROLLBACK');
          reject(err);
          return;
        }
        db.run('COMMIT', (commitErr) => (commitErr ? reject(commitErr) : resolve()));
      });
    });
  });
  return upserted;
}

export interface ImportSoldGuideResult {
  matched: boolean;
  productUrl: string | null;
  productId: string | null;
  ungradedPoints: number;
  psa9Points: number;
  psa10Points: number;
  ungradedUpserted: number;
  psa9Upserted: number;
  psa10Upserted: number;
}

/**
 * Resolve a PriceCharting product for the card, scrape chart_data, and persist
 * ungraded sold-guide into `price_history` (source=pricecharting_sold) plus
 * PSA10 into `graded_price_history`.
 */
export async function importSoldGuideHistoryForCard(input: {
  uniqueIdentifier: string;
  cardId: string;
  cardName: string;
  setName?: string;
  cardNumber?: string;
  variantKey?: string;
  game?: 'pokemon' | 'onepiece';
}): Promise<ImportSoldGuideResult> {
  const matchInput: ProductMatchInput = {
    cardName: input.cardName,
    setName: input.setName,
    cardNumber: input.cardNumber,
    variant: input.variantKey,
    game: input.game ?? 'pokemon',
  };

  const match = await searchBestProduct(matchInput);
  if (!match) {
    return {
      matched: false,
      productUrl: null,
      productId: null,
      ungradedPoints: 0,
      psa9Points: 0,
      psa10Points: 0,
      ungradedUpserted: 0,
      psa9Upserted: 0,
      psa10Upserted: 0,
    };
  }

  const html = await fetchPriceChartingHtml(match.url);
  const parsed = parseSoldGuideSeries(html);
  const ungradedUpserted = await upsertPriceHistory(
    input.uniqueIdentifier,
    parsed.ungraded,
    match.title
  );
  const productId = parsed.productId ?? match.productId;
  const psa9Upserted = await upsertGradedHistory(
    input.cardId,
    input.variantKey || 'normal',
    '9',
    parsed.psa9,
    productId
  );
  const psa10Upserted = await upsertGradedHistory(
    input.cardId,
    input.variantKey || 'normal',
    '10',
    parsed.psa10,
    productId
  );

  logger.info('Imported PriceCharting sold-guide history', {
    uid: input.uniqueIdentifier,
    ungraded: ungradedUpserted,
    psa9: psa9Upserted,
    psa10: psa10Upserted,
    productId,
  });

  return {
    matched: true,
    productUrl: match.url,
    productId,
    ungradedPoints: parsed.ungraded.length,
    psa9Points: parsed.psa9.length,
    psa10Points: parsed.psa10.length,
    ungradedUpserted,
    psa9Upserted,
    psa10Upserted,
  };
}
