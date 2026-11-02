import { useEffect, useMemo, useState } from 'react';
import type { WishlistItem } from '../../services/cardWishlistService';
import type { PokemonCard } from '../../types/pokemon';
import type { OnePieceCard } from '../../types/onepiece';
import { pokemonApi } from '../../services/pokemonApi';
import { onePieceApi } from '../../services/onepieceApi';
import { getCardPrice } from '../../utils/cardPrice';
import { knownPrice, type LivePrice } from './wishlistModel';

const CONCURRENCY = 4;
const MAX_LOOKUPS = 120;

/**
 * Look up today's price for each wished card. Wishlist entries store the card
 * as it was when added, so its price can be weeks old. Results are kept in
 * memory only; the stored wishlist is never rewritten. Cards whose lookup
 * fails keep their saved price, labelled as such by the caller.
 */
export function useLivePrices(items: WishlistItem[], game: 'pokemon' | 'onepiece') {
  const ids = useMemo(
    () => Array.from(new Set(items.map((i) => i.card.id))).slice(0, MAX_LOOKUPS),
    [items]
  );
  const key = ids.join('|');
  const [prices, setPrices] = useState<Map<string, LivePrice>>(new Map());
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const todo = ids.filter((id) => !prices.has(id));
    if (todo.length === 0) return;
    setPending(todo.length);
    let next = 0;
    const worker = async () => {
      while (!cancelled && next < todo.length) {
        const id = todo[next++];
        let result: LivePrice | null = null;
        try {
          const card: PokemonCard | OnePieceCard | null =
            game === 'onepiece'
              ? await onePieceApi.getCardById(id)
              : await pokemonApi.getCardById(id);
          if (card) {
            result = {
              price: knownPrice(getCardPrice(card)),
              asOf: 'tcgplayer' in card ? card.tcgplayer?.updatedAt : undefined,
            };
          }
        } catch {
          result = null;
        }
        if (cancelled) return;
        if (result) {
          const r = result;
          setPrices((m) => new Map(m).set(id, r));
        }
        setPending((n) => Math.max(0, n - 1));
      }
    };
    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
    return () => {
      cancelled = true;
    };
    // Only re-run when the set of cards or the game changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, game]);

  return { prices, loading: pending > 0 };
}
