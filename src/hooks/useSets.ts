import { useState, useEffect, useCallback } from 'react';
import { PokemonSet } from '../types/pokemon';
import { OnePieceSet } from '../types/onepiece';
import { pokemonApi } from '../services/pokemonApi';
import { onePieceApi } from '../services/onepieceApi';
import { useGame } from '../contexts/GameContext';

export type AnySet = PokemonSet | OnePieceSet;

export function isPokemonSet(s: AnySet): s is PokemonSet {
  return 'series' in s || 'era' in s || 'images' in s;
}

export function getSetName(s: AnySet): string {
  return s.name;
}

export function getSetId(s: AnySet): string {
  return s.id;
}

interface UseSetsReturn {
  sets: AnySet[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSets(): UseSetsReturn {
  const { isPokemon, isOnePiece } = useGame();
  const [sets, setSets] = useState<AnySet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSets = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      let result: AnySet[] = [];

      if (isPokemon) {
        result = await pokemonApi.getSets();
      } else if (isOnePiece) {
        result = await onePieceApi.getSets();
      }

      setSets(result);
    } catch (err) {
      console.error('Error loading sets:', err);
      setError('Failed to load sets. Please try again.');
      setSets([]);
    } finally {
      setIsLoading(false);
    }
  }, [isPokemon, isOnePiece]);

  useEffect(() => {
    loadSets();
  }, [loadSets]);

  const refetch = useCallback(() => {
    loadSets();
  }, [loadSets]);

  return { sets, isLoading, error, refetch };
}
