import { useState, useEffect, useCallback } from 'react';
import { PokemonCard, SortOption } from '../types/pokemon';
import { pokemonApi } from '../services/pokemonApi';
import { sortCards } from '../utils/sorting';

interface UsePokemonCardsReturn {
  cards: PokemonCard[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  sortBy: SortOption;
  setSearchQuery: (query: string) => void;
  setSortBy: (sort: SortOption) => void;
  refetch: () => void;
}

export const usePokemonCards = (): UsePokemonCardsReturn => {
  const [cards, setCards] = useState<PokemonCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('price-high');

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
    const timeoutId = setTimeout(() => {
      fetchCards(searchQuery);
    }, 300); // Debounce search

    return () => clearTimeout(timeoutId);
  }, [searchQuery, fetchCards]);

  const sortedCards = sortCards(cards, sortBy);

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
    setSearchQuery,
    setSortBy,
    refetch
  };
};