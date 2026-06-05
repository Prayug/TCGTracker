import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { PokemonCard } from '../types/pokemon';
import { pokemonApi } from '../services/pokemonApi';
import { InvestmentModal } from '../features/market/components/InvestmentModal';

interface CardModalContextValue {
  /** Open the card detail modal. Writes `?card=<id>` so the URL is shareable. */
  openCard: (card: PokemonCard) => void;
}

const CardModalContext = createContext<CardModalContextValue>({ openCard: () => {} });

export const useCardModal = () => useContext(CardModalContext);

/**
 * Hosts the global card detail modal, driven by the `?card=` search param.
 * Opening from a tile seeds the card object directly; landing on a shared
 * link fetches the card by id. Browser back closes the modal naturally.
 */
export function CardModalProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [card, setCard] = useState<PokemonCard | null>(null);
  const cardId = searchParams.get('card');

  useEffect(() => {
    if (!cardId || card?.id === cardId) return;
    let cancelled = false;
    pokemonApi.getCardById(cardId).then((fetched) => {
      if (!cancelled && fetched) setCard(fetched);
    });
    return () => {
      cancelled = true;
    };
  }, [cardId, card]);

  const openCard = useCallback(
    (next: PokemonCard) => {
      setCard(next);
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set('card', next.id);
          return params;
        },
        { preventScrollReset: true }
      );
    },
    [setSearchParams]
  );

  const closeCard = useCallback(() => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete('card');
        return params;
      },
      { preventScrollReset: true }
    );
    setCard(null);
  }, [setSearchParams]);

  const value = useMemo(() => ({ openCard }), [openCard]);

  return (
    <CardModalContext.Provider value={value}>
      {children}
      <InvestmentModal card={card} isOpen={Boolean(cardId && card)} onClose={closeCard} />
    </CardModalContext.Provider>
  );
}
