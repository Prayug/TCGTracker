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
import { OnePieceCard } from '../types/onepiece';
import { pokemonApi } from '../services/pokemonApi';
import { onePieceApi } from '../services/onepieceApi';
import { useGame } from './GameContext';
import { InvestmentModal } from '../features/market/components/InvestmentModal';
import { PriceChart } from '../features/market/components/PriceChart';

interface CardModalContextValue {
  /** Open the card detail modal. Writes `?card=<id>` so the URL is shareable. */
  openCard: (card: PokemonCard | OnePieceCard) => void;
}

const CardModalContext = createContext<CardModalContextValue>({ openCard: () => {} });

export const useCardModal = () => useContext(CardModalContext);

function OnePieceCardModal({
  card,
  isOpen,
  onClose,
}: {
  card: OnePieceCard | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [priceHistory, setPriceHistory] = useState<{ date: string; price: number }[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (!isOpen || !card) {
      setPriceHistory([]);
      return;
    }

    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const history = await onePieceApi.getPriceHistory(card.id);
        setPriceHistory(history);
      } catch (err) {
        console.error('Error fetching price history:', err);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [isOpen, card]);

  if (!isOpen || !card) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border-default bg-surface-raised p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1 text-ink-muted hover:bg-surface-hover hover:text-ink-primary"
        >
          &times;
        </button>

        <div className="flex flex-col items-center gap-4">
          {card.images?.large ? (
            <img
              src={card.images.large}
              alt={card.name}
              className="max-h-[50vh] rounded-lg object-contain"
            />
          ) : card.images?.small ? (
            <img
              src={card.images.small}
              alt={card.name}
              className="max-h-[50vh] rounded-lg object-contain"
            />
          ) : (
            <div className="flex h-48 w-32 items-center justify-center rounded-lg bg-surface-inset text-sm text-ink-muted">
              No image
            </div>
          )}

          <div className="w-full text-center">
            <h2 className="text-xl font-bold text-white">{card.name}</h2>
            <p className="mt-1 text-sm text-ink-muted">{card.id}</p>
            <p className="text-xs text-ink-muted">{card.set.name}</p>
          </div>

          <div className="grid w-full grid-cols-2 gap-3 text-sm">
            {card.cardColor && (
              <div className="rounded-lg bg-surface-inset p-3">
                <p className="text-xs text-ink-muted">Color</p>
                <p className="font-medium text-white">{card.cardColor}</p>
              </div>
            )}
            {card.cardType && (
              <div className="rounded-lg bg-surface-inset p-3">
                <p className="text-xs text-ink-muted">Type</p>
                <p className="font-medium text-white">{card.cardType}</p>
              </div>
            )}
            {card.rarity && (
              <div className="rounded-lg bg-surface-inset p-3">
                <p className="text-xs text-ink-muted">Rarity</p>
                <p className="font-medium text-white">{card.rarity}</p>
              </div>
            )}
            {card.cardCost && (
              <div className="rounded-lg bg-surface-inset p-3">
                <p className="text-xs text-ink-muted">Cost</p>
                <p className="font-medium text-white">{card.cardCost}</p>
              </div>
            )}
            {card.cardPower && (
              <div className="rounded-lg bg-surface-inset p-3">
                <p className="text-xs text-ink-muted">Power</p>
                <p className="font-medium text-white">{card.cardPower}</p>
              </div>
            )}
            {card.counterAmount != null && (
              <div className="rounded-lg bg-surface-inset p-3">
                <p className="text-xs text-ink-muted">Counter</p>
                <p className="font-medium text-white">{card.counterAmount}</p>
              </div>
            )}
            {card.marketPrice != null && (
              <div className="col-span-2 rounded-lg bg-accent-muted p-3">
                <p className="text-xs text-accent">Market Price</p>
                <p className="text-lg font-bold text-white">${card.marketPrice.toFixed(2)}</p>
              </div>
            )}
          </div>

          {/* Price History */}
          <div className="w-full">
            {isLoadingHistory ? (
              <div className="flex items-center justify-center rounded-lg bg-surface-inset p-4">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
                <span className="ml-2 text-sm text-ink-muted">Loading price history...</span>
              </div>
            ) : priceHistory.length > 0 ? (
              <div className="rounded-lg bg-surface-inset p-3">
                <p className="text-xs text-ink-muted mb-2">
                  Price History{priceHistory.length === 1 ? ' (updates daily)' : ''}
                </p>
                <PriceChart
                  priceHistory={priceHistory}
                  title="Market Price"
                  variant="dark"
                />
              </div>
            ) : (
              <div className="rounded-lg bg-surface-inset p-3 text-center">
                <p className="text-xs text-ink-muted">
                  No price history yet — the backend records prices daily after the first sync.
                </p>
              </div>
            )}
          </div>

          {card.cardText && card.cardText !== 'NULL' && (
            <div className="w-full rounded-lg bg-surface-inset p-3">
              <p className="text-xs text-ink-muted mb-1">Card Text</p>
              <p className="text-sm text-ink-secondary whitespace-pre-wrap">{card.cardText}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Hosts the global card detail modal, driven by the `?card=` search param.
 * Opening from a tile seeds the card object directly; landing on a shared
 * link fetches the card by id. Browser back closes the modal naturally.
 */
export function CardModalProvider({ children }: { children: ReactNode }) {
  const { isPokemon, isOnePiece } = useGame();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pokemonCard, setPokemonCard] = useState<PokemonCard | null>(null);
  const [opCard, setOpCard] = useState<OnePieceCard | null>(null);
  const cardId = searchParams.get('card');

  useEffect(() => {
    if (!cardId) return;

    if (isPokemon) {
      if (pokemonCard?.id === cardId) return;
      let cancelled = false;
      pokemonApi.getCardById(cardId).then((fetched) => {
        if (!cancelled && fetched) setPokemonCard(fetched);
      });
      return () => {
        cancelled = true;
      };
    }

    if (isOnePiece) {
      if (opCard?.id === cardId) return;
      let cancelled = false;
      onePieceApi.getCardById(cardId).then((fetched) => {
        if (!cancelled && fetched) setOpCard(fetched);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [cardId, isPokemon, isOnePiece, pokemonCard, opCard]);

  const openCard = useCallback(
    (next: PokemonCard | OnePieceCard) => {
      if ('tcgplayer' in next || 'types' in next) {
        setPokemonCard(next as PokemonCard);
        setOpCard(null);
      } else {
        setOpCard(next as OnePieceCard);
        setPokemonCard(null);
      }
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
    setPokemonCard(null);
    setOpCard(null);
  }, [setSearchParams]);

  const value = useMemo(() => ({ openCard }), [openCard]);

  return (
    <CardModalContext.Provider value={value}>
      {children}
      {isPokemon && (
        <InvestmentModal card={pokemonCard} isOpen={Boolean(cardId && pokemonCard)} onClose={closeCard} />
      )}
      {isOnePiece && (
        <OnePieceCardModal card={opCard} isOpen={Boolean(cardId && opCard)} onClose={closeCard} />
      )}
    </CardModalContext.Provider>
  );
}
