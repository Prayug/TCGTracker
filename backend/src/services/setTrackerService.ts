import { getDb } from '../db/database';
import {
  normalizeSetKey,
  resolveSetSearchKeys,
  buildSetMappingWhereClause,
} from './setAliasResolver';
import {
  extractBestListingPrice,
  ListingPriceFields,
  resolveListingPrice,
} from '../utils/resolveListingPrice';

const PRICE_SOURCES = "('tcgcsv', 'tcgdex', 'catalog_fallback')";

export const CATALOG_PRODUCT_EXCLUSIONS = `
  AND cc.cardName NOT LIKE '%Binder%'
  AND cc.cardName NOT LIKE '%binder%'
  AND cc.cardName NOT LIKE '%Collection Case%'
  AND cc.cardName NOT LIKE '%Booster Box%'
  AND cc.cardName NOT LIKE '%Elite Trainer%'
  AND cc.cardName NOT LIKE '%ETB%'
  AND cc.cardNumber NOT LIKE '%Binder%'
`;

export const parsePrices = (
  value?: string | null
): Record<string, ListingPriceFields> | undefined => {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

export const extractMarketPriceFromVariants = (
  prices?: Record<string, ListingPriceFields>
): number | null => {
  const best = extractBestListingPrice(prices);
  return best.price > 0 ? best.price : null;
};

export interface SetCatalogRow {
  cardId: string;
  cardName: string;
  setId: string;
  setName: string;
  setReleaseDate: string | null;
  cardNumber: string | null;
  rarity: string | null;
  imageSmall: string | null;
  imageLarge: string | null;
  tcgplayerPrices: string | null;
  tcgplayerProductId: string | null;
  latestPrice: number | null;
  priceDate: string | null;
  priceSource: 'market_sync' | 'tcgplayer_catalog' | null;
  /** Extra reverse-holo market quote when distinct from the primary finish. */
  reversePrice: number | null;
  reversePriceDate: string | null;
  reversePriceSource: 'market_sync' | 'tcgplayer_catalog' | null;
}

export interface SetCardDto {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  marketPrice: number;
  /** Reverse-holo market price counted toward master set when present. */
  reverseMarketPrice: number;
  hasPriceData: boolean;
  priceSource: 'market_sync' | 'tcgplayer_catalog' | null;
  priceDate: string | null;
  images: { small: string; large: string };
  set: { id: string; name: string; releaseDate: string; total: number };
}

/** True for reverse / reverse-holo finishes (TCGPlayer + mapping key variants). */
export const isReverseFinish = (subTypeName: string, variantKey: string): boolean => {
  const combined = `${subTypeName} ${variantKey}`.toLowerCase().replace(/[\s_\-]/g, '');
  return combined.includes('reverseholo');
};

export const extractReversePriceFromVariants = (
  prices?: Record<string, ListingPriceFields>
): number | null => {
  if (!prices) return null;
  for (const [key, fields] of Object.entries(prices)) {
    if (!isReverseFinish(key, key)) continue;
    const price = resolveListingPrice(fields);
    if (price > 0) return price;
  }
  return null;
};

const dbAll = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve((rows as T[]) || []);
    });
  });

const dbGet = <T>(sql: string, params: unknown[] = []): Promise<T | undefined> =>
  new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T | undefined);
    });
  });

export const resolveSetMeta = async (
  setId: string
): Promise<{
  id: string;
  name: string;
  releaseDate: string;
  total: number;
  series?: string;
  era?: string;
  eraLabel?: string;
  images?: { symbol: string; logo: string };
} | null> => {
  const slugify = (value: string) =>
    value
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  try {
    const { enrichSetById } = await import('./setListService');
    const enriched = await enrichSetById(setId);
    if (enriched) return enriched;
  } catch {
    // fall through to DB lookup
  }

  let row = await dbGet<{ id: string; name: string; releaseDate: string; total: number }>(
    `
    SELECT setId as id, setName as name, MAX(setReleaseDate) as releaseDate, COUNT(*) as total
    FROM catalog_cards cc
    WHERE setId = ? OR setName = ?
    GROUP BY setId, setName
    ORDER BY total DESC
    LIMIT 1
    `,
    [setId, setId]
  );

  // Vault imports / Collectr slugs often use "black-bolt" instead of catalog setId.
  if (!row) {
    const needle = slugify(setId);
    const spaced = needle.replace(/-/g, ' ');
    row = await dbGet<{ id: string; name: string; releaseDate: string; total: number }>(
      `
      SELECT setId as id, setName as name, MAX(setReleaseDate) as releaseDate, COUNT(*) as total
      FROM catalog_cards
      WHERE lower(setName) = lower(?)
         OR lower(replace(replace(replace(setName, '&', ' and '), ' ', '-'), '--', '-')) = ?
         OR lower(setName) = lower(?)
      GROUP BY setId, setName
      ORDER BY total DESC
      LIMIT 1
      `,
      [spaced, needle, setId]
    );
  }

  if (row) {
    const { classifySetEra, getEraLabel, resolveSetImages } = await import('../utils/setEra');
    const { setCodeService } = await import('./setCodeService');
    await setCodeService.initialize();
    const apiMeta = setCodeService.resolveApiSet(row.id, row.name);
    const era = classifySetEra({ id: apiMeta?.id || row.id, name: row.name, series: apiMeta?.series });
    return {
      id: row.id,
      name: row.name,
      releaseDate: apiMeta?.releaseDate || row.releaseDate || '',
      total: row.total,
      series: apiMeta?.series,
      era,
      eraLabel: getEraLabel(era),
      images: resolveSetImages(apiMeta?.images, apiMeta?.id || row.id),
    };
  }

  return null;
};

const variantPriority = (
  rarity: string | null | undefined,
  subTypeName: string,
  variantKey: string
): number => {
  const r = (rarity || '').toLowerCase();
  const wantsHolo = r.includes('holo') || r.includes('ultra') || r.includes('secret') || r.includes('illustration');
  const sub = subTypeName.toLowerCase();
  const variant = variantKey.toLowerCase();

  if (wantsHolo) {
    if (sub === 'holofoil' || variant === 'holofoil') return 0;
    if (sub === 'reverseholofoil' || variant === 'reverseholofoil') return 1;
    if (sub === 'normal' || variant === 'normal') return 2;
    return 3;
  }

  if (sub === 'normal' || variant === 'normal') return 0;
  if (sub === 'holofoil' || variant === 'holofoil') return 1;
  if (sub === 'reverseholofoil' || variant === 'reverseholofoil') return 2;
  return 3;
};

interface ResolvedPrice {
  price: number;
  date: string | null;
  source: 'market_sync';
  priority: number;
  isReverse: boolean;
}

type MarketPriceRow = {
  cardId: string;
  cardName: string;
  setId: string;
  setName: string;
  cardNumber: string | null;
  tcgplayerProductId: string | null;
  marketPrice: number;
  date: string;
  subTypeName: string;
  variantKey: string;
  rarity: string | null;
};

const considerResolvedPrice = (
  map: Map<string, ResolvedPrice>,
  key: string,
  candidate: ResolvedPrice
) => {
  const existing = map.get(key);
  if (
    !existing ||
    candidate.priority < existing.priority ||
    (candidate.priority === existing.priority && candidate.price > existing.price)
  ) {
    map.set(key, candidate);
  }
};

const indexResolvedPrice = (
  maps: {
    byCardId: Map<string, ResolvedPrice>;
    bySetNumber: Map<string, ResolvedPrice>;
    bySetNameNumber: Map<string, ResolvedPrice>;
    byCardNameNumber: Map<string, ResolvedPrice>;
    byProductId: Map<string, ResolvedPrice>;
  },
  row: MarketPriceRow,
  resolved: ResolvedPrice
) => {
  if (row.cardId) considerResolvedPrice(maps.byCardId, row.cardId, resolved);
  if (row.setId && row.cardNumber) {
    considerResolvedPrice(maps.bySetNumber, `${row.setId}::${row.cardNumber}`, resolved);
  }
  if (row.setName && row.cardNumber) {
    considerResolvedPrice(
      maps.bySetNameNumber,
      `${normalizeSetKey(row.setName)}::${row.cardNumber}`,
      resolved
    );
  }
  if (row.cardName && row.cardNumber) {
    considerResolvedPrice(
      maps.byCardNameNumber,
      `${normalizeSetKey(row.cardName)}::${row.cardNumber}`,
      resolved
    );
  }
  if (row.tcgplayerProductId) {
    considerResolvedPrice(maps.byProductId, row.tcgplayerProductId, resolved);
  }
};

const emptyPriceMaps = () => ({
  byCardId: new Map<string, ResolvedPrice>(),
  bySetNumber: new Map<string, ResolvedPrice>(),
  bySetNameNumber: new Map<string, ResolvedPrice>(),
  byCardNameNumber: new Map<string, ResolvedPrice>(),
  byProductId: new Map<string, ResolvedPrice>(),
});

const buildPriceLookup = (rows: MarketPriceRow[]) => {
  const maps = emptyPriceMaps();

  for (const row of rows) {
    if (!row.marketPrice || row.marketPrice <= 0) continue;

    const resolved: ResolvedPrice = {
      price: row.marketPrice,
      date: row.date,
      source: 'market_sync',
      priority: variantPriority(row.rarity, row.subTypeName, row.variantKey),
      isReverse: isReverseFinish(row.subTypeName, row.variantKey),
    };

    indexResolvedPrice(maps, row, resolved);
  }

  return maps;
};

/** One reverse-holo quote per card identity — used as the extra master-set slot. */
const buildReversePriceLookup = (rows: MarketPriceRow[]) => {
  const maps = emptyPriceMaps();

  for (const row of rows) {
    if (!row.marketPrice || row.marketPrice <= 0) continue;
    if (!isReverseFinish(row.subTypeName, row.variantKey)) continue;

    // Among reverse listings only, prefer the higher market quote.
    const resolved: ResolvedPrice = {
      price: row.marketPrice,
      date: row.date,
      source: 'market_sync',
      priority: 0,
      isReverse: true,
    };

    indexResolvedPrice(maps, row, resolved);
  }

  return maps;
};

const pickFromPriceMaps = (
  row: {
    cardId: string;
    cardName: string;
    setId: string;
    setName: string;
    cardNumber: string | null;
    tcgplayerProductId: string | null;
  },
  lookup: ReturnType<typeof emptyPriceMaps>
): ResolvedPrice | undefined => {
  const fromId = lookup.byCardId.get(row.cardId);
  const fromNumber =
    row.setId && row.cardNumber
      ? lookup.bySetNumber.get(`${row.setId}::${row.cardNumber}`)
      : undefined;
  const fromSetNameNumber =
    row.setName && row.cardNumber
      ? lookup.bySetNameNumber.get(`${normalizeSetKey(row.setName)}::${row.cardNumber}`)
      : undefined;
  const fromCardNameNumber =
    row.cardName && row.cardNumber
      ? lookup.byCardNameNumber.get(`${normalizeSetKey(row.cardName)}::${row.cardNumber}`)
      : undefined;
  const fromProduct = row.tcgplayerProductId
    ? lookup.byProductId.get(row.tcgplayerProductId)
    : undefined;

  return fromId || fromProduct || fromSetNameNumber || fromCardNameNumber || fromNumber;
};

const fetchMarketPricesForSet = async (setId: string, setName?: string) => {
  const keys = await resolveSetSearchKeys(setId, setName);
  const where = buildSetMappingWhereClause(keys);

  return dbAll<MarketPriceRow>(
    `
    SELECT
      cm.cardId,
      cm.cardName,
      cm.setId,
      cm.setName,
      cm.cardNumber,
      cm.tcgplayerProductId,
      ph.marketPrice,
      ph.date,
      COALESCE(ph.subTypeName, 'normal') as subTypeName,
      COALESCE(cm.variantKey, 'normal') as variantKey,
      cm.rarity
    FROM card_mappings cm
    INNER JOIN price_history ph ON cm.uniqueIdentifier = ph.uniqueIdentifier
    INNER JOIN (
      SELECT uniqueIdentifier, MAX(date) AS maxDate
      FROM price_history
      WHERE source IN ${PRICE_SOURCES}
      GROUP BY uniqueIdentifier
    ) latest ON ph.uniqueIdentifier = latest.uniqueIdentifier AND ph.date = latest.maxDate
    WHERE ${where.sql}
      AND ph.source IN ${PRICE_SOURCES}
      AND ph.marketPrice IS NOT NULL AND ph.marketPrice > 0
      AND cm.cardName NOT LIKE '%Binder%'
    `,
    where.params
  );
};

const resolvePriceForCatalogRow = (
  row: Omit<
    SetCatalogRow,
    | 'latestPrice'
    | 'priceDate'
    | 'priceSource'
    | 'reversePrice'
    | 'reversePriceDate'
    | 'reversePriceSource'
  >,
  lookup: ReturnType<typeof buildPriceLookup>,
  reverseLookup: ReturnType<typeof buildReversePriceLookup>
): Pick<
  SetCatalogRow,
  | 'latestPrice'
  | 'priceDate'
  | 'priceSource'
  | 'reversePrice'
  | 'reversePriceDate'
  | 'reversePriceSource'
> => {
  const market = pickFromPriceMaps(row, lookup);

  let latestPrice: number | null = null;
  let priceDate: string | null = null;
  let priceSource: SetCatalogRow['priceSource'] = null;
  let primaryIsReverse = false;

  if (market) {
    latestPrice = market.price;
    priceDate = market.date;
    priceSource = 'market_sync';
    primaryIsReverse = market.isReverse;
  } else {
    const catalogBest = extractBestListingPrice(parsePrices(row.tcgplayerPrices));
    if (catalogBest.price > 0) {
      latestPrice = catalogBest.price;
      priceDate = null;
      priceSource = 'tcgplayer_catalog';
      primaryIsReverse = !!catalogBest.variantKey && isReverseFinish(catalogBest.variantKey, catalogBest.variantKey);
    }
  }

  // Master-set reverse slot: only when primary finish is not already the reverse.
  let reversePrice: number | null = null;
  let reversePriceDate: string | null = null;
  let reversePriceSource: SetCatalogRow['reversePriceSource'] = null;

  if (!primaryIsReverse) {
    const reverse = pickFromPriceMaps(row, reverseLookup);
    if (reverse) {
      reversePrice = reverse.price;
      reversePriceDate = reverse.date;
      reversePriceSource = 'market_sync';
    } else {
      const fromCatalog = extractReversePriceFromVariants(parsePrices(row.tcgplayerPrices));
      if (fromCatalog !== null && fromCatalog > 0) {
        reversePrice = fromCatalog;
        reversePriceDate = null;
        reversePriceSource = 'tcgplayer_catalog';
      }
    }
  }

  return {
    latestPrice,
    priceDate,
    priceSource,
    reversePrice,
    reversePriceDate,
    reversePriceSource,
  };
};

export const fetchSetCatalogRows = async (setId: string): Promise<SetCatalogRow[]> => {
  const catalogSetName = await dbGet<{ setName: string }>(
    `SELECT setName FROM catalog_cards WHERE setId = ? OR setName = ? LIMIT 1`,
    [setId, setId]
  );
  const marketRows = await fetchMarketPricesForSet(setId, catalogSetName?.setName);
  const lookup = buildPriceLookup(marketRows);
  const reverseLookup = buildReversePriceLookup(marketRows);

  const catalogBase = await dbAll<
    Omit<
      SetCatalogRow,
      | 'latestPrice'
      | 'priceDate'
      | 'priceSource'
      | 'reversePrice'
      | 'reversePriceDate'
      | 'reversePriceSource'
    >
  >(
    `
    SELECT
      cc.cardId,
      cc.cardName,
      cc.setId,
      cc.setName,
      cc.setReleaseDate,
      cc.cardNumber,
      cc.rarity,
      cc.imageSmall,
      cc.imageLarge,
      cc.tcgplayerPrices,
      cc.tcgplayerProductId
    FROM catalog_cards cc
    WHERE (cc.setId = ? OR cc.setName = ?)
    ${CATALOG_PRODUCT_EXCLUSIONS}
    GROUP BY cc.cardId
    ORDER BY
      CASE WHEN cc.cardNumber GLOB '[0-9]*' THEN CAST(cc.cardNumber AS INTEGER) ELSE 9999 END,
      cc.cardNumber,
      cc.cardName
    `,
    [setId, setId]
  );

  if (catalogBase.length > 0) {
    return catalogBase.map((row) => ({
      ...row,
      ...resolvePriceForCatalogRow(row, lookup, reverseLookup),
    }));
  }

  return [];
};

export const rowToSetCardDto = (
  row: SetCatalogRow,
  setMeta: { id: string; name: string; releaseDate: string; total: number }
): SetCardDto => {
  const fromSync = typeof row.latestPrice === 'number' && row.latestPrice > 0 ? row.latestPrice : null;
  const fromCatalog = extractMarketPriceFromVariants(parsePrices(row.tcgplayerPrices));
  const marketPrice = fromSync ?? (fromCatalog !== null && fromCatalog > 0 ? fromCatalog : 0);
  const priceSource =
    row.priceSource ??
    (fromSync !== null ? 'market_sync' : fromCatalog !== null && fromCatalog > 0 ? 'tcgplayer_catalog' : null);

  const reverseMarketPrice =
    typeof row.reversePrice === 'number' && row.reversePrice > 0 ? row.reversePrice : 0;

  return {
    id: row.cardId,
    name: row.cardName,
    number: row.cardNumber || '',
    rarity: row.rarity || undefined,
    marketPrice,
    reverseMarketPrice,
    hasPriceData: marketPrice > 0,
    priceSource,
    priceDate: row.priceDate,
    images: {
      small: row.imageSmall || row.imageLarge || '',
      large: row.imageLarge || row.imageSmall || '',
    },
    set: {
      id: setMeta.id,
      name: setMeta.name,
      releaseDate: setMeta.releaseDate,
      total: setMeta.total,
    },
  };
};

export const getCardMarketPrice = (card: SetCardDto): number => card.marketPrice;

export interface SetSummaryResult {
  setId: string;
  setName: string;
  releaseDate: string;
  totalCards: number;
  ownedCount: number;
  wishlistCount: number;
  completionPct: number;
  /** Primary checklist finishes only (one price per catalog card). */
  checklistValue: number;
  /** Sum of reverse-holo finishes counted toward master set. */
  reverseHoloValue: number;
  reverseHoloCount: number;
  /** Checklist + reverse holos (Collectr-style total set / master set). */
  masterSetValue: number;
  ownedValue: number;
  missingValue: number;
  /** Missing reverse-holo finish value (master-set cost component). */
  missingReverseValue: number;
  ownedReverseCount: number;
  /** Missing primary + missing reverse (when includeReverseInCost). */
  costToComplete: number;
  pricedCardCount: number;
  priceCoveragePct: number;
  marketSyncCount: number;
  catalogPriceCount: number;
}

export interface SetSummaryOptions {
  /** Card IDs for which the reverse-holo finish is owned (master-set aware). */
  ownedReverseIds?: Set<string>;
  /** When true, costToComplete includes missing reverse finishes. Default true. */
  includeReverseInCost?: boolean;
}

export const computeSetSummary = (
  cards: SetCardDto[],
  ownedIds: Set<string>,
  wishlistIds: Set<string>,
  options: SetSummaryOptions = {}
): SetSummaryResult => {
  const setMeta = cards[0]?.set;
  const ownedReverseIds = options.ownedReverseIds ?? new Set<string>();
  // Master-set cost only when the caller opts in (ownedReverseIds and/or flag).
  const includeReverseInCost =
    options.includeReverseInCost === true || options.ownedReverseIds !== undefined;
  let checklistValue = 0;
  let reverseHoloValue = 0;
  let reverseHoloCount = 0;
  let ownedValue = 0;
  let missingValue = 0;
  let missingReverseValue = 0;
  let pricedCardCount = 0;
  let ownedCount = 0;
  let ownedReverseCount = 0;
  let marketSyncCount = 0;
  let catalogPriceCount = 0;

  for (const card of cards) {
    const price = getCardMarketPrice(card);
    const reverse = card.reverseMarketPrice > 0 ? card.reverseMarketPrice : 0;
    if (price > 0) {
      pricedCardCount++;
      if (card.priceSource === 'market_sync') marketSyncCount++;
      else if (card.priceSource === 'tcgplayer_catalog') catalogPriceCount++;
    }
    checklistValue += price;
    if (reverse > 0) {
      reverseHoloValue += reverse;
      reverseHoloCount++;
    }

    if (ownedIds.has(card.id)) {
      ownedCount++;
      ownedValue += price;
    } else {
      missingValue += price;
    }

    if (reverse > 0) {
      if (ownedReverseIds.has(card.id)) {
        ownedReverseCount++;
        ownedValue += reverse;
      } else if (includeReverseInCost) {
        missingReverseValue += reverse;
      }
    }
  }

  const totalCards = cards.length;
  const completionPct = totalCards > 0 ? (ownedCount / totalCards) * 100 : 0;
  const priceCoveragePct = totalCards > 0 ? (pricedCardCount / totalCards) * 100 : 0;
  const costToComplete = missingValue + (includeReverseInCost ? missingReverseValue : 0);

  return {
    setId: setMeta?.id || '',
    setName: setMeta?.name || '',
    releaseDate: setMeta?.releaseDate || '',
    totalCards,
    ownedCount,
    wishlistCount: wishlistIds.size,
    completionPct,
    checklistValue,
    reverseHoloValue,
    reverseHoloCount,
    masterSetValue: checklistValue + reverseHoloValue,
    ownedValue,
    missingValue,
    missingReverseValue,
    ownedReverseCount,
    costToComplete,
    pricedCardCount,
    priceCoveragePct,
    marketSyncCount,
    catalogPriceCount,
  };
};

export type ValueHistoryRange = '1d' | '7d' | '30d' | '90d' | 'all';

export type SetValueHistoryRow = {
  date: string;
  setValue: number;
  cardsPriced: number;
};

/** Minimum catalog coverage and value share before a daily total is chart-worthy. */
const SET_VALUE_HISTORY_MIN_COVERAGE = 0.5;
const SET_VALUE_HISTORY_MIN_VALUE_RATIO = 0.25;

const RANGE_DAYS: Record<Exclude<ValueHistoryRange, 'all'>, number> = {
  '1d': 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

/** Safety cap for "all" — unbounded price_history scans can stall the whole API. */
const ALL_RANGE_MAX_DAYS = 365 * 5;

/**
 * Drop leading days where only a handful of cards had prices (pre-sync noise).
 * Requires both enough cards priced and a total value near the series peak.
 */
export const trimUnreliableSetValueHistory = <T extends SetValueHistoryRow>(
  history: T[],
  totalCatalogCards?: number
): T[] => {
  if (history.length <= 1) return history;

  const peakPriced =
    totalCatalogCards && totalCatalogCards > 0
      ? totalCatalogCards
      : Math.max(...history.map((p) => p.cardsPriced));

  const peakValue = Math.max(...history.map((p) => p.setValue));
  if (peakPriced <= 0 || peakValue <= 0) return history;

  const minCards = Math.ceil(peakPriced * SET_VALUE_HISTORY_MIN_COVERAGE);
  const minValue = peakValue * SET_VALUE_HISTORY_MIN_VALUE_RATIO;

  const startIdx = history.findIndex(
    (p) => p.cardsPriced >= minCards && p.setValue >= minValue
  );

  if (startIdx <= 0) return startIdx === -1 ? [] : history;
  return history.slice(startIdx);
};

const rangeToCutoff = (range: ValueHistoryRange): string => {
  const days = range === 'all' ? ALL_RANGE_MAX_DAYS : RANGE_DAYS[range];
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

interface CatalogCardRef {
  cardId: string;
  cardName: string;
  setName: string;
  cardNumber: string | null;
  rarity: string | null;
  tcgplayerProductId: string | null;
}

const buildCatalogMatchIndex = (catalogCards: CatalogCardRef[]) => {
  const byId = new Map<string, CatalogCardRef>();
  const bySetNameNumber = new Map<string, string>();
  const byCardNameNumber = new Map<string, string>();
  const byProductId = new Map<string, string>();

  for (const card of catalogCards) {
    byId.set(card.cardId, card);
    if (card.setName && card.cardNumber) {
      bySetNameNumber.set(`${normalizeSetKey(card.setName)}::${card.cardNumber}`, card.cardId);
    }
    if (card.cardName && card.cardNumber) {
      byCardNameNumber.set(`${normalizeSetKey(card.cardName)}::${card.cardNumber}`, card.cardId);
    }
    if (card.tcgplayerProductId) {
      byProductId.set(card.tcgplayerProductId, card.cardId);
    }
  }

  return { byId, bySetNameNumber, byCardNameNumber, byProductId };
};

const resolveHistoryRowToCatalogId = (
  row: {
    cardId: string;
    cardName: string;
    setName: string;
    cardNumber: string | null;
    tcgplayerProductId: string | null;
  },
  index: ReturnType<typeof buildCatalogMatchIndex>
): string | null => {
  if (index.byId.has(row.cardId)) return row.cardId;
  if (row.tcgplayerProductId && index.byProductId.has(row.tcgplayerProductId)) {
    return index.byProductId.get(row.tcgplayerProductId)!;
  }
  if (row.setName && row.cardNumber) {
    const hit = index.bySetNameNumber.get(`${normalizeSetKey(row.setName)}::${row.cardNumber}`);
    if (hit) return hit;
  }
  if (row.cardName && row.cardNumber) {
    const hit = index.byCardNameNumber.get(`${normalizeSetKey(row.cardName)}::${row.cardNumber}`);
    if (hit) return hit;
  }
  return null;
};

const pickBetterPriceForDate = (
  existing: { price: number; priority: number; isReverse: boolean } | undefined,
  price: number,
  priority: number,
  isReverse: boolean
): { price: number; priority: number; isReverse: boolean } => {
  if (!existing || priority < existing.priority) return { price, priority, isReverse };
  if (priority === existing.priority && price > existing.price) {
    return { price, priority, isReverse };
  }
  return existing;
};

const pickBetterReverseForDate = (
  existing: number | undefined,
  price: number
): number => {
  if (existing === undefined || price > existing) return price;
  return existing;
};

export const fetchSetValueHistory = async (
  setId: string,
  range: ValueHistoryRange = '30d'
): Promise<{ date: string; setValue: number; cardsPriced: number }[]> => {
  const catalogCards = await dbAll<CatalogCardRef>(
    `
    SELECT cardId, cardName, setName, cardNumber, rarity, tcgplayerProductId
    FROM catalog_cards cc
    WHERE (cc.setId = ? OR cc.setName = ?)
    ${CATALOG_PRODUCT_EXCLUSIONS}
    GROUP BY cc.cardId
    `,
    [setId, setId]
  );

  if (catalogCards.length === 0) return [];

  const catalogIndex = buildCatalogMatchIndex(catalogCards);
  const catalogSetName = catalogCards[0]?.setName;
  const keys = await resolveSetSearchKeys(setId, catalogSetName);
  const where = buildSetMappingWhereClause(keys);
  const cutoff = rangeToCutoff(range);

  const historyRows = await dbAll<{
    cardId: string;
    cardName: string;
    setName: string;
    cardNumber: string | null;
    tcgplayerProductId: string | null;
    rarity: string | null;
    date: string;
    marketPrice: number;
    subTypeName: string;
    variantKey: string;
  }>(
    `
    SELECT
      cm.cardId,
      cm.cardName,
      cm.setName,
      cm.cardNumber,
      cm.tcgplayerProductId,
      cm.rarity,
      ph.date,
      ph.marketPrice,
      COALESCE(ph.subTypeName, 'normal') as subTypeName,
      COALESCE(cm.variantKey, 'normal') as variantKey
    FROM card_mappings cm
    INNER JOIN price_history ph ON cm.uniqueIdentifier = ph.uniqueIdentifier
    WHERE ${where.sql}
      AND ph.source IN ${PRICE_SOURCES}
      AND ph.marketPrice IS NOT NULL AND ph.marketPrice > 0
      AND cm.cardName NOT LIKE '%Binder%'
      AND ph.date >= ?
    ORDER BY ph.date ASC
    `,
    [...where.params, cutoff]
  );

  // Primary finish + optional reverse slot per catalog card per date (matches master set value)
  const byCatalogCard = new Map<
    string,
    Map<string, { price: number; priority: number; isReverse: boolean }>
  >();
  const reverseByCatalogCard = new Map<string, Map<string, number>>();
  const rarityByCatalogId = new Map(catalogCards.map((c) => [c.cardId, c.rarity]));

  for (const row of historyRows) {
    const catalogId = resolveHistoryRowToCatalogId(row, catalogIndex);
    if (!catalogId) continue;

    const isReverse = isReverseFinish(row.subTypeName, row.variantKey);
    const priority = variantPriority(
      rarityByCatalogId.get(catalogId) ?? row.rarity,
      row.subTypeName,
      row.variantKey
    );

    if (!byCatalogCard.has(catalogId)) byCatalogCard.set(catalogId, new Map());
    const dateMap = byCatalogCard.get(catalogId)!;
    const existing = dateMap.get(row.date);
    dateMap.set(
      row.date,
      pickBetterPriceForDate(existing, row.marketPrice, priority, isReverse)
    );

    if (isReverse) {
      if (!reverseByCatalogCard.has(catalogId)) reverseByCatalogCard.set(catalogId, new Map());
      const reverseDateMap = reverseByCatalogCard.get(catalogId)!;
      reverseDateMap.set(
        row.date,
        pickBetterReverseForDate(reverseDateMap.get(row.date), row.marketPrice)
      );
    }
  }

  if (byCatalogCard.size === 0) return [];

  const allDates = new Set<string>();
  for (const dateMap of byCatalogCard.values()) {
    for (const date of dateMap.keys()) allDates.add(date);
  }
  for (const dateMap of reverseByCatalogCard.values()) {
    for (const date of dateMap.keys()) allDates.add(date);
  }

  const sortedDates = [...allDates].sort();
  const lastPrimary = new Map<string, { price: number; isReverse: boolean }>();
  const lastReverse = new Map<string, number>();
  const result: { date: string; setValue: number; cardsPriced: number }[] = [];

  for (const date of sortedDates) {
    for (const [catalogId, dateMap] of byCatalogCard) {
      const point = dateMap.get(date);
      if (point) lastPrimary.set(catalogId, { price: point.price, isReverse: point.isReverse });
    }
    for (const [catalogId, dateMap] of reverseByCatalogCard) {
      const reversePrice = dateMap.get(date);
      if (reversePrice !== undefined) lastReverse.set(catalogId, reversePrice);
    }

    let setValue = 0;
    let cardsPriced = 0;
    const catalogIds = new Set([...lastPrimary.keys(), ...lastReverse.keys()]);
    for (const catalogId of catalogIds) {
      const primary = lastPrimary.get(catalogId);
      if (primary) {
        setValue += primary.price;
        cardsPriced++;
      }
      const reverse = lastReverse.get(catalogId);
      // Extra reverse slot only when primary isn't already the reverse finish
      if (reverse !== undefined && reverse > 0 && !primary?.isReverse) {
        setValue += reverse;
      }
    }

    result.push({ date, setValue, cardsPriced });
  }

  return trimUnreliableSetValueHistory(result, catalogCards.length);
};
