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
import { PriceChart } from '../features/market/components/PriceChart';
import { AddToVaultModal } from '../features/vault/components/AddToVaultModal';
import { cardWishlistService } from '../services/cardWishlistService';
import { priceTrackingService } from '../services/priceTrackingService';
import { vaultService } from '../services/vaultService';
import { Heart, TrendingUp, Vault } from 'lucide-react';

interface CardModalContextValue {
  openCard: (card: PokemonCard | OnePieceCard) => void;
}

const CardModalContext = createContext<CardModalContextValue>({ openCard: () => {} });

export const useCardModal = () => useContext(CardModalContext);

function isPokemonCard(card: PokemonCard | OnePieceCard): card is PokemonCard {
  return 'types' in card || 'tcgplayer' in card || 'hp' in card;
}

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
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [isTracked, setIsTracked] = useState(false);
  const [isInVault, setIsInVault] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);

  useEffect(() => {
    if (!isOpen || !card) {
      setPriceHistory([]);
      return;
    }

    setIsWishlisted(cardWishlistService.isWishlisted(card.id, 'onepiece'));
    setIsTracked(priceTrackingService.isTracked(card.id, 'onepiece'));
    setIsInVault(vaultService.isInVault(card.id, 'onepiece'));

    const controller = new AbortController();
    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const history = await onePieceApi.getPriceHistory(card.id, card.marketPrice);
        if (!controller.signal.aborted) setPriceHistory(history);
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('Error fetching price history:', err);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoadingHistory(false);
      }
    };

    fetchHistory();
    return () => controller.abort();
  }, [isOpen, card, card?.id, card?.marketPrice]);

  if (!isOpen || !card) return null;

  const asPokemonShape: PokemonCard = {
    id: card.id,
    name: card.name,
    images: card.images,
    set: { id: card.set.id, name: card.set.name, releaseDate: '', total: 0 },
    number: card.number,
    rarity: card.rarity,
    marketPrice: card.marketPrice,
  };

  return (
    <>
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      role="button"
      tabIndex={0}
      aria-label="Close modal"
    >
      <div
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border-default bg-surface-raised p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={card.name}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1 text-ink-muted hover:bg-surface-hover hover:text-ink-primary"
          aria-label="Close"
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
            <h2 className="text-xl font-bold text-ink-primary">{card.name}</h2>
            <p className="mt-1 text-sm text-ink-muted">{card.id}</p>
            <p className="text-xs text-ink-muted">{card.set.name}</p>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              disabled={isTracked}
              onClick={() => {
                priceTrackingService.trackCard(card, 'onepiece');
                setIsTracked(true);
              }}
              className={isTracked ? 'btn-secondary opacity-70' : 'btn-secondary'}
            >
              <TrendingUp className="h-4 w-4" />
              {isTracked ? 'Tracking' : 'Track price'}
            </button>
            <button
              type="button"
              onClick={() => {
                const on = cardWishlistService.toggle(card, 'onepiece');
                setIsWishlisted(on);
              }}
              className={
                isWishlisted
                  ? 'inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent-muted px-3 py-1.5 text-sm text-accent'
                  : 'btn-secondary'
              }
            >
              <Heart className={`h-4 w-4 ${isWishlisted ? 'fill-current' : ''}`} />
              {isWishlisted ? 'Wishlisted' : 'Wishlist'}
            </button>
            <button
              type="button"
              onClick={() => setVaultOpen(true)}
              className={isInVault ? 'btn-secondary' : 'btn-primary'}
            >
              <Vault className="h-4 w-4" />
              {isInVault ? 'In vault' : 'Add to vault'}
            </button>
          </div>

          <div className="grid w-full grid-cols-2 gap-3 text-sm">
            {card.cardColor && (
              <div className="rounded-lg bg-surface-inset p-3">
                <p className="text-xs text-ink-muted">Color</p>
                <p className="font-medium text-ink-primary">{card.cardColor}</p>
              </div>
            )}
            {card.cardType && (
              <div className="rounded-lg bg-surface-inset p-3">
                <p className="text-xs text-ink-muted">Type</p>
                <p className="font-medium text-ink-primary">{card.cardType}</p>
              </div>
            )}
            {card.rarity && (
              <div className="rounded-lg bg-surface-inset p-3">
                <p className="text-xs text-ink-muted">Rarity</p>
                <p className="font-medium text-ink-primary">{card.rarity}</p>
              </div>
            )}
            {card.cardCost && (
              <div className="rounded-lg bg-surface-inset p-3">
                <p className="text-xs text-ink-muted">Cost</p>
                <p className="font-medium text-ink-primary">{card.cardCost}</p>
              </div>
            )}
            {card.cardPower && (
              <div className="rounded-lg bg-surface-inset p-3">
                <p className="text-xs text-ink-muted">Power</p>
                <p className="font-medium text-ink-primary">{card.cardPower}</p>
              </div>
            )}
            {card.counterAmount != null && (
              <div className="rounded-lg bg-surface-inset p-3">
                <p className="text-xs text-ink-muted">Counter</p>
                <p className="font-medium text-ink-primary">{card.counterAmount}</p>
              </div>
            )}
            {card.marketPrice != null && (
              <div className="col-span-2 rounded-lg bg-accent-muted p-3">
                <p className="text-xs text-accent">
                  {card.priceSource === 'tcgplayer' ? 'TCGPlayer Market Price' : 'Market Price'}
                </p>
                <p className="text-lg font-bold text-ink-primary">${card.marketPrice.toFixed(2)}</p>
              </div>
            )}
          </div>

          <div className="w-full">
            {isLoadingHistory ? (
              <div className="flex items-center justify-center rounded-lg bg-surface-inset p-4">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
                <span className="ml-2 text-sm text-ink-muted">Loading price history...</span>
              </div>
            ) : priceHistory.length > 0 ? (
              <div className="rounded-lg bg-surface-inset p-3">
                <p className="mb-2 text-xs text-ink-muted">
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
              <p className="mb-1 text-xs text-ink-muted">Card Text</p>
              <p className="whitespace-pre-wrap text-sm text-ink-secondary">{card.cardText}</p>
            </div>
          )}
        </div>
      </div>
    </div>
    <AddToVaultModal
      card={asPokemonShape}
      isOpen={vaultOpen}
      onClose={() => setVaultOpen(false)}
      onSuccess={() => setIsInVault(vaultService.isInVault(card.id, 'onepiece'))}
      game="onepiece"
    />
    </>
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
        if (!controller.signal.aborted && fetchingRef.current === cardId && fetched) {
          setPokemonCard(fetched);
          loadedRef.current = cardId;
        }
      }).catch(() => {
        if (!controller.signal.aborted) {
          console.warn(`Failed to fetch Pokemon card: ${cardId}`);
        }
      });
    }

    if (isOnePiece) {
      onePieceApi.getCardById(cardId).then((fetched) => {
        if (!controller.signal.aborted && fetchingRef.current === cardId && fetched) {
          setOpCard(fetched);
          loadedRef.current = cardId;
        }
      }).catch(() => {
        if (!controller.signal.aborted) {
          console.warn(`Failed to fetch One Piece card: ${cardId}`);
        }
      });
    }

    return () => {
      controller.abort();
    };
  }, [cardId, isPokemon, isOnePiece]);

  const openCard = useCallback(
    (next: PokemonCard | OnePieceCard) => {
      if (isPokemonCard(next)) {
        setPokemonCard(next);
        setOpCard(null);
      } else {
        setOpCard(next);
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
