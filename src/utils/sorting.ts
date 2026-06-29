import { PokemonCard, SortOption } from '../types/pokemon';
import { OnePieceSortOption } from '../types/onepiece';
import { AnyCard, getCardPrice, isPokemonCard } from './cardPrice';

const ONE_PIECE_RARITY_ORDER = ['C', 'UC', 'R', 'SR', 'SEC', 'L', 'SP', 'P', 'AAA', 'AA', 'SA', 'TR'];
const POKEMON_RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Rare Holo', 'Rare Ultra', 'Rare Secret'];

export type GameSortOption = SortOption | OnePieceSortOption;

export const sortCards = (
  cards: AnyCard[],
  sortBy: GameSortOption,
  game: 'pokemon' | 'onepiece' = 'pokemon'
): AnyCard[] => {
  const sorted = [...cards];

  switch (sortBy) {
    case 'price-high':
      return sorted.sort((a, b) => getCardPrice(b) - getCardPrice(a));

    case 'price-low':
      return sorted.sort((a, b) => getCardPrice(a) - getCardPrice(b));

    case 'name-asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));

    case 'name-desc':
      return sorted.sort((a, b) => b.name.localeCompare(a.name));

    case 'set-asc':
      return sorted.sort((a, b) => a.set.name.localeCompare(b.set.name));

    case 'set-desc':
      return sorted.sort((a, b) => b.set.name.localeCompare(a.set.name));

    case 'date-new':
      return sorted.sort((a, b) => {
        const aDate = 'releaseDate' in a.set ? new Date(a.set.releaseDate || 0).getTime() : 0;
        const bDate = 'releaseDate' in b.set ? new Date(b.set.releaseDate || 0).getTime() : 0;
        return bDate - aDate;
      });

    case 'date-old':
      return sorted.sort((a, b) => {
        const aDate = 'releaseDate' in a.set ? new Date(a.set.releaseDate || 0).getTime() : 0;
        const bDate = 'releaseDate' in b.set ? new Date(b.set.releaseDate || 0).getTime() : 0;
        return aDate - bDate;
      });

    case 'rarity': {
      const rarityOrder = game === 'onepiece' ? ONE_PIECE_RARITY_ORDER : POKEMON_RARITY_ORDER;
      return sorted.sort((a, b) => {
        const aIndex = rarityOrder.indexOf(a.rarity || '');
        const bIndex = rarityOrder.indexOf(b.rarity || '');
        const aRank = aIndex === -1 ? -1 : aIndex;
        const bRank = bIndex === -1 ? -1 : bIndex;
        return bRank - aRank;
      });
    }

    case 'investment-score':
      return sorted.sort((a, b) => {
        const aScore = isPokemonCard(a) ? a.investmentData?.investmentScore || 0 : 0;
        const bScore = isPokemonCard(b) ? b.investmentData?.investmentScore || 0 : 0;
        return bScore - aScore;
      });

    case 'psa-pop-low':
      return sorted.sort((a, b) => {
        const aPop = isPokemonCard(a) ? a.investmentData?.psaData.population.grade10 || Infinity : Infinity;
        const bPop = isPokemonCard(b) ? b.investmentData?.psaData.population.grade10 || Infinity : Infinity;
        return aPop - bPop;
      });

    case 'psa-return-high':
      return sorted.sort((a, b) => {
        const aReturn = isPokemonCard(a) ? a.investmentData?.psaData.returnRate || 0 : 0;
        const bReturn = isPokemonCard(b) ? b.investmentData?.psaData.returnRate || 0 : 0;
        return bReturn - aReturn;
      });

    case 'undervalued':
      return sorted.sort((a, b) => {
        const aUndervalued = isPokemonCard(a) && a.investmentData?.marketAnalysis.isUndervalued ? 1 : 0;
        const bUndervalued = isPokemonCard(b) && b.investmentData?.marketAnalysis.isUndervalued ? 1 : 0;
        if (aUndervalued !== bUndervalued) return bUndervalued - aUndervalued;

        const aScore = isPokemonCard(a) ? a.investmentData?.investmentScore || 0 : 0;
        const bScore = isPokemonCard(b) ? b.investmentData?.investmentScore || 0 : 0;
        return bScore - aScore;
      });

    case 'trend-bullish':
      return sorted.sort((a, b) => {
        const aTrend =
          isPokemonCard(a) && a.investmentData?.marketAnalysis.trend === 'BULLISH'
            ? 2
            : isPokemonCard(a) && a.investmentData?.marketAnalysis.trend === 'NEUTRAL'
              ? 1
              : 0;
        const bTrend =
          isPokemonCard(b) && b.investmentData?.marketAnalysis.trend === 'BULLISH'
            ? 2
            : isPokemonCard(b) && b.investmentData?.marketAnalysis.trend === 'NEUTRAL'
              ? 1
              : 0;
        if (aTrend !== bTrend) return bTrend - aTrend;

        const aChange = isPokemonCard(a) ? a.investmentData?.marketAnalysis.priceChange30d || 0 : 0;
        const bChange = isPokemonCard(b) ? b.investmentData?.marketAnalysis.priceChange30d || 0 : 0;
        return bChange - aChange;
      });

    default:
      return sorted;
  }
};

const ONE_PIECE_SORT_OPTIONS: { value: OnePieceSortOption; label: string }[] = [
  { value: 'price-high', label: 'Price (High to Low)' },
  { value: 'price-low', label: 'Price (Low to High)' },
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
  { value: 'set-asc', label: 'Set (A-Z)' },
  { value: 'set-desc', label: 'Set (Z-A)' },
  { value: 'rarity', label: 'Rarity (Rare First)' },
];

export const getSortOptions = (
  game: 'pokemon' | 'onepiece' = 'pokemon'
): { value: GameSortOption; label: string }[] => {
  if (game === 'onepiece') {
    return ONE_PIECE_SORT_OPTIONS;
  }

  return [
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
    { value: 'rarity', label: 'Rarity (Rare First)' },
  ];
};