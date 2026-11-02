import type { PokemonCard } from '../../types/pokemon';
import {
  type AnyCard,
  getCardDeltaPct,
  getCardPrice,
  isOnePieceCard,
  isPokemonCard,
} from '../../utils/cardPrice';
import { finishOf, type Finish } from '../../components/collectible/finish';

/**
 * Catalog view state lives in the URL so a filtered view can be shared,
 * bookmarked and restored with the back button.
 */
export type CatalogSort =
  | 'price-high'
  | 'price-low'
  | 'name-asc'
  | 'name-desc'
  | 'set-asc'
  | 'set-desc'
  | 'date-new'
  | 'date-old'
  | 'rarity';

/** grid = large cards, compact = dense cards, list = research table. */
export type CatalogView = 'grid' | 'compact' | 'list';
export type QuickFilter = 'all' | 'priced' | 'rising' | 'falling' | 'below-avg';
export type PriceBand = 'all' | 'under-10' | '10-50' | '50-150' | '150-plus';

export interface CatalogState {
  q: string;
  lang: 'en' | 'ja';
  sort: CatalogSort;
  view: CatalogView;
  quick: QuickFilter;
  set: string;
  rarity: string;
  type: string;
  price: PriceBand;
  /** Print finish read from rarity/variant ('' = any). */
  finish: Finish | '';
}

export const DEFAULT_CATALOG_STATE: CatalogState = {
  q: '',
  lang: 'en',
  sort: 'price-high',
  view: 'grid',
  quick: 'all',
  set: '',
  rarity: '',
  type: '',
  price: 'all',
  finish: '',
};

const SORTS: CatalogSort[] = [
  'price-high',
  'price-low',
  'name-asc',
  'name-desc',
  'set-asc',
  'set-desc',
  'date-new',
  'date-old',
  'rarity',
];
const QUICK: QuickFilter[] = ['all', 'priced', 'rising', 'falling', 'below-avg'];
const FINISHES: (Finish | '')[] = [
  '',
  'none',
  'holo',
  'reverse',
  'textured',
  'rainbow',
  'gold',
  'illustration',
];
const BANDS: PriceBand[] = ['all', 'under-10', '10-50', '50-150', '150-plus'];

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function parseCatalogState(params: URLSearchParams): CatalogState {
  return {
    q: params.get('q') ?? '',
    lang: params.get('lang') === 'ja' ? 'ja' : 'en',
    sort: oneOf(params.get('sort'), SORTS, DEFAULT_CATALOG_STATE.sort),
    view: oneOf(params.get('view'), ['grid', 'compact', 'list'] as const, 'grid'),
    quick: oneOf(params.get('quick'), QUICK, 'all'),
    set: params.get('set') ?? '',
    rarity: params.get('rarity') ?? '',
    type: params.get('type') ?? '',
    price: oneOf(params.get('price'), BANDS, 'all'),
    finish: oneOf(params.get('finish'), FINISHES, '' as Finish | ''),
  };
}

/** Writes only non-default values, so the plain catalog URL stays `/browse`. */
export function writeCatalogState(
  base: URLSearchParams,
  patch: Partial<CatalogState>
): URLSearchParams {
  const next = new URLSearchParams(base);
  for (const [key, value] of Object.entries(patch) as [keyof CatalogState, string][]) {
    const fallback = DEFAULT_CATALOG_STATE[key];
    if (value === undefined || value === '' || value === fallback) next.delete(key);
    else next.set(key, value);
  }
  return next;
}

export const PRICE_BANDS: { value: PriceBand; label: string }[] = [
  { value: 'under-10', label: 'Under $10' },
  { value: '10-50', label: '$10 – $50' },
  { value: '50-150', label: '$50 – $150' },
  { value: '150-plus', label: '$150 and up' },
];

export const QUICK_FILTERS: {
  value: Exclude<QuickFilter, 'all'>;
  label: string;
  pokemonOnly: boolean;
}[] = [
  { value: 'priced', label: 'Has market price', pokemonOnly: false },
  { value: 'rising', label: 'Rising this week', pokemonOnly: true },
  { value: 'falling', label: 'Falling this week', pokemonOnly: true },
  { value: 'below-avg', label: 'Below 30-day average', pokemonOnly: true },
];

/** A price only counts if it is a real positive quote. Unpriced is not "under $10". */
export function knownPrice(card: AnyCard): number | null {
  const p = getCardPrice(card);
  return Number.isFinite(p) && p > 0 ? p : null;
}

export function inPriceBand(price: number | null, band: PriceBand): boolean {
  if (band === 'all') return true;
  if (price == null) return false;
  switch (band) {
    case 'under-10':
      return price < 10;
    case '10-50':
      return price >= 10 && price < 50;
    case '50-150':
      return price >= 50 && price < 150;
    case '150-plus':
      return price >= 150;
  }
}

/** The card's type facet: Pokémon energy types, or One Piece colour. */
export function cardTypes(card: AnyCard): string[] {
  if (isPokemonCard(card)) return card.types ?? [];
  if (isOnePieceCard(card)) return card.cardColor ? [card.cardColor] : [];
  return [];
}

/**
 * Quick filters are defined by observable movement only. They use the
 * Cardmarket trend against its own 7- and 30-day averages, which is the
 * only movement data attached to search results; cards without that data
 * never match a movement filter.
 */
export function matchesQuick(card: AnyCard, quick: QuickFilter): boolean {
  if (quick === 'all') return true;
  if (quick === 'priced') return knownPrice(card) != null;
  if (!isPokemonCard(card)) return false;
  const d7 = getCardDeltaPct(card as PokemonCard, '7d');
  const d30 = getCardDeltaPct(card as PokemonCard, '30d');
  if (quick === 'rising') return d7 != null && d7 >= 5;
  if (quick === 'falling') return d7 != null && d7 <= -5;
  if (quick === 'below-avg') return d30 != null && d30 <= -8;
  return true;
}

export function applyCatalogFilters(cards: AnyCard[], state: CatalogState): AnyCard[] {
  return cards.filter((card) => {
    if (state.set && card.set?.name !== state.set) return false;
    if (state.rarity && (card.rarity || '') !== state.rarity) return false;
    if (state.type && !cardTypes(card).includes(state.type)) return false;
    if (!inPriceBand(knownPrice(card), state.price)) return false;
    if (state.finish && finishOf(card as PokemonCard) !== state.finish) return false;
    return matchesQuick(card, state.quick);
  });
}

export interface FacetOption {
  value: string;
  count: number;
}

function tally(values: string[]): FacetOption[] {
  const map = new Map<string, number>();
  for (const v of values) if (v) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function facetOptions(cards: AnyCard[]) {
  return {
    sets: tally(cards.map((c) => c.set?.name ?? '')),
    rarities: tally(cards.map((c) => c.rarity ?? '')),
    types: tally(cards.flatMap(cardTypes)),
  };
}

export function activeFacetCount(state: CatalogState): number {
  return [
    state.set,
    state.rarity,
    state.type,
    state.price !== 'all' ? state.price : '',
    state.finish,
  ].filter(Boolean).length;
}
