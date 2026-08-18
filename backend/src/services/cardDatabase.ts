// Database query utilities for cards
import { getDb } from '../db/database';
import { buildDeterministicImageUrls, getImageColumnSelectFragment } from './cardImageUtils';
import { extractBestListingPrice, resolveHistoryPointPrice } from '../utils/resolveListingPrice';

/** Sealed / non-single SKUs that pollute name search when Pokemon API is down. */
const NON_SINGLE_CARD_PATTERN =
  /\b(elite trainer box|etb|tin|blister|collection|booster|code card|premium collection|special collection|deck|box set|bundle|case)\b/i;

/**
 * Pull a printable card number out of TCGCSV-style names like
 * "Jolteon (H12)", "Jolteon (4)", "Jolteon - 169 (Cosmos Holo)".
 */
export const extractCardNumberFromName = (cardName?: string | null): string | null => {
  if (!cardName) return null;

  const dashMatch = cardName.match(/\s-\s(\d{1,4}[a-zA-Z]?)\b/);
  if (dashMatch?.[1]) return dashMatch[1];

  const parenMatch = cardName.match(/\(([A-Za-z]?\d{1,4}[A-Za-z]?|[A-Z]{1,3}\d{1,4})\)\s*$/);
  if (parenMatch?.[1] && !/^(delta species|team plasma|master ball pattern|poke ball pattern|cosmos holo)$/i.test(parenMatch[1])) {
    return parenMatch[1];
  }

  return null;
};

export const looksLikeNonSingleCard = (cardName?: string | null): boolean => {
  if (!cardName) return false;
  return NON_SINGLE_CARD_PATTERN.test(cardName);
};

export const getCatalogCardsForQuery = async (
  query: string,
  setId?: string,
  limit: number = 250,
  language: string = 'en'
) => {
  const db = getDb();
  const trimmed = query.trim();
  const lang = (language || 'en').toLowerCase();
  const langClause =
    lang === 'all' ? '' : `AND COALESCE(cc.language, 'en') = '${lang === 'ja' ? 'ja' : 'en'}'`;

  // Fast path: exact catalog id lookups (base1-4, bw6-90, …) skip the heavy price join.
  const looksLikeCardId = /^[a-z0-9][a-z0-9_-]{1,40}$/i.test(trimmed) && trimmed.includes('-');
  if (looksLikeCardId && !setId) {
    const exact = await new Promise<any[]>((resolve, reject) => {
      db.all(
        `SELECT
           cc.cardId, cc.cardName, cc.setId, cc.setName, cc.setReleaseDate,
           cc.cardNumber, cc.rarity, cc.types, cc.artist,
           cc.imageSmall, cc.imageLarge, cc.tcgplayerProductId, cc.tcgplayerPrices,
           COALESCE(cc.language, 'en') AS language,
           COALESCE(cc.matchName, cc.cardName) AS matchName,
           NULL as latestPrice, NULL as latestLowPrice, NULL as latestHighPrice
         FROM catalog_cards cc
         WHERE cc.cardId = ?
         LIMIT 1`,
        [trimmed],
        (err, rows) => {
          if (err) reject(err);
          else resolve((rows as any[]) || []);
        }
      );
    });
    if (exact.length > 0) return exact;
    // Exact id miss (tcgcsv-197651, etc.): do NOT fall through to LIKE '%id%'
    // plus a full price_history scan — that locks SQLite and 500s /auth/me.
    return [];
  }

  const likeQuery = `%${trimmed}%`;
  // Exact cardId first so getCardById("base1-4") / "bw6-90" resolves.
  const params: any[] = [trimmed, likeQuery, likeQuery, likeQuery];

  let sql = `
    SELECT
      cc.cardId,
      cc.cardName,
      cc.setId,
      cc.setName,
      cc.setReleaseDate,
      cc.cardNumber,
      cc.rarity,
      cc.types,
      cc.artist,
      cc.imageSmall,
      cc.imageLarge,
      cc.tcgplayerProductId,
      cc.tcgplayerPrices,
      COALESCE(cc.language, 'en') AS language,
      COALESCE(cc.matchName, cc.cardName) AS matchName,
      ph.marketPrice as latestPrice,
      ph.lowPrice as latestLowPrice,
      ph.highPrice as latestHighPrice
    FROM catalog_cards cc
    LEFT JOIN card_mappings cm ON cm.cardId = cc.cardId
    LEFT JOIN price_history ph ON ph.uniqueIdentifier = cm.uniqueIdentifier
      AND ph.rowid = (
        SELECT ph2.rowid FROM price_history ph2
        WHERE ph2.uniqueIdentifier = cm.uniqueIdentifier
          AND ph2.source IN ('tcgcsv', 'tcgdex', 'catalog_fallback', 'tcgdex_ja', 'cardmarket', 'pricecharting_raw')
          AND IFNULL(ph2.marketPrice, 0) > 0
        ORDER BY ph2.date DESC
        LIMIT 1
      )
    WHERE (
      cc.cardId = ?
      OR cc.cardId LIKE ?
      OR cc.cardName LIKE ?
      OR IFNULL(cc.matchName, '') LIKE ?
    )
    ${langClause}
  `;

  if (setId) {
    sql += ' AND (cc.setId = ? OR cc.setName LIKE ?)';
    params.push(setId, `%${setId}%`);
  }

  sql += ` ORDER BY
      CASE WHEN cc.cardId = ? THEN 0 ELSE 1 END,
      cc.cardName ASC
    LIMIT ?`;
  params.push(trimmed, limit);

  return new Promise<any[]>((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
};

export const mapCatalogRowsToPokemonCards = (rows: any[]) => {
  const seen = new Map<string, any>();

  for (const row of rows) {
    if (!row.cardId) continue;

    let catalogPrices: Record<string, { market?: number; mid?: number; low?: number; high?: number }> | undefined;
    if (row.tcgplayerPrices) {
      try {
        catalogPrices = JSON.parse(row.tcgplayerPrices);
      } catch {
        catalogPrices = undefined;
      }
    }

    const fromListing = extractBestListingPrice(catalogPrices);
    const snapshotPrice = resolveHistoryPointPrice({
      marketPrice: row.latestPrice,
      lowPrice: row.latestLowPrice,
      highPrice: row.latestHighPrice,
    });
    const derivedMarketPrice =
      snapshotPrice > 0 ? snapshotPrice : fromListing.price > 0 ? fromListing.price : 0;

    const productId = row.tcgplayerProductId || undefined;
    const next = {
      id: row.cardId,
      name: row.cardName,
      number: row.cardNumber || '',
      rarity: row.rarity || undefined,
      artist: row.artist || undefined,
      language: row.language || 'en',
      matchName: row.matchName || row.cardName,
      images: {
        small: row.imageSmall || row.imageLarge || '',
        large: row.imageLarge || row.imageSmall || '',
      },
      set: {
        id: row.setId,
        name: row.setName,
        releaseDate: row.setReleaseDate || '2020-01-01',
        total: 0,
      },
      tcgplayer:
        catalogPrices || productId
          ? {
              productId,
              prices: catalogPrices,
            }
          : undefined,
      marketPrice: derivedMarketPrice,
      preferredVariant: fromListing.variantKey || undefined,
      source: 'catalog_sync',
    };

    const existing = seen.get(row.cardId);
    if (!existing || (next.marketPrice || 0) > (existing.marketPrice || 0)) {
      seen.set(row.cardId, next);
    }
  }

  return Array.from(seen.values());
};

export const getLocalCardsForQuery = async (
  query: string,
  setId?: string,
  limit: number = 250,
  language: string = 'en'
) => {
  const db = getDb();
  const trimmed = query.trim();
  const likeQuery = `%${trimmed}%`;
  const params: any[] = [trimmed, likeQuery, likeQuery, likeQuery];
  let whereClause =
    '(cm.cardId = ? OR cm.cardId LIKE ? OR cm.cardName LIKE ? OR IFNULL(cm.matchName, \'\') LIKE ?)';

  const lang = (language || 'en').toLowerCase();
  if (lang !== 'all') {
    whereClause += ` AND COALESCE(cm.language, 'en') = ?`;
    params.push(lang === 'ja' ? 'ja' : 'en');
  }

  if (setId) {
    whereClause += ' AND (cm.setId = ? OR cm.setName LIKE ?)';
    params.push(setId, `%${setId}%`);
  }

  const imageColumns = await getImageColumnSelectFragment();

  const sql = `
    SELECT 
      cm.cardId,
      cm.cardName,
      cm.setId,
      cm.setName,
      COALESCE(NULLIF(cm.cardNumber, ''), cc.cardNumber) as cardNumber,
      cm.rarity,
      cm.tcgplayerProductId,
      cm.uniqueIdentifier,
      COALESCE(cm.language, cc.language, 'en') AS language,
      COALESCE(cm.matchName, cc.matchName, cm.cardName) AS matchName,
      ${
        imageColumns
          ? `COALESCE(NULLIF(cm.imageSmall, ''), cc.imageSmall) as imageSmall,
             COALESCE(NULLIF(cm.imageLarge, ''), cc.imageLarge) as imageLarge,
             cm.imageSource as imageSource,
             cm.imageLastUpdated,`
          : `cc.imageSmall as imageSmall,
             cc.imageLarge as imageLarge,
             NULL as imageSource,`
      }
      ph.marketPrice as latestPrice,
      ph.lowPrice as latestLowPrice,
      ph.highPrice as latestHighPrice,
      ph.date as priceDate,
      cc.tcgplayerPrices as catalogPrices
    FROM card_mappings cm
    LEFT JOIN price_history ph ON ph.uniqueIdentifier = cm.uniqueIdentifier
      AND ph.rowid = (
        SELECT ph2.rowid FROM price_history ph2
        WHERE ph2.uniqueIdentifier = cm.uniqueIdentifier
        ORDER BY ph2.date DESC
        LIMIT 1
      )
    LEFT JOIN catalog_cards cc ON cc.cardId = cm.cardId
    WHERE ${whereClause}
    ORDER BY
      CASE WHEN cm.cardId = ? THEN 0 ELSE 1 END,
      cm.cardName ASC
    LIMIT ?
  `;

  params.push(trimmed, limit);

  return new Promise<any[]>((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(rows || []);
    });
  });
};

export const mapLocalRowsToPokemonCards = async (rows: any[]) => {
  const seen = new Map<string, any>();
  for (const row of rows) {
    const key = row.cardId || row.uniqueIdentifier || `${row.setId}-${row.cardNumber}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, row);
      continue;
    }
    // Prefer the mapping row with the strongest resolved latest price.
    const existingPrice = resolveHistoryPointPrice({
      marketPrice: existing.latestPrice,
      lowPrice: existing.latestLowPrice,
      highPrice: existing.latestHighPrice,
    });
    const nextPrice = resolveHistoryPointPrice({
      marketPrice: row.latestPrice,
      lowPrice: row.latestLowPrice,
      highPrice: row.latestHighPrice,
    });
    if (nextPrice > existingPrice) {
      seen.set(key, row);
    }
  }
  const uniqueRows = Array.from(seen.values());

  const mapped = await Promise.all(
    uniqueRows.map(async (row) => {
      const cardNumber =
        (typeof row.cardNumber === 'string' && row.cardNumber.trim()) ||
        extractCardNumberFromName(row.cardName) ||
        null;

      // Skip sealed / product SKUs that have no printable card identity.
      if (looksLikeNonSingleCard(row.cardName) && !cardNumber && !row.imageSmall && !row.imageLarge) {
        return null;
      }

      let images: { small?: string; large?: string } | undefined;
      let imageSource = row.imageSource;

      if (row.imageSmall || row.imageLarge) {
        images = {
          small: row.imageSmall || row.imageLarge,
          large: row.imageLarge || row.imageSmall,
        };
        imageSource = imageSource || 'stored';
      } else if (cardNumber) {
        const deterministicImages = await buildDeterministicImageUrls(
          row.setId,
          cardNumber,
          row.setName
        );
        if (deterministicImages) {
          images = deterministicImages;
          imageSource = 'deterministic';
        }
      }
      // No SVG data-URI placeholders — leave images undefined so the UI shows "No image".

      const resolvedLatest = resolveHistoryPointPrice({
        marketPrice: row.latestPrice,
        lowPrice: row.latestLowPrice,
        highPrice: row.latestHighPrice,
      });

      let catalogPrices: Record<string, { market?: number; mid?: number; low?: number; high?: number }> | undefined;
      if (row.catalogPrices) {
        try {
          catalogPrices = JSON.parse(row.catalogPrices);
        } catch {
          catalogPrices = undefined;
        }
      }

      const fromCatalog = extractBestListingPrice(catalogPrices);
      const marketPrice =
        resolvedLatest > 0 ? resolvedLatest : fromCatalog.price > 0 ? fromCatalog.price : 0;

      const psa10Price =
        typeof row.psa10Price === 'number' && Number.isFinite(row.psa10Price) && row.psa10Price > 0
          ? row.psa10Price
          : undefined;

      return {
        id: row.cardId || `${row.setId}-${cardNumber || 'na'}`,
        name: row.cardName,
        number: cardNumber || '',
        rarity: row.rarity,
        language: row.language || 'en',
        matchName: row.matchName || row.cardName,
        set: {
          id: row.setId,
          name: row.setName,
          releaseDate: '2020-01-01',
          total: 100,
        },
        images: images ?? { small: '', large: '' },
        imageSource,
        tcgplayer: catalogPrices
          ? {
              productId: row.tcgplayerProductId,
              prices: catalogPrices,
            }
          : marketPrice > 0
            ? {
                productId: row.tcgplayerProductId,
                prices: {
                  [fromCatalog.variantKey || 'normal']: { market: marketPrice },
                },
              }
            : undefined,
        marketPrice,
        ...(psa10Price != null ? { psa10Price } : {}),
        preferredVariant: fromCatalog.variantKey || undefined,
        uniqueIdentifier: row.uniqueIdentifier,
        isLocalDbCard: true,
        source: 'local_database',
      };
    })
  );

  return mapped.filter((card): card is NonNullable<typeof card> => card !== null);
};
