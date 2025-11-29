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

