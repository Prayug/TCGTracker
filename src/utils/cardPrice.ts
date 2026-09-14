import { PokemonCard } from '../types/pokemon';
import { OnePieceCard } from '../types/onepiece';
import { pokemonApi } from '../services/pokemonApi';
import { onePieceApi } from '../services/onepieceApi';

export type AnyCard = PokemonCard | OnePieceCard;

export function isPokemonCard(card: AnyCard): card is PokemonCard {
  return 'tcgplayer' in card || 'types' in card;
}

export function isOnePieceCard(card: AnyCard): card is OnePieceCard {
  return 'cardColor' in card || ('cardType' in card && !('types' in card));
}

export function getCardPrice(card: AnyCard, preferredVariant?: string): number {
  if (isPokemonCard(card)) {
    // Backend marketPrice is the daily snapshot when present — trust it over raw listings.
    if (card.marketPrice && card.marketPrice > 0) return card.marketPrice;
    return pokemonApi.extractCardPrice(card, preferredVariant || card.preferredVariant);
  }
  return onePieceApi.extractCardPrice(card as OnePieceCard);
}

export function getCardName(card: AnyCard): string {
  return card.name;
}

export function getCardImage(card: AnyCard): string {
  return card.images?.small || card.images?.large || '';
}

export function getCardSet(card: AnyCard): { id: string; name: string } {
  return card.set;
}

export function getCardRarity(card: AnyCard): string | undefined {
  return card.rarity;
}

export function getCardId(card: AnyCard): string {
  return card.id;
}

export function getCardDedupeKey(card: AnyCard): string {
  if ('uniqueIdentifier' in card && card.uniqueIdentifier) {
    return card.uniqueIdentifier;
  }
  return `${card.id}:${card.set?.id ?? ''}:${card.number ?? ''}`;
}

export function getCardReactKey(card: AnyCard, index: number): string {
  return getCardDedupeKey(card) || `${card.id}:${index}`;
}

export function dedupeCards<T extends AnyCard>(cards: T[]): T[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = getCardDedupeKey(card);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getCardDeltaPct(card: PokemonCard, period: '1d' | '7d' | '30d'): number | null {
  const prices = card.cardmarket?.prices;
  if (!prices) return null;

  const current = prices.trendPrice ?? prices.averageSellPrice;
  if (!current || current <= 0) return null;

  const avgKey = period === '1d' ? 'avg1' : period === '7d' ? 'avg7' : 'avg30';
  const avg = prices[avgKey];
  if (!avg || avg <= 0) return null;

  if (avg < 0.5 || current < 0.5) return null;

  return ((current - avg) / avg) * 100;
}

export function getBrowsePriceMove(card: AnyCard): { percent: number; window: string } | null {
  if (!isPokemonCard(card)) return null;

  const analysis = card.investmentData?.marketAnalysis;
  if (analysis?.priceChange90d != null && Math.abs(analysis.priceChange90d) >= 0.05) {
    return { percent: analysis.priceChange90d, window: '3M' };
  }
  if (analysis?.priceChange1y != null && Math.abs(analysis.priceChange1y) >= 0.05) {
    return { percent: analysis.priceChange1y, window: '1Y' };
  }

  const d30 = getCardDeltaPct(card, '30d');
  if (d30 != null && Math.abs(d30) >= 0.05) return { percent: d30, window: '30D' };

  const d7 = getCardDeltaPct(card, '7d');
  if (d7 != null && Math.abs(d7) >= 0.05) return { percent: d7, window: '7D' };

  return null;
}

const LOOKBACK: Record<string, number> = { '1d': 1, '7d': 7, '30d': 30 };

export function computeDeltaFromHistory(
  history: { date: string; price: number }[],
  period: string
): { changePct: number; currentPrice: number } | null {
  if (history.length < 2) return null;

  const sorted = [...history].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const currentPrice = sorted[sorted.length - 1].price;
  if (!currentPrice || currentPrice <= 0) return null;

  const lookbackDays = LOOKBACK[period] ?? 7;
  const latestDate = new Date(sorted[sorted.length - 1].date);
  const targetMs = latestDate.getTime() - lookbackDays * 86400000;

  let oldPrice: number | null = null;
  let minDiff = Infinity;
  for (const point of sorted) {
    const diff = Math.abs(new Date(point.date).getTime() - targetMs);
    if (diff < minDiff) {
      minDiff = diff;
      oldPrice = point.price;
    }
  }

  if (!oldPrice || oldPrice <= 0) return null;
  if (oldPrice < 0.5 || currentPrice < 0.5) return null;

  return {
    currentPrice,
    changePct: ((currentPrice - oldPrice) / oldPrice) * 100,
  };
}
