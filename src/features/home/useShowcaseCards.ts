import { useEffect, useMemo, useState } from 'react';
import { pokemonApi } from '../../services/pokemonApi';
import { PriceHistoryApi } from '../../services/priceHistoryApi';
import { moverToCard } from '../../utils/topMovers';
import { holdingMarketValue } from '../../utils/vaultCost';
import { getCardPrice } from '../../utils/cardPrice';
import type { PokemonCard, VaultCard } from '../../types/pokemon';

/**
 * Iconic prints used for the visitor showcase. These are catalog IDs that are
 * looked up live, so names, images and prices come from the real catalog. Any
 * that fail to load are simply left out.
 */
export const ICONIC_POKEMON_IDS = [
  'swsh7-215', // Umbreon VMAX, alternate art
  'base1-4', // Charizard, Base Set
  'sv3pt5-199', // Charizard ex, 151 special illustration
  'neo1-9', // Lugia, Neo Genesis
  'swsh12pt5gg-GG44', // Mewtwo VSTAR, Crown Zenith gallery
  'base1-58', // Pikachu, Base Set
];

export interface ShowcaseCard {
  card: PokemonCard;
  /** Market estimate for one copy; null when the catalog has none. */
  price: number | null;
  /** For owned cards: quantity held. */
  quantity?: number;
  key: string;
}

export type ShowcaseSource = 'vault' | 'iconic' | 'movers' | 'none';

function priceOf(card: PokemonCard): number | null {
  const p = getCardPrice(card);
  return Number.isFinite(p) && p > 0 ? p : null;
}

const hasArt = (c: PokemonCard) => Boolean(c.images?.large || c.images?.small);

/** Owned cards ranked by holding value, artwork first. */
export function vaultShowcase(cards: VaultCard[], n = 6): ShowcaseCard[] {
  return [...cards]
    .filter((v) => hasArt(v.card))
    .sort((a, b) => holdingMarketValue(b) - holdingMarketValue(a))
    .slice(0, n)
    .map((v) => ({ card: v.card, price: priceOf(v.card), quantity: v.quantity, key: v.id }));
}

export function useShowcaseCards(
  vault: VaultCard[],
  isOnePiece: boolean
): { items: ShowcaseCard[]; source: ShowcaseSource; loading: boolean } {
  const owned = useMemo(() => vaultShowcase(vault), [vault]);
  const [remote, setRemote] = useState<{ items: ShowcaseCard[]; source: ShowcaseSource } | null>(
    null
  );

  const needRemote = owned.length < 3;

  useEffect(() => {
    if (!needRemote) return;
    let alive = true;
    (async () => {
      const iconic = isOnePiece
        ? []
        : (
            await Promise.all(
              ICONIC_POKEMON_IDS.map((id) => pokemonApi.getCardById(id).catch(() => null))
            )
          ).filter((c): c is PokemonCard => Boolean(c && hasArt(c)));
      if (iconic.length >= 3) {
        if (alive)
          setRemote({
            source: 'iconic',
            items: iconic.map((card) => ({ card, price: priceOf(card), key: card.id })),
          });
        return;
      }
      try {
        const movers = await PriceHistoryApi.getTopMovers(7, 30);
        const seen = new Set<string>();
        const cards = [...movers.gainers, ...movers.losers]
          .filter((e) => (e.imageLarge || e.imageSmall) && e.currentPrice > 0)
          .sort((a, b) => b.currentPrice - a.currentPrice)
          .map(moverToCard)
          .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
          .slice(0, 6);
        if (alive)
          setRemote({
            source: cards.length ? 'movers' : 'none',
            items: cards.map((card) => ({ card, price: priceOf(card), key: card.id })),
          });
      } catch {
        if (alive) setRemote({ source: 'none', items: [] });
      }
    })();
    return () => {
      alive = false;
    };
  }, [needRemote, isOnePiece]);

  if (!needRemote) return { items: owned, source: 'vault', loading: false };
  if (!remote) return { items: [], source: 'none', loading: true };
  return { ...remote, loading: false };
}
