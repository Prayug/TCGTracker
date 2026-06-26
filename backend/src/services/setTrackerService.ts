import { getDb } from '../db/database';
import {
  normalizeSetKey,
  resolveSetSearchKeys,
  buildSetMappingWhereClause,
} from './setAliasResolver';

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

export const parsePrices = (value?: string | null): Record<string, { market?: number }> | undefined => {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

export const extractMarketPriceFromVariants = (
  prices?: Record<string, { market?: number }>
): number | null => {
  if (!prices) return null;

  const preferredOrder = ['normal', 'holofoil', 'reverseHolofoil', '1stEditionHolofoil'];
  for (const key of preferredOrder) {
    const value = prices[key]?.market;
    if (typeof value === 'number' && value > 0) return value;
  }

  for (const entry of Object.values(prices)) {
    if (typeof entry?.market === 'number' && entry.market > 0) return entry.market;
  }

  return null;
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
}

export interface SetCardDto {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  marketPrice: number;
  hasPriceData: boolean;
  priceSource: 'market_sync' | 'tcgplayer_catalog' | null;
  priceDate: string | null;
  images: { small: string; large: string };
  set: { id: string; name: string; releaseDate: string; total: number };
}

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
  try {
    const { enrichSetById } = await import('./setListService');
    const enriched = await enrichSetById(setId);
    if (enriched) return enriched;
  } catch {
    // fall through to DB lookup
  }

  const row = await dbGet<{ id: string; name: string; releaseDate: string; total: number }>(
    `
    SELECT setId as id, setName as name, MAX(setReleaseDate) as releaseDate, COUNT(*) as total
    FROM catalog_cards cc
    WHERE setId = ? OR setName = ?
    GROUP BY setId, setName
    LIMIT 1
    `,
    [setId, setId]
  );

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
      images: resolveSetImages(apiMeta?.images),
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
}

const buildPriceLookup = (
  rows: {
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
  }[]
) => {
  const byCardId = new Map<string, ResolvedPrice>();
  const bySetNumber = new Map<string, ResolvedPrice>();
  const bySetNameNumber = new Map<string, ResolvedPrice>();
  const byCardNameNumber = new Map<string, ResolvedPrice>();
  const byProductId = new Map<string, ResolvedPrice>();

  const consider = (
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

  for (const row of rows) {
    if (!row.marketPrice || row.marketPrice <= 0) continue;

    const resolved: ResolvedPrice = {
      price: row.marketPrice,
      date: row.date,
      source: 'market_sync',
      priority: variantPriority(row.rarity, row.subTypeName, row.variantKey),
    };

    if (row.cardId) consider(byCardId, row.cardId, resolved);
    if (row.setId && row.cardNumber) {
      consider(bySetNumber, `${row.setId}::${row.cardNumber}`, resolved);
    }
    if (row.setName && row.cardNumber) {
      consider(bySetNameNumber, `${normalizeSetKey(row.setName)}::${row.cardNumber}`, resolved);
    }
    if (row.cardName && row.cardNumber) {
      consider(byCardNameNumber, `${normalizeSetKey(row.cardName)}::${row.cardNumber}`, resolved);
    }
    if (row.tcgplayerProductId) {
      consider(byProductId, row.tcgplayerProductId, resolved);
    }
  }

  return { byCardId, bySetNumber, bySetNameNumber, byCardNameNumber, byProductId };
};

const fetchMarketPricesForSet = async (setId: string, setName?: string) => {
  const keys = await resolveSetSearchKeys(setId, setName);
  const where = buildSetMappingWhereClause(keys);

  return dbAll<{
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
  }>(
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
  row: Omit<SetCatalogRow, 'latestPrice' | 'priceDate' | 'priceSource'>,
  lookup: ReturnType<typeof buildPriceLookup>
): Pick<SetCatalogRow, 'latestPrice' | 'priceDate' | 'priceSource'> => {
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

  const market =
    fromId ||
    fromProduct ||
    fromSetNameNumber ||
    fromCardNameNumber ||
    fromNumber;

  if (market) {
    return {
      latestPrice: market.price,
      priceDate: market.date,
      priceSource: 'market_sync',
    };
  }

  const catalogPrice = extractMarketPriceFromVariants(parsePrices(row.tcgplayerPrices));
  if (catalogPrice !== null && catalogPrice > 0) {
    return {
      latestPrice: catalogPrice,
      priceDate: null,
      priceSource: 'tcgplayer_catalog',
    };
  }

  return { latestPrice: null, priceDate: null, priceSource: null };
};

export const fetchSetCatalogRows = async (setId: string): Promise<SetCatalogRow[]> => {
  const catalogSetName = await dbGet<{ setName: string }>(
    `SELECT setName FROM catalog_cards WHERE setId = ? OR setName = ? LIMIT 1`,
    [setId, setId]
  );
  const marketRows = await fetchMarketPricesForSet(setId, catalogSetName?.setName);
  const lookup = buildPriceLookup(marketRows);

  const catalogBase = await dbAll<Omit<SetCatalogRow, 'latestPrice' | 'priceDate' | 'priceSource'>>(
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
      ...resolvePriceForCatalogRow(row, lookup),
    }));
  }

  return [];
};

export const rowToSetCardDto = (row: SetCatalogRow, setMeta: { id: string; name: string; releaseDate: string; total: number }): SetCardDto => {
  const fromSync = typeof row.latestPrice === 'number' && row.latestPrice > 0 ? row.latestPrice : null;
  const fromCatalog = extractMarketPriceFromVariants(parsePrices(row.tcgplayerPrices));
  const marketPrice = fromSync ?? (fromCatalog !== null && fromCatalog > 0 ? fromCatalog : 0);
  const priceSource =
    row.priceSource ??
    (fromSync !== null ? 'market_sync' : fromCatalog !== null && fromCatalog > 0 ? 'tcgplayer_catalog' : null);

  return {
    id: row.cardId,
    name: row.cardName,
    number: row.cardNumber || '',
    rarity: row.rarity || undefined,
    marketPrice,
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
  masterSetValue: number;
  ownedValue: number;
  missingValue: number;
  costToComplete: number;
  pricedCardCount: number;
  priceCoveragePct: number;
  marketSyncCount: number;
  catalogPriceCount: number;
}

export const computeSetSummary = (
  cards: SetCardDto[],
  ownedIds: Set<string>,
  wishlistIds: Set<string>
): SetSummaryResult => {
  const setMeta = cards[0]?.set;
  let masterSetValue = 0;
  let ownedValue = 0;
  let missingValue = 0;
  let pricedCardCount = 0;
  let ownedCount = 0;
  let marketSyncCount = 0;
  let catalogPriceCount = 0;

  for (const card of cards) {
    const price = getCardMarketPrice(card);
    if (price > 0) {
      pricedCardCount++;
      if (card.priceSource === 'market_sync') marketSyncCount++;
      else if (card.priceSource === 'tcgplayer_catalog') catalogPriceCount++;
    }
    masterSetValue += price;

    if (ownedIds.has(card.id)) {
      ownedCount++;
      ownedValue += price;
    } else {
      missingValue += price;
    }
  }

  const totalCards = cards.length;
  const completionPct = totalCards > 0 ? (ownedCount / totalCards) * 100 : 0;
  const priceCoveragePct = totalCards > 0 ? (pricedCardCount / totalCards) * 100 : 0;

  return {
    setId: setMeta?.id || '',
    setName: setMeta?.name || '',
    releaseDate: setMeta?.releaseDate || '',
    totalCards,
    ownedCount,
    wishlistCount: wishlistIds.size,
    completionPct,
    masterSetValue,
    ownedValue,
    missingValue,
    costToComplete: missingValue,
    pricedCardCount,
    priceCoveragePct,
    marketSyncCount,
    catalogPriceCount,
  };
};

export type ValueHistoryRange = '30d' | '90d' | '1y' | 'all';

export type SetValueHistoryRow = {
  date: string;
  setValue: number;
  cardsPriced: number;
};

/** Minimum catalog coverage and value share before a daily total is chart-worthy. */
const SET_VALUE_HISTORY_MIN_COVERAGE = 0.5;
const SET_VALUE_HISTORY_MIN_VALUE_RATIO = 0.25;

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

const rangeToCutoff = (range: ValueHistoryRange): string | null => {
  const now = new Date();
  const days =
    range === '30d' ? 30 : range === '90d' ? 90 : range === '1y' ? 365 : null;
  if (days === null) return null;
  const d = new Date(now);
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
  existing: { price: number; priority: number } | undefined,
  price: number,
  priority: number
): { price: number; priority: number } => {
  if (!existing || priority < existing.priority) return { price, priority };
  if (priority === existing.priority && price > existing.price) return { price, priority };
  return existing;
};

export const fetchSetValueHistory = async (
  setId: string,
  range: ValueHistoryRange = '90d'
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
      ${cutoff ? 'AND ph.date >= ?' : ''}
    ORDER BY ph.date ASC
    `,
    cutoff ? [...where.params, cutoff] : where.params
  );

  // One best price per catalog card per date (same card list as master set value)
  const byCatalogCard = new Map<string, Map<string, { price: number; priority: number }>>();
  const rarityByCatalogId = new Map(catalogCards.map((c) => [c.cardId, c.rarity]));

  for (const row of historyRows) {
    const catalogId = resolveHistoryRowToCatalogId(row, catalogIndex);
    if (!catalogId) continue;

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
      pickBetterPriceForDate(existing, row.marketPrice, priority)
    );
  }

  if (byCatalogCard.size === 0) return [];

  const allDates = new Set<string>();
  for (const dateMap of byCatalogCard.values()) {
    for (const date of dateMap.keys()) allDates.add(date);
  }

  const sortedDates = [...allDates].sort();
  const lastPrice = new Map<string, number>();
  const result: { date: string; setValue: number; cardsPriced: number }[] = [];

  for (const date of sortedDates) {
    for (const [catalogId, dateMap] of byCatalogCard) {
      const point = dateMap.get(date);
      if (point) lastPrice.set(catalogId, point.price);
    }

    let setValue = 0;
    let cardsPriced = 0;
    for (const price of lastPrice.values()) {
      setValue += price;
      cardsPriced++;
    }

    result.push({ date, setValue, cardsPriced });
  }

  return trimUnreliableSetValueHistory(result, catalogCards.length);
};
