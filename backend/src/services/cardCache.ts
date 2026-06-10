// Card cache management utilities
import { getDb } from '../db/database';

export interface CachedCard {
  card: any;
  images: { small: string; large: string };
  id: string;
  matchedSet: string;
  matchedNumber: string;
  timestamp: number;
  usedFallback?: boolean;
  attempts?: any[];
}

export interface PokemonApiCacheEntry {
  data: any[];
  totalCount: number;
  fetchedAt: number;
  pageSize: number;
  pagesFetched: number;
}

export interface PokemonPersistentCacheRow {
  cacheKey: string;
  query: string | null;
  setId: string | null;
  pageSize: number;
  fetchAll: number;
  maxPages: number;
  data: string;
  totalCount: number;
  pagesFetched: number;
  fetchedAt: number;
}

export const cardImageCache = new Map<string, CachedCard>();
export const pokemonApiCache = new Map<string, PokemonApiCacheEntry>();

export const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
export const POKEMON_CACHE_TTL = 1000 * 60 * 5; // 5 minutes
export const POKEMON_PERSISTENT_CACHE_TTL = 1000 * 60 * 60 * 6; // 6 hours

const MAX_CARD_IMAGE_CACHE_SIZE = 5000;
const MAX_POKEMON_API_CACHE_SIZE = 200;

// Periodically evict stale entries from in-memory caches to prevent unbounded growth
const evictStaleEntries = <T extends { timestamp?: number; fetchedAt?: number }>(
  cache: Map<string, T>,
  maxSize: number,
  ttl: number
): void => {
  if (cache.size <= maxSize) return;
  const now = Date.now();
  // First pass: remove expired entries
  for (const [key, value] of cache) {
    const age = value.timestamp ?? value.fetchedAt ?? 0;
    if (now - age > ttl) {
      cache.delete(key);
    }
  }
  // Second pass: if still over limit, remove oldest
  if (cache.size > maxSize) {
    const entries = [...cache.entries()].sort(([, a], [, b]) => {
      const ageA = a.timestamp ?? a.fetchedAt ?? 0;
      const ageB = b.timestamp ?? b.fetchedAt ?? 0;
      return ageA - ageB;
    });
    const toDelete = cache.size - maxSize;
    for (let i = 0; i < toDelete && i < entries.length; i++) {
      cache.delete(entries[i][0]);
    }
  }
};

// Run cache eviction every 15 minutes
setInterval(() => {
  evictStaleEntries(cardImageCache as any, MAX_CARD_IMAGE_CACHE_SIZE, CACHE_TTL);
  evictStaleEntries(pokemonApiCache as any, MAX_POKEMON_API_CACHE_SIZE, POKEMON_CACHE_TTL);
}, 15 * 60 * 1000);

export const getPersistentPokemonCache = (cacheKey: string): Promise<PokemonPersistentCacheRow | null> => {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT cacheKey, query, setId, pageSize, fetchAll, maxPages, data, totalCount, pagesFetched, fetchedAt
       FROM pokemon_cache
       WHERE cacheKey = ?`,
      [cacheKey],
      (err, row: PokemonPersistentCacheRow | null) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      }
    );
  });
};

export const savePersistentPokemonCache = (
  cacheKey: string,
  entry: {
    query: string;
    setId?: string;
    pageSize: number;
    fetchAll: boolean;
    maxPages: number;
    data: any[];
    totalCount: number;
    pagesFetched: number;
    fetchedAt: number;
  }
): Promise<void> => {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO pokemon_cache
        (cacheKey, query, setId, pageSize, fetchAll, maxPages, data, totalCount, pagesFetched, fetchedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cacheKey,
        entry.query,
        entry.setId || null,
        entry.pageSize,
        entry.fetchAll ? 1 : 0,
        entry.maxPages,
        JSON.stringify(entry.data),
        entry.totalCount,
        entry.pagesFetched,
        entry.fetchedAt
      ],
      (err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      }
    );
  });
};

export const getCacheKey = (cardName: string, setId: string, cardNumber?: string): string => {
  return `${cardName}|${setId}|${cardNumber || 'none'}`.toLowerCase();
};

