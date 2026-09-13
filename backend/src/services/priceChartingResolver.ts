import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import { setLooksLikeSubsetPrint, setsSharePrintFamily } from '../utils/setPrintFamily';
import {
  fetchProductPageData,
  fetchPriceChartingHtml,
  searchBestProduct,
  buildDirectProductUrl,
  verifyProductPage,
  isProductPageHtml,
  expectedPcFinishFamily,
  normalize,
  normalizeCardNumber,
  ProductMatchInput,
  ProductMatch,
  PriceChartingPageData,
} from './priceChartingClient';
import {
  guessOnePieceConsoleName,
  expectedOpPrintFamily,
  opFamilyAllowsSetMismatch,
  opSetNamesMatch,
} from './onePiecePriceCharting';

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

/** Persist the learned mapping: our set name + language -> PriceCharting console name. */
export const learnConsoleName = async (
  ourSetName: string | null | undefined,
  consoleName: string | null | undefined,
  language: string = 'en'
): Promise<void> => {
  if (!ourSetName || !consoleName) return;
  const lang = (language || 'en').toLowerCase();
  try {
    await run(
      `INSERT INTO pc_set_mappings (ourSetName, language, consoleName, learnedAt)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(ourSetName, language) DO UPDATE SET consoleName = excluded.consoleName`,
      [ourSetName, lang, consoleName, Date.now()]
    );
  } catch (error) {
    logger.warn('Failed to learn console name', { error: (error as Error).message });
  }
};

export const getConsoleName = async (
  ourSetName: string | null | undefined,
  language: string = 'en'
): Promise<string | null> => {
  if (!ourSetName) return null;
  const lang = (language || 'en').toLowerCase();
  try {
    const rows = await queryAll<{ consoleName: string }>(
      'SELECT consoleName FROM pc_set_mappings WHERE ourSetName = ? AND language = ?',
      [ourSetName, lang]
    );
    return rows.length > 0 ? rows[0].consoleName : null;
  } catch {
    return null;
  }
};

/**
 * Heuristic guess at a set's PriceCharting console name before any real match
 * has been learned. Known exceptions handled explicitly.
 */
export const guessConsoleName = (
  ourSetName: string | null | undefined,
  language: string = 'en',
  game: 'pokemon' | 'onepiece' = 'pokemon'
): string | null => {
  const name = (ourSetName || '').trim();
  if (!name) return null;
  if (game === 'onepiece') return guessOnePieceConsoleName(name);
  const lang = (language || 'en').toLowerCase();

  if (lang === 'ja') {
    // Seeded mappings cover Japanese display names; when we already have an
    // English set label, prefix with Pokemon Japanese.
    if (/^pokemon\s+japanese\b/i.test(name)) return name;
    if (/^[a-z0-9&']/i.test(name)) {
      const clean = name.replace(/^pokemon\b/i, '').trim();
      return `Pokemon Japanese ${clean || name}`;
    }
    // Non-ASCII Japanese set names need a learned/seeded mapping.
    return null;
  }

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
  language?: string;
  /** ASCII name for matching (preferred over cardName for JA). */
  matchName?: string;
  /** TCGPlayer finish (reverseHolofoil, holofoil, 1stEdition, …) or OP print family. */
  variant?: string;
  game?: 'pokemon' | 'onepiece';
  /** OPTCG image id used to distinguish Parallel / Manga / Wanted prints. */
  cardImageId?: string;
}

export interface ResolvedProduct {
  match: ProductMatch;
  pageData: PriceChartingPageData;
  direct: boolean;
  /** True when reverse/1st was aliased onto an untagged PC product (no finish SKU). */
  finishAliasedToStandard?: boolean;
}

const toMatchInput = (input: ResolverInput): ProductMatchInput => ({
  cardName: input.matchName || input.cardName,
  setName: input.setName || undefined,
  cardNumber: input.cardNumber || undefined,
  variant: input.variant || undefined,
  game: input.game || 'pokemon',
  cardImageId: input.cardImageId || undefined,
});

/**
 * TCGCSV SKUs often omit collector numbers. If catalog has exactly one card
 * with this name in the same print family (Hidden Fates vs Shiny Vault), use it.
 */
export const inferCardNumberFromCatalog = async (
  input: ResolverInput
): Promise<string | undefined> => {
  if (input.cardNumber && String(input.cardNumber).trim()) return input.cardNumber;
  const nameKey = normalize(input.matchName || input.cardName);
  if (!nameKey) return undefined;
  const lang = (input.language || 'en').toLowerCase();
  try {
    const rows = await queryAll<{ cardNumber: string; setName: string }>(
      `SELECT cardNumber, setName FROM catalog_cards
       WHERE (
           REPLACE(REPLACE(LOWER(IFNULL(cardName, '')), '-', ''), ' ', '') = ?
           OR REPLACE(REPLACE(LOWER(IFNULL(matchName, '')), '-', ''), ' ', '') = ?
         )
         AND IFNULL(cardNumber, '') != ''
         AND COALESCE(language, 'en') = ?`,
      [nameKey, nameKey, lang]
    );
    const compatible = rows.filter((r) => {
      if (setLooksLikeSubsetPrint(r.setName) !== setLooksLikeSubsetPrint(input.setName)) {
        return false;
      }
      if (!input.setName) return true;
      return setsSharePrintFamily(r.setName, input.setName);
    });
    const nums = [
      ...new Set(compatible.map((r) => normalizeCardNumber(r.cardNumber)).filter(Boolean)),
    ];
    if (nums.length !== 1) return undefined;
    return compatible[0].cardNumber;
  } catch {
    return undefined;
  }
};

/** Persist a learned ASCII matchName onto catalog + mappings after a successful PC hit. */
export const learnMatchName = async (
  cardName: string | null | undefined,
  setName: string | null | undefined,
  productTitle: string | null | undefined,
  language: string = 'ja'
): Promise<void> => {
  if (!cardName || !productTitle || language !== 'ja') return;
  // PriceCharting titles look like "Charizard EX #201 Pokemon Japanese ..."
  const title = productTitle
    .replace(/\s*#\d+.*$/i, '')
    .replace(/\s+Pokemon\b.*$/i, '')
    .trim();
  if (!title || !/^[a-z0-9]/i.test(title)) return;
  try {
    await run(
      `UPDATE catalog_cards SET matchName = ?
       WHERE cardName = ? AND COALESCE(language, 'en') = 'ja'
         AND (matchName IS NULL OR matchName = cardName OR matchName = '')`,
      [title, cardName]
    );
    if (setName) {
      await run(
        `UPDATE card_mappings SET matchName = ?
         WHERE cardName = ? AND setName = ? AND COALESCE(language, 'en') = 'ja'
           AND (matchName IS NULL OR matchName = cardName OR matchName = '')`,
        [title, cardName, setName]
      );
    }
  } catch (error) {
    logger.debug('Failed to learn matchName', { error: (error as Error).message });
  }
};

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
  const language = (input.language || 'en').toLowerCase();
  const game = input.game || 'pokemon';
  const mappingLang = game === 'onepiece' ? 'onepiece' : language;
  const inferredNumber =
    game === 'onepiece' ? input.cardNumber : await inferCardNumberFromCatalog(input);
  const resolvedInput: ResolverInput = {
    ...input,
    game,
    language,
    cardNumber: inferredNumber || input.cardNumber,
    matchName: input.matchName || input.cardName,
  };
  const nameForUrl = resolvedInput.matchName || resolvedInput.cardName;

  const consoleName =
    (await getConsoleName(resolvedInput.setName, mappingLang)) ||
    guessConsoleName(resolvedInput.setName, language, game);

  const shouldLearnConsole = (
    matchInput: ProductMatchInput,
    matchedSet: string | null | undefined
  ): boolean => {
    if (game !== 'onepiece') return true;
    const family = expectedOpPrintFamily(matchInput);
    if (
      opFamilyAllowsSetMismatch(family) &&
      !opSetNamesMatch(matchedSet || '', matchInput.setName || '')
    ) {
      return false;
    }
    return true;
  };

  const attemptResolve = async (
    matchInput: ProductMatchInput,
    directVariant: string | undefined,
    finishAliasedToStandard: boolean
  ): Promise<ResolvedProduct | null> => {
    if (consoleName && nameForUrl) {
      const directUrl = buildDirectProductUrl(
        consoleName,
        nameForUrl,
        resolvedInput.cardNumber || undefined,
        directVariant,
        { game }
      );
      try {
        const pageData = await fetchProductPageData(directUrl, delayMs);
        if (verifyProductPage(pageData, matchInput, directUrl)) {
          if (shouldLearnConsole(matchInput, pageData.setName)) {
            await learnConsoleName(input.setName, pageData.setName, mappingLang);
          }
          await learnMatchName(input.cardName, input.setName, pageData.title, language);
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
            finishAliasedToStandard,
          };
        }
      } catch (error) {
        logger.debug('Direct URL failed, falling back to search', {
          cardName: nameForUrl,
          url: directUrl,
          error: (error as Error).message,
        });
      }
    }

    const match = await searchBestProduct(matchInput, delayMs);
    if (!match) return null;

    const pageData = await fetchProductPageData(match.url, delayMs);
    if (!verifyProductPage(pageData, matchInput, match.url)) {
      logger.debug('Product page failed verification', { cardName: nameForUrl });
      return null;
    }

    if (shouldLearnConsole(matchInput, match.setName)) {
      await learnConsoleName(input.setName, match.setName, mappingLang);
    }
    await learnMatchName(input.cardName, input.setName, pageData.title || match.title, language);
    return { match, pageData, direct: false, finishAliasedToStandard };
  };

  const strictInput = toMatchInput(resolvedInput);
  // For JA Pokemon, PC titles use English console names — prefer those for set matching.
  if (game !== 'onepiece' && consoleName && language === 'ja') {
    strictInput.setName = consoleName.replace(/^Pokemon\s+/i, '');
  }

  const strict = await attemptResolve(strictInput, resolvedInput.variant, false);
  if (strict) return strict;
  // One Piece reprint families must not fall back to the untagged base SKU.
  if (game === 'onepiece') return null;

  const wantFinish = expectedPcFinishFamily(resolvedInput.variant);
  if (wantFinish === 'standard') return null;

  // Strict finish match failed. Only alias onto the untagged PC product when
  // PriceCharting has no dedicated finish page (Southern Islands, etc.).
  // If a reverse/1st URL exists, never fall back — that was the Wobbuffet bug.
  if (!consoleName || !nameForUrl) return null;

  const finishUrl = buildDirectProductUrl(
    consoleName,
    nameForUrl,
    resolvedInput.cardNumber || undefined,
    resolvedInput.variant,
    { game }
  );
  try {
    const finishHtml = await fetchPriceChartingHtml(finishUrl, delayMs);
    if (isProductPageHtml(finishHtml)) {
      logger.debug('Finish-specific PC product exists; refusing standard alias', {
        cardName: nameForUrl,
        finishUrl,
        wantFinish,
      });
      return null;
    }
  } catch (error) {
    logger.debug('Finish URL probe failed; attempting standard alias', {
      cardName: nameForUrl,
      finishUrl,
      error: (error as Error).message,
    });
  }

  const aliasInput: ProductMatchInput = {
    ...strictInput,
    allowStandardFinishAlias: true,
  };
  logger.info('Aliasing graded finish onto untagged PC product', {
    cardName: nameForUrl,
    setName: resolvedInput.setName,
    variant: resolvedInput.variant,
    wantFinish,
  });
  return attemptResolve(aliasInput, undefined, true);
};
