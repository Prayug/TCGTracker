import { PokemonCard, FilterOption } from '../types/pokemon';
import { getCardDeltaPct, getCardPrice } from './cardPrice';

/**
 * Heuristic investment filters for browse results when full investmentData
 * is not attached to search hits. Uses cardmarket averages + rarity cues.
 */
export function matchesInvestmentFilter(card: PokemonCard, filterBy: FilterOption): boolean {
  if (filterBy === 'all') return true;

  if (card.investmentData) {
    const { marketAnalysis, psaData } = card.investmentData;
    switch (filterBy) {
      case 'undervalued':
        return marketAnalysis.isUndervalued;
      case 'overvalued':
        return marketAnalysis.isOvervalued;
      case 'low-pop':
        return psaData.popReport.lowPop;
      case 'high-return':
        return psaData.returnRate > 60;
      case 'bullish':
        return marketAnalysis.trend === 'BULLISH';
      default:
        return true;
    }
  }

  const price = getCardPrice(card);
  const delta7 = getCardDeltaPct(card, '7d');
  const delta30 = getCardDeltaPct(card, '30d');
  const rarity = (card.rarity || '').toLowerCase();
  const isChase =
    /secret|illustration|special illustration|hyper|rainbow|gold|alt/.test(rarity) ||
    rarity.includes('ultra rare');

  switch (filterBy) {
    case 'undervalued':
      // Price below recent 30d average (negative delta vs avg30) and not already expensive chase
      return delta30 != null && delta30 <= -8 && price > 0 && price < 150;
    case 'overvalued':
      return delta30 != null && delta30 >= 15 && price >= 10;
    case 'low-pop':
      // Proxy: chase finishes often have thinner supply in browse without pop API
      return isChase && price >= 20;
    case 'high-return':
      // Proxy: mid-tier cards with room to grade up (price band where PSA often pays)
      return price >= 15 && price <= 120 && (isChase || rarity.includes('holo') || rarity.includes('rare'));
    case 'bullish':
      return (
        (delta7 != null && delta7 >= 5) ||
        (delta30 != null && delta30 >= 8) ||
        (delta7 != null && delta30 != null && delta7 > 0 && delta30 > 0)
      );
    default:
      return true;
  }
}
