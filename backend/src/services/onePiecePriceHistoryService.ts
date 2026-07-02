import { getDb } from '../db/database';
import { allDbRows, runDb } from '../utils/dbAsync';
import { buildOnePieceCatalogId, isOnePieceCatalogId } from './onePieceCatalogId';
import { getAllOptcgCards } from './providers/onePieceOptcgClient';
import {
  OnePiecePriceResolution,
  OnePiecePriceSource,
  resolveOnePiecePrice,
} from './onePiecePriceResolver';

interface HistoryRow {
  date: string;
  marketPrice: number | null;
  inventoryPrice: number | null;
  source: string;
}

export interface OnePiecePriceHistoryPoint {
  date: string;
  price: number;
  source: OnePiecePriceSource;
}

const getRunDateEst = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

function parseCatalogId(catalogId: string): {
  setId: string;
  cardImageId: string;
  cardName: string;
  cardSetId: string;
} | null {
  if (!isOnePieceCatalogId(catalogId)) return null;
  const [setId, cardImageId, ...nameParts] = catalogId.split('::');
  if (!setId || !cardImageId || nameParts.length === 0) return null;

  const cardSetId = cardImageId.replace(/_[pr]\d+$/i, '');
  return {
    setId,
    cardImageId,
    cardName: nameParts.join('::'),
    cardSetId,
  };
}

async function loadCardContext(catalogId: string): Promise<{
  setId: string;
  cardSetId: string;
  cardName: string;
  cardImageId: string;
  optcgMarketPrice: number | null;
  optcgInventoryPrice: number | null;
  dateScraped: string | null;
} | null> {
  const parsed = parseCatalogId(catalogId);
  if (parsed) {
    const db = getDb();
    const row = await allDbRows<{
      setId: string;
      cardSetId: string;
      cardName: string;
      cardImageId: string;
      marketPrice: number | null;
      inventoryPrice: number | null;
    }>(
      db,
      `SELECT setId, cardSetId, cardName, cardImageId, marketPrice, inventoryPrice
       FROM onepiece_catalog WHERE catalogId = ?`,
      [catalogId]
    );

    if (row[0]) {
      return {
        setId: row[0].setId,
        cardSetId: row[0].cardSetId,
        cardName: row[0].cardName,
        cardImageId: row[0].cardImageId,
        optcgMarketPrice: row[0].marketPrice,
        optcgInventoryPrice: row[0].inventoryPrice,
        dateScraped: null,
      };
    }

    const allCards = await getAllOptcgCards();
    const live = allCards.find((card) => buildOnePieceCatalogId(card) === catalogId);
    if (live) {
      return {
        setId: live.set_id,
        cardSetId: live.card_set_id,
        cardName: live.card_name,
        cardImageId: live.card_image_id,
        optcgMarketPrice: live.market_price ?? null,
        optcgInventoryPrice: live.inventory_price ?? null,
        dateScraped: live.date_scraped ?? null,
      };
    }

    return {
      setId: parsed.setId,
      cardSetId: parsed.cardSetId,
      cardName: parsed.cardName,
      cardImageId: parsed.cardImageId,
      optcgMarketPrice: null,
      optcgInventoryPrice: null,
      dateScraped: null,
    };
  }

  return null;
}

function rowPrice(row: HistoryRow): number {
  return row.marketPrice ?? row.inventoryPrice ?? 0;
}

function isCompatibleWithResolvedPrice(price: number, resolved: OnePiecePriceResolution): boolean {
  if (!resolved.marketPrice || resolved.marketPrice <= 0 || price <= 0) return true;
  const ratio = resolved.marketPrice / price;
  return ratio <= 1.5 && ratio >= 0.67;
}

function mergeHistoryRows(
  rows: HistoryRow[],
  resolved: OnePiecePriceResolution
): OnePiecePriceHistoryPoint[] {
  const byDate = new Map<string, OnePiecePriceHistoryPoint>();

  for (const row of rows) {
    const price = rowPrice(row);
    if (price <= 0) continue;

    const source = row.source === 'tcgplayer' ? 'tcgplayer' : 'optcg';
    const existing = byDate.get(row.date);

    if (source === 'tcgplayer') {
      byDate.set(row.date, { date: row.date, price, source: 'tcgplayer' });
      continue;
    }

    if (existing?.source === 'tcgplayer') continue;

    if (resolved.priceSource === 'tcgplayer' && !isCompatibleWithResolvedPrice(price, resolved)) {
      continue;
    }

    byDate.set(row.date, { date: row.date, price, source: 'optcg' });
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function recordResolvedPrice(
  catalogId: string,
  resolved: OnePiecePriceResolution
): Promise<void> {
  if (resolved.priceSource !== 'tcgplayer' || resolved.marketPrice == null) return;

  const db = getDb();
  const runDate = getRunDateEst();
  await runDb(
    db,
    `INSERT INTO onepiece_price_history (catalogId, date, marketPrice, inventoryPrice, source)
     VALUES (?, ?, ?, ?, 'tcgplayer')
     ON CONFLICT(catalogId, date, source) DO UPDATE SET
       marketPrice = excluded.marketPrice,
       inventoryPrice = excluded.inventoryPrice`,
    [catalogId, runDate, resolved.marketPrice, resolved.inventoryPrice]
  );
}

export async function getOnePiecePriceHistory(
  catalogId: string,
  days?: number
): Promise<{
  catalogId: string;
  priceHistory: OnePiecePriceHistoryPoint[];
  priceSource: OnePiecePriceSource;
  currentPrice: number | null;
} | null> {
  const context = await loadCardContext(catalogId);
  if (!context) return null;

  const resolved = await resolveOnePiecePrice({
    setId: context.setId,
    cardSetId: context.cardSetId,
    cardName: context.cardName,
    cardImageId: context.cardImageId,
    optcgMarketPrice: context.optcgMarketPrice,
    optcgInventoryPrice: context.optcgInventoryPrice,
    dateScraped: context.dateScraped,
  });

  await recordResolvedPrice(catalogId, resolved);

  const db = getDb();
  let sql = `
    SELECT date, marketPrice, inventoryPrice, source
    FROM onepiece_price_history
    WHERE catalogId = ?
  `;
  const params: unknown[] = [catalogId];

  if (days && days > 0) {
    sql += ' AND date >= date("now", ?)';
    params.push(`-${days} days`);
  }

  sql += ' ORDER BY date ASC';

  const rows = await allDbRows<HistoryRow>(db, sql, params);
  let priceHistory = mergeHistoryRows(rows, resolved);

  if (resolved.marketPrice != null && resolved.marketPrice > 0) {
    const runDate = getRunDateEst();
    const latest = priceHistory[priceHistory.length - 1];
    if (!latest || latest.date !== runDate || latest.price !== resolved.marketPrice) {
      priceHistory = [
        ...priceHistory.filter((point) => point.date !== runDate),
        {
          date: runDate,
          price: resolved.marketPrice,
          source: resolved.priceSource,
        },
      ];
    }
  }

  return {
    catalogId,
    priceHistory,
    priceSource: resolved.priceSource,
    currentPrice: resolved.marketPrice,
  };
}
