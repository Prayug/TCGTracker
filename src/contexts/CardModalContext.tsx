import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { PokemonCard } from '../types/pokemon';
import { OnePieceCard } from '../types/onepiece';
import { pokemonApi } from '../services/pokemonApi';
import { onePieceApi } from '../services/onepieceApi';
import { useGame } from './GameContext';
import { InvestmentModal } from '../features/market/components/InvestmentModal';

interface CardModalContextValue {
  openCard: (card: PokemonCard | OnePieceCard) => void;
}

const CardModalContext = createContext<CardModalContextValue>({ openCard: () => {} });

export const useCardModal = () => useContext(CardModalContext);

function isPokemonCard(card: PokemonCard | OnePieceCard): card is PokemonCard {
  // Minimal slab/grade stubs often only have id/name/set/marketPrice — do not
  // require types/tcgplayer/hp or those clicks get misclassified as One Piece.
  if ('cardColor' in card || 'cardCost' in card || 'attribute' in card) return false;
  return (
    'types' in card ||
    'tcgplayer' in card ||
    'hp' in card ||
    'preferredVariant' in card ||
    ('set' in card && 'releaseDate' in (card.set ?? {}))
  );
}

export function CardModalProvider({ children }: { children: ReactNode }) {
  const { isPokemon, isOnePiece } = useGame();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pokemonCard, setPokemonCard] = useState<PokemonCard | null>(null);
  const [opCard, setOpCard] = useState<OnePieceCard | null>(null);
  const fetchingRef = useRef<string | null>(null);
  const loadedRef = useRef<string | null>(null);
  const cardId = searchParams.get('card');

  useEffect(() => {
    if (!cardId) return;
    if (loadedRef.current === cardId) return;

    const controller = new AbortController();
    fetchingRef.current = cardId;

    if (isPokemon) {
      pokemonApi.getCardById(cardId).then((fetched) => {
        if (!controller.signal.aborted && fetchingRef.current === cardId) {
          if (fetched) setPokemonCard(fetched);
          // Mark loaded even on a miss so we keep any stub already shown.
          loadedRef.current = cardId;
        }
      }).catch(() => {
        if (!controller.signal.aborted) {
          console.warn(`Failed to fetch Pokemon card: ${cardId}`);
          loadedRef.current = cardId;
        }
      });
    }

    if (isOnePiece) {
      onePieceApi.getCardById(cardId).then((fetched) => {
        if (!controller.signal.aborted && fetchingRef.current === cardId) {
          if (fetched) setOpCard(fetched);
          loadedRef.current = cardId;
        }
      }).catch(() => {
        if (!controller.signal.aborted) {
          console.warn(`Failed to fetch One Piece card: ${cardId}`);
          loadedRef.current = cardId;
        }
      });
    }

    return () => {
      controller.abort();
    };
  }, [cardId, isPokemon, isOnePiece]);

  const openCard = useCallback(
    (next: PokemonCard | OnePieceCard) => {
      // Prefer active game mode — grade/slab stubs lack types/tcgplayer/hp and
      // used to be misclassified as One Piece, so InvestmentModal never opened.
      if (isPokemon || (!isOnePiece && isPokemonCard(next))) {
        setPokemonCard(next as PokemonCard);
        setOpCard(null);
      } else {
        setOpCard(next as OnePieceCard);
        setPokemonCard(null);
      }
      // Show stub immediately; leave loadedRef unset so getCardById can enrich.
      fetchingRef.current = next.id;
      loadedRef.current = null;
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set('card', next.id);
          return params;
        },
        { preventScrollReset: true }
      );
    },
    [setSearchParams, isPokemon, isOnePiece]
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
    setPokemonCard(null);
    setOpCard(null);
    loadedRef.current = null;
    fetchingRef.current = null;
  }, [setSearchParams]);

  const value = useMemo(() => ({ openCard }), [openCard]);

  return (
    <CardModalContext.Provider value={value}>
      {children}
      {isPokemon && (
        <InvestmentModal card={pokemonCard} isOpen={Boolean(pokemonCard)} onClose={closeCard} />
      )}
      {isOnePiece && (
        <InvestmentModal card={opCard} isOpen={Boolean(opCard)} onClose={closeCard} />
      )}
    </CardModalContext.Provider>
  );
}
