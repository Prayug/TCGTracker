import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { PokemonCard } from '../types/pokemon';
import type { OnePieceCard } from '../types/onepiece';

/**
 * Card research navigation. The old giant modal is retired: opening a card
 * goes to the deep-linkable research page at /card/:id. The clicked card is
 * passed in router state so the page paints immediately while it enriches.
 * The context name is kept so the many existing call sites keep working.
 */
interface CardModalContextValue {
  openCard: (card: PokemonCard | OnePieceCard) => void;
}

export interface CardRouteState {
  card?: PokemonCard | OnePieceCard;
  /** Where the user came from, for the page's "Back to …" link. */
  from?: { pathname: string; search: string; label?: string };
}

const CardModalContext = createContext<CardModalContextValue>({ openCard: () => {} });

export const useCardModal = () => useContext(CardModalContext);

export const cardPath = (id: string) => `/card/${encodeURIComponent(id)}`;

export function CardModalProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const legacyCardId = searchParams.get('card');

  // Old share links used ?card=<id> on any page; send them to the research page.
  useEffect(() => {
    if (!legacyCardId) return;
    navigate(cardPath(legacyCardId), { replace: true });
  }, [legacyCardId, navigate]);

  const openCard = useCallback(
    (next: PokemonCard | OnePieceCard) => {
      const state: CardRouteState = {
        card: next,
        from: { pathname: location.pathname, search: location.search },
      };
      navigate(cardPath(next.id), { state });
    },
    [navigate, location.pathname, location.search]
  );

  const value = useMemo(() => ({ openCard }), [openCard]);

  return <CardModalContext.Provider value={value}>{children}</CardModalContext.Provider>;
}
