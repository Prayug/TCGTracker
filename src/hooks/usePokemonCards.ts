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
  language: string;
  setSearchQuery: (query: string) => void;
  setSortBy: (sort: SortOption) => void;
  setFilterBy: (filter: FilterOption) => void;
  setLanguage: (language: string) => void;
  refetch: () => void;
}

export const usePokemonCards = (): UsePokemonCardsReturn => {
  const [cards, setCards] = useState<PokemonCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('price-high');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [language, setLanguage] = useState<string>('en');

  const loadCards = async (query?: string, setId?: string, lang?: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Get cards from Pokemon TCG API (with built-in retry logic)
      let pokemonCards = await pokemonApi.searchCards(query, setId, 250, true, lang);
      
      // If no cards returned, show helpful message
      if (pokemonCards.length === 0) {
        console.log(`No cards found for query: "${query}"`);
        setCards([]);
        setIsLoading(false);
        return;
      }
      
      // Use Pokemon TCG API prices directly (they're already accurate and card-specific)
      // The local database matching can be imprecise and match to wrong card variants
      console.log(`✅ Loaded ${pokemonCards.length} cards with Pokemon TCG API prices`);
      
      setCards(pokemonCards);
    } catch (err) {
      const errorMessage = (err as Error).message;
      console.error('Error loading cards:', err);
      
      // Provide helpful error messages based on error type
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
  };

  useEffect(() => {
    if (searchQuery.trim()) {
      loadCards(searchQuery, undefined, language);
    } else {
      setCards([]);
    }
  }, [searchQuery, language]);

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
      loadCards(searchQuery, undefined, language);
    }
  }, [searchQuery, language]);

  return {
    cards: sortedCards,
    isLoading,
    error,
    searchQuery,
    sortBy,
    filterBy,
    language,
    setSearchQuery,
    setSortBy,
    setFilterBy,
    setLanguage,
    refetch
  };
};