import { PokemonCard, SortOption } from '../types/pokemon';
import { pokemonApi } from '../services/pokemonApi';

export const sortCards = (cards: PokemonCard[], sortBy: SortOption): PokemonCard[] => {
  const sorted = [...cards];

  switch (sortBy) {
    case 'price-high':
      return sorted.sort((a, b) => pokemonApi.extractCardPrice(b) - pokemonApi.extractCardPrice(a));
    
    case 'price-low':
      return sorted.sort((a, b) => pokemonApi.extractCardPrice(a) - pokemonApi.extractCardPrice(b));
    
    case 'name-asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    
    case 'name-desc':
      return sorted.sort((a, b) => b.name.localeCompare(a.name));
    
    case 'set-asc':
      return sorted.sort((a, b) => a.set.name.localeCompare(b.set.name));
    
    case 'set-desc':
      return sorted.sort((a, b) => b.set.name.localeCompare(a.set.name));
    
    case 'date-new':
      return sorted.sort((a, b) => new Date(b.set.releaseDate).getTime() - new Date(a.set.releaseDate).getTime());
    
    case 'date-old':
      return sorted.sort((a, b) => new Date(a.set.releaseDate).getTime() - new Date(b.set.releaseDate).getTime());
    
    case 'rarity':
      const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Rare Holo', 'Rare Ultra', 'Rare Secret'];
      return sorted.sort((a, b) => {
        const aIndex = rarityOrder.indexOf(a.rarity || '');
        const bIndex = rarityOrder.indexOf(b.rarity || '');
        return bIndex - aIndex;
      });

    case 'investment-score':
      return sorted.sort((a, b) => {
        const aScore = a.investmentData?.investmentScore || 0;
        const bScore = b.investmentData?.investmentScore || 0;
        return bScore - aScore;
      });

    case 'psa-pop-low':
      return sorted.sort((a, b) => {
        const aPop = a.investmentData?.psaData.population.grade10 || Infinity;
        const bPop = b.investmentData?.psaData.population.grade10 || Infinity;
        return aPop - bPop;
      });

    case 'psa-return-high':
      return sorted.sort((a, b) => {
        const aReturn = a.investmentData?.psaData.returnRate || 0;
        const bReturn = b.investmentData?.psaData.returnRate || 0;
        return bReturn - aReturn;
      });

    case 'undervalued':
      return sorted.sort((a, b) => {
        const aUndervalued = a.investmentData?.marketAnalysis.isUndervalued ? 1 : 0;
        const bUndervalued = b.investmentData?.marketAnalysis.isUndervalued ? 1 : 0;
        if (aUndervalued !== bUndervalued) return bUndervalued - aUndervalued;
        
        // Secondary sort by investment score
        const aScore = a.investmentData?.investmentScore || 0;
        const bScore = b.investmentData?.investmentScore || 0;
        return bScore - aScore;
      });

    case 'trend-bullish':
      return sorted.sort((a, b) => {
        const aTrend = a.investmentData?.marketAnalysis.trend === 'BULLISH' ? 2 : 
                      a.investmentData?.marketAnalysis.trend === 'NEUTRAL' ? 1 : 0;
        const bTrend = b.investmentData?.marketAnalysis.trend === 'BULLISH' ? 2 : 
                      b.investmentData?.marketAnalysis.trend === 'NEUTRAL' ? 1 : 0;
        if (aTrend !== bTrend) return bTrend - aTrend;
        
        // Secondary sort by 30-day price change
        const aChange = a.investmentData?.marketAnalysis.priceChange30d || 0;
        const bChange = b.investmentData?.marketAnalysis.priceChange30d || 0;
        return bChange - aChange;
      });
    
    default:
      return sorted;
  }
};

export const getSortOptions = (): { value: SortOption; label: string }[] => [
  { value: 'investment-score', label: '🎯 Investment Score' },
  { value: 'undervalued', label: '💎 Undervalued First' },
  { value: 'psa-pop-low', label: '🏆 Low PSA 10 Pop' },
  { value: 'psa-return-high', label: '📈 High PSA Returns' },
  { value: 'trend-bullish', label: '🚀 Bullish Trend' },
  { value: 'price-high', label: 'Price (High to Low)' },
  { value: 'price-low', label: 'Price (Low to High)' },
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
  { value: 'set-asc', label: 'Set (A-Z)' },
  { value: 'set-desc', label: 'Set (Z-A)' },
  { value: 'date-new', label: 'Release Date (Newest)' },
  { value: 'date-old', label: 'Release Date (Oldest)' },
  { value: 'rarity', label: 'Rarity (Rare First)' }
];