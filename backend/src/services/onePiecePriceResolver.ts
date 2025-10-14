import { findTcgPlayerListing } from './providers/onePieceTcgPlayerProvider';
import { OPTCGCardResponse } from './providers/onePieceOptcgClient';

export type OnePiecePriceSource = 'tcgplayer' | 'optcg';

export interface OnePiecePriceResolution {
  marketPrice: number | null;
  inventoryPrice: number | null;
  priceSource: OnePiecePriceSource;
  tcgplayerProductId?: number;
}

export interface OnePiecePriceableCard {
  set: { id: string; name: string };
  number: string;
  name: string;
  marketPrice?: number;
  inventoryPrice?: number;
  cardImageId?: string;
}

const STALE_SCRAPE_DAYS = 7;

function isOptcgPriceStale(dateScraped?: string | null): boolean {
  if (!dateScraped) return false;
  const scrapedAt = Date.parse(dateScraped);
  if (Number.isNaN(scrapedAt)) return false;
  const ageMs = Date.now() - scrapedAt;
  return ageMs > STALE_SCRAPE_DAYS * 24 * 60 * 60 * 1000;
}

function shouldPreferTcgPlayer(
  tcgMarketPrice: number | null,
  optcgMarketPrice: number | null,
  optcgStale: boolean
): boolean {
  if (tcgMarketPrice == null || tcgMarketPrice <= 0) return false;
  if (optcgMarketPrice == null || optcgMarketPrice <= 0) return true;
  if (optcgStale) return true;

  const ratio = tcgMarketPrice / optcgMarketPrice;
  return ratio >= 1.5 || ratio <= 0.67;
}

export async function resolveOnePiecePrice(input: {
  setId: string;
  cardSetId: string;
  cardName: string;
  cardImageId: string;
  optcgMarketPrice: number | null;
  optcgInventoryPrice: number | null;
  dateScraped?: string | null;
}): Promise<OnePiecePriceResolution> {
  const listing = await findTcgPlayerListing({
    setId: input.setId,
    cardSetId: input.cardSetId,
    cardName: input.cardName,
    cardImageId: input.cardImageId,
  });

  const optcgStale = isOptcgPriceStale(input.dateScraped);
  const tcgMarketPrice = listing?.marketPrice ?? null;

  if (shouldPreferTcgPlayer(tcgMarketPrice, input.optcgMarketPrice, optcgStale)) {
    return {
      marketPrice: tcgMarketPrice,
      inventoryPrice: listing?.lowPrice ?? input.optcgInventoryPrice,
      priceSource: 'tcgplayer',
      tcgplayerProductId: listing?.productId,
    };
  }

  return {
    marketPrice: input.optcgMarketPrice,
    inventoryPrice: input.optcgInventoryPrice,
    priceSource: 'optcg',
    tcgplayerProductId: listing?.productId,
  };
}

export async function resolveOnePiecePriceFromRaw(raw: OPTCGCardResponse): Promise<OnePiecePriceResolution> {
  return resolveOnePiecePrice({
    setId: raw.set_id,
    cardSetId: raw.card_set_id,
    cardName: raw.card_name,
    cardImageId: raw.card_image_id,
    optcgMarketPrice: raw.market_price ?? null,
    optcgInventoryPrice: raw.inventory_price ?? null,
    dateScraped: raw.date_scraped,
  });
}

export async function enrichOnePieceApiCard<T extends OnePiecePriceableCard>(
  card: T
): Promise<T & { priceSource?: OnePiecePriceSource; tcgplayerProductId?: number }> {
  const resolved = await resolveOnePiecePrice({
    setId: card.set.id,
    cardSetId: card.number,
    cardName: card.name,
    cardImageId: card.cardImageId ?? card.number,
    optcgMarketPrice: card.marketPrice ?? null,
    optcgInventoryPrice: card.inventoryPrice ?? null,
  });

  return {
    ...card,
    marketPrice: resolved.marketPrice ?? undefined,
    inventoryPrice: resolved.inventoryPrice ?? undefined,
    priceSource: resolved.priceSource,
    tcgplayerProductId: resolved.tcgplayerProductId,
  };
}

export async function enrichOnePieceApiCards<T extends OnePiecePriceableCard>(
  cards: T[]
): Promise<Array<T & { priceSource?: OnePiecePriceSource; tcgplayerProductId?: number }>> {
  return Promise.all(cards.map((card) => enrichOnePieceApiCard(card)));
}
