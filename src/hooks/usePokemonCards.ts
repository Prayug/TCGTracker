import { useState, useEffect, useCallback } from 'react';
import { PokemonCard, SortOption, FilterOption } from '../types/pokemon';
import { pokemonApi } from '../services/pokemonApi';
import { PriceHistoryApi } from '../services/priceHistoryApi';
import { sortCards } from '../utils/sorting';
import { realDataService } from '../services/realDataService';

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

  const loadCards = async (query?: string, setId?: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Get cards from Pokemon TCG API
      let pokemonCards = await pokemonApi.searchCards(query, setId);
      
      // Always get updated prices from local database for consistency
      console.log('Fetching latest prices from local database for consistency...');
      
      const cardsWithLocalPrices = await Promise.all(
        pokemonCards.map(async (card) => {
          try {
            // Extract card number from the card ID (format: set-cardNumber)
            const cardNumber = card.number || '';
            
            // Get latest price from local database
            const latestPrice = await realDataService.getLatestPrice(
              card.name, 
              card.set.name, 
              cardNumber
            );
            
            // If we found a price in the local database, use it
            if (latestPrice > 0) {
              return { ...card, marketPrice: latestPrice };
            }
            
            // Otherwise, keep the original price from Pokemon TCG API
            return card;
          } catch (error) {
            console.error(`Error fetching price for ${card.name}:`, error);
            return card;
          }
        })
      );

      setCards(cardsWithLocalPrices);
      console.log(`✅ Loaded ${cardsWithLocalPrices.length} cards with local database prices`);
    } catch (err) {
      console.error('Error loading cards:', err);
      setError('Failed to load Pokemon cards');
      setCards([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (searchQuery.trim()) {
      loadCards(searchQuery);
    } else {
      setCards([]);
    }
  }, [searchQuery]);

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
      loadCards(searchQuery);
    }
  }, [searchQuery]);

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