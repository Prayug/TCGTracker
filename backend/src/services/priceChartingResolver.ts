import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import {
  fetchProductPageData,
  searchBestProduct,
  buildDirectProductUrl,
  verifyProductPage,
  ProductMatchInput,
  ProductMatch,
  PriceChartingPageData,
} from './priceChartingClient';

const queryAll = <T = any>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve((rows || []) as T[]);
    });
  });

const run = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => {
    getDb().run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

/** Persist the learned mapping: our set name -> PriceCharting console name. */
export const learnConsoleName = async (
  ourSetName: string | null | undefined,
  consoleName: string | null | undefined
): Promise<void> => {
  if (!ourSetName || !consoleName) return;
  try {
    await run(
      `INSERT INTO pc_set_mappings (ourSetName, consoleName, learnedAt)
       VALUES (?, ?, ?)
       ON CONFLICT(ourSetName) DO UPDATE SET consoleName = excluded.consoleName`,
      [ourSetName, consoleName, Date.now()]
    );
  } catch (error) {
    logger.warn('Failed to learn console name', { error: (error as Error).message });
  }
};

export const getConsoleName = async (ourSetName: string | null | undefined): Promise<string | null> => {
  if (!ourSetName) return null;
  try {
    const rows = await queryAll<{ consoleName: string }>(
      'SELECT consoleName FROM pc_set_mappings WHERE ourSetName = ?',
      [ourSetName]
    );
    return rows.length > 0 ? rows[0].consoleName : null;
  } catch {
    return null;
  }
};

/**
 * Heuristic guess at a set's PriceCharting console name before any real match
 * has been learned. Used to fetch product pages directly on the first pass;
 * wrong guesses are rejected by strict page verification and cost one extra
 * cheap request. Known exceptions handled explicitly.
 */
export const guessConsoleName = (ourSetName: string | null | undefined): string | null => {
  const name = (ourSetName || '').trim();
  if (!name) return null;
  if (name.toLowerCase() === 'base') return 'Pokemon Base Set';

  const clean = name
    .replace(/^ME:\s*/i, '')
    .replace(/^M:\s*/i, '')
    .replace(/^SVE:\s*/i, '')
    .trim();
  if (!clean) return null;
  if (/^pokemon\b/i.test(clean)) return clean;
  if (!/^[a-z0-9&']/i.test(clean)) return null;
  return `Pokemon ${clean}`;
};

export interface ResolverInput {
  cardName: string;
  setId?: string;
  setName?: string;
  cardNumber?: string;
}

export interface ResolvedProduct {
  match: ProductMatch;
  pageData: PriceChartingPageData;
  direct: boolean;
}

const toMatchInput = (input: ResolverInput): ProductMatchInput => ({
  cardName: input.cardName,
  setName: input.setName || undefined,
  cardNumber: input.cardNumber || undefined,
});

/**
 * Resolve a card to its PriceCharting product: learned console -> direct URL,
 * guessed console -> direct URL, then full search. Direct hits are verified
 * against the parsed page before being trusted. On any success, learns (or
 * confirms) the set's console name so later cards in the set go straight to
 * their product pages.
 */
export const resolveProduct = async (
  input: ResolverInput,
  delayMs: number = 1500
): Promise<ResolvedProduct | null> => {
  const matchInput = toMatchInput(input);

  const consoleName =
    (await getConsoleName(input.setName)) || guessConsoleName(input.setName);
  if (consoleName && input.cardName) {
    const directUrl = buildDirectProductUrl(consoleName, input.cardName, input.cardNumber || undefined);
    try {
      const pageData = await fetchProductPageData(directUrl, delayMs);
      if (verifyProductPage(pageData, matchInput)) {
        await learnConsoleName(input.setName, pageData.setName);
        return {
          match: {
            productId: pageData.productId as string,
            url: directUrl,
            title: pageData.title as string,
            setName: pageData.setName as string,
            matchScore: 100,
          },
          pageData,
          direct: true,
        };
      }
    } catch (error) {
      logger.debug('Direct URL failed, falling back to search', {
        cardName: input.cardName,
        url: directUrl,
        error: (error as Error).message,
      });
    }
  }

  const match = await searchBestProduct(matchInput, delayMs);
  if (!match) return null;

  const pageData = await fetchProductPageData(match.url, delayMs);
  if (!verifyProductPage(pageData, matchInput)) {
    logger.debug('Product page failed verification', { cardName: input.cardName });
    return null;
  }

  await learnConsoleName(input.setName, match.setName);
  return { match, pageData, direct: false };
};
