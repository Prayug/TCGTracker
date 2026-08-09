import type { PokemonCard } from '../types/pokemon';

const STORAGE_KEY = 'tcgtracker:card-ring:v2';
const TTL_MS = 24 * 60 * 60 * 1000; // 24h — ring art doesn't need minute-fresh prices

export type RingCachedCard = Pick<PokemonCard, 'id' | 'name' | 'marketPrice'> & {
  images: { small: string; large: string };
  set: Pick<PokemonCard['set'], 'id' | 'name' | 'releaseDate'> & { total: number };
};

interface RingCacheEntry {
  savedAt: number;
  maxSets: number;
  cardsPerSet: number;
  cards: RingCachedCard[];
}

let memory: RingCacheEntry | null = null;

function isValidEntry(value: unknown): value is RingCacheEntry {
  if (!value || typeof value !== 'object') return false;
  const e = value as RingCacheEntry;
  return (
    typeof e.savedAt === 'number' &&
    typeof e.maxSets === 'number' &&
    typeof e.cardsPerSet === 'number' &&
    Array.isArray(e.cards) &&
    e.cards.length > 0
  );
}

/** Slim card payload — only what the 3D ring needs (keeps localStorage small). */
export function toRingCachedCards(cards: PokemonCard[]): RingCachedCard[] {
  return cards
    .map((card) => {
      const small = card.images?.small || card.images?.large;
      if (!card.id || !card.set?.id || !small) return null;
      return {
        id: card.id,
        name: card.name,
        marketPrice: card.marketPrice,
        images: {
          small,
          large: card.images?.large || small,
        },
        set: {
          id: card.set.id,
          name: card.set.name,
          releaseDate: card.set.releaseDate,
          total: card.set.total ?? 0,
        },
      } satisfies RingCachedCard;
    })
    .filter((c): c is RingCachedCard => c !== null);
}

export function asPokemonCards(cards: RingCachedCard[]): PokemonCard[] {
  return cards as PokemonCard[];
}

export function readCardRingCache(
  maxSets: number,
  cardsPerSet: number
): { cards: PokemonCard[]; fresh: boolean } | null {
  const entry = memory ?? readStorage();
  if (!entry) return null;
  if (entry.maxSets !== maxSets || entry.cardsPerSet !== cardsPerSet) return null;
  memory = entry;
  return {
    cards: asPokemonCards(entry.cards),
    fresh: Date.now() - entry.savedAt < TTL_MS,
  };
}

export function writeCardRingCache(
  cards: PokemonCard[],
  maxSets: number,
  cardsPerSet: number
): void {
  const slim = toRingCachedCards(cards);
  if (slim.length === 0) return;

  const entry: RingCacheEntry = {
    savedAt: Date.now(),
    maxSets,
    cardsPerSet,
    cards: slim,
  };
  memory = entry;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Quota / private mode — in-memory still helps within the session
  }
}

function readStorage(): RingCacheEntry | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidEntry(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
