import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SortOption, FilterOption } from '../types/pokemon';
import { OnePieceSortOption } from '../types/onepiece';
import { pokemonApi } from '../services/pokemonApi';
import { onePieceApi } from '../services/onepieceApi';
import { useGame } from '../contexts/GameContext';
import { sortCards } from '../utils/sorting';
import {
  AnyCard,
  isPokemonCard,
  isOnePieceCard,
  getCardPrice,
  getCardName,
  getCardImage,
  getCardSet,
  getCardRarity,
  getCardId,
} from '../utils/cardPrice';

export type { AnyCard };
export { isPokemonCard, isOnePieceCard, getCardPrice, getCardName, getCardImage, getCardSet, getCardRarity, getCardId };

interface UseCardsReturn {
  cards: AnyCard[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  sortBy: SortOption | OnePieceSortOption;
  filterBy: FilterOption;
  setSearchQuery: (query: string) => void;
  setSortBy: (sort: SortOption | OnePieceSortOption) => void;
  setFilterBy: (filter: FilterOption) => void;
  refetch: () => void;
}

export function useCards(): UseCardsReturn {
  const { isPokemon, isOnePiece } = useGame();
  const [cards, setCards] = useState<AnyCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption | OnePieceSortOption>('price-high');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const abortRef = useRef<AbortController | null>(null);

  const loadCards = useCallback(
    async (query?: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setError(null);

      try {
        let result: AnyCard[] = [];

        if (isPokemon) {
          result = await pokemonApi.searchCards(query, undefined, 250);
        } else if (isOnePiece) {
          result = await onePieceApi.searchCards(query);
        }

        if (controller.signal.aborted) return;

        setCards(result);
      } catch (err) {
        if (controller.signal.aborted) return;
        const errorMessage = (err as Error).message;
        console.error('Error loading cards:', err);

        if (errorMessage.includes('504') || errorMessage.includes('Gateway Timeout')) {
          setError('API is slow to respond. Please try again in a moment.');
        } else if (errorMessage.includes('429')) {
          setError('Too many requests. Please wait a moment and try again.');
        } else {
          setError('Failed to load cards. Please try again.');
        }

        setCards([]);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [isPokemon, isOnePiece]
  );

  useEffect(() => {
    if (searchQuery.trim()) {
      loadCards(searchQuery);
    } else {
      setCards([]);
    }

    return () => {
      abortRef.current?.abort();
    };
  }, [searchQuery, loadCards]);

  const filteredCards = useMemo(() => {
    if (filterBy === 'all') return cards;

    if (isOnePiece) return cards;

    return cards.filter((card) => {
      if (!isPokemonCard(card) || !card.investmentData) return false;

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
  }, [cards, filterBy, isOnePiece]);

  const game = isOnePiece ? 'onepiece' : 'pokemon';
  const sortedCards = useMemo(() => sortCards(filteredCards, sortBy, game), [filteredCards, sortBy, game]);

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
    refetch,
  };
}
