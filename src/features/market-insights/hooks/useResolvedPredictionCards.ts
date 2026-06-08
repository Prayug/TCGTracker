import { useMemo } from 'react';
import { CardPrediction } from '../types';
import { PokemonCard } from '../../../types/pokemon';
import { buildPokemonCardFromPrediction } from '../utils/predictionCard';

/** Build display cards from prediction payload (images come from the API / DB backfill). */
export function useResolvedPredictionCards(predictions: CardPrediction[]) {
  const cardsById = useMemo(() => {
    const next: Record<string, PokemonCard> = {};
    for (const prediction of predictions) {
      next[prediction.cardId] = buildPokemonCardFromPrediction(prediction);
    }
    return next;
  }, [predictions]);

  const cacheResolved = (_cardId: string, _card: PokemonCard) => {
    // No-op: cards are sourced from the predictions API, not client-side resolution.
  };

  return { cardsById, cacheResolved };
}
