import { useState, useEffect, useCallback } from 'react';
import { PokemonCard, SortOption, FilterOption } from '../types/pokemon';
import { pokemonApi } from '../services/pokemonApi';
import { sortCards } from '../utils/sorting';

interface UsePokemonCardsReturn {
  cards: PokemonCard[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  sortBy: SortOption;
  filterBy: FilterOption;
  setSearchQuery: (query: string) => void;
  setSortBy: (sort: SortOption) => void;
  setFilterBy: (filter: FilterOption) => void;
  refetch: () => void;
}

export const usePokemonCards = (): UsePokemonCardsReturn => {
  const [cards, setCards] = useState<PokemonCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('price-high');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');

  const fetchCards = useCallback(async (query: string) => {
    if (!query.trim()) {
      setCards([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const fetchedCards = await pokemonApi.searchCards(query);
      setCards(fetchedCards);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch cards';
      setError(errorMessage);
      setCards([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCards(searchQuery);
  }, [searchQuery, fetchCards]);

  // Apply filters
  const filteredCards = cards.filter(card => {
    if (filterBy === 'all') return true;
    if (!card.investmentData) return false;

    switch (filterBy) {
      case 'undervalued':
        return card.investmentData.marketAnalysis.isUndervalued;
      case 'overvalued':
        return card.investmentData.marketAnalysis.isOvervalued;
      case 'low-pop':
        return card.investmentData.psaData.popReport.lowPop;
      case 'high-return':
        return card.investmentData.psaData.returnRate > 60;
      case 'bullish':
        return card.investmentData.marketAnalysis.trend === 'BULLISH';
      default:
        return true;
    }
  });

  const sortedCards = sortCards(filteredCards, sortBy);

  const refetch = useCallback(() => {
    if (searchQuery.trim()) {
      fetchCards(searchQuery);
    }
  }, [searchQuery, fetchCards]);

  return {
    cards: sortedCards,
    isLoading,
    error,
    searchQuery,
    sortBy,
    filterBy,
    setSearchQuery,
    setSortBy,
    setFilterBy,
    refetch
  };
};