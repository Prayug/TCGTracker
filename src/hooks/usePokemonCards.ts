import { useState, useEffect, useCallback, useMemo } from 'react';
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

  const loadCards = useCallback(async (query?: string, _setId?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const pokemonCards = await pokemonApi.searchCards(query, _setId, 250);

      if (pokemonCards.length === 0) {
        setCards([]);
        setIsLoading(false);
        return;
      }

      setCards(pokemonCards);
    } catch (err) {
      const errorMessage = (err as Error).message;
      console.error('Error loading cards:', err);

      if (errorMessage.includes('504') || errorMessage.includes('Gateway Timeout')) {
        setError('Pokemon TCG API is slow to respond. Please try again in a moment.');
      } else if (errorMessage.includes('429')) {
        setError('Too many requests. Please wait a moment and try again.');
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        setError('Network error. Please check your internet connection.');
      } else {
        setError('Failed to load Pokemon cards. Please try again.');
      }

      setCards([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      loadCards(searchQuery);
    } else {
      setCards([]);
    }
  }, [searchQuery, loadCards]);

  const filteredCards = useMemo(() => cards.filter(card => {
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
  }), [cards, filterBy]);

  const sortedCards = useMemo(() => sortCards(filteredCards, sortBy), [filteredCards, sortBy]);

  const refetch = useCallback(() => {
    if (searchQuery.trim()) {
      loadCards(searchQuery);
    }
  }, [searchQuery, loadCards]);

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
