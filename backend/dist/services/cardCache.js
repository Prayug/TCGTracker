"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCacheKey = exports.savePersistentPokemonCache = exports.getPersistentPokemonCache = exports.POKEMON_PERSISTENT_CACHE_TTL = exports.POKEMON_CACHE_TTL = exports.CACHE_TTL = exports.pokemonApiCache = exports.cardImageCache = void 0;
// Card cache management utilities
const database_1 = require("../db/database");
exports.cardImageCache = new Map();
exports.pokemonApiCache = new Map();
exports.CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
exports.POKEMON_CACHE_TTL = 1000 * 60 * 5; // 5 minutes
exports.POKEMON_PERSISTENT_CACHE_TTL = 1000 * 60 * 60 * 6; // 6 hours
const MAX_CARD_IMAGE_CACHE_SIZE = 5000;
const MAX_POKEMON_API_CACHE_SIZE = 200;
// Periodically evict stale entries from in-memory caches to prevent unbounded growth
const evictStaleEntries = (cache, maxSize, ttl) => {
    var _a, _b;
    if (cache.size <= maxSize)
        return;
    const now = Date.now();
    // First pass: remove expired entries
    for (const [key, value] of cache) {
        const age = (_b = (_a = value.timestamp) !== null && _a !== void 0 ? _a : value.fetchedAt) !== null && _b !== void 0 ? _b : 0;
        if (now - age > ttl) {
            cache.delete(key);
        }
    }
    // Second pass: if still over limit, remove oldest
    if (cache.size > maxSize) {
        const entries = [...cache.entries()].sort(([, a], [, b]) => {
            var _a, _b, _c, _d;
            const ageA = (_b = (_a = a.timestamp) !== null && _a !== void 0 ? _a : a.fetchedAt) !== null && _b !== void 0 ? _b : 0;
            const ageB = (_d = (_c = b.timestamp) !== null && _c !== void 0 ? _c : b.fetchedAt) !== null && _d !== void 0 ? _d : 0;
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
    evictStaleEntries(exports.cardImageCache, MAX_CARD_IMAGE_CACHE_SIZE, exports.CACHE_TTL);
    evictStaleEntries(exports.pokemonApiCache, MAX_POKEMON_API_CACHE_SIZE, exports.POKEMON_CACHE_TTL);
}, 15 * 60 * 1000);
const getPersistentPokemonCache = (cacheKey) => {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.get(`SELECT cacheKey, query, setId, pageSize, fetchAll, maxPages, data, totalCount, pagesFetched, fetchedAt
       FROM pokemon_cache
       WHERE cacheKey = ?`, [cacheKey], (err, row) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(row || null);
            }
        });
    });
};
exports.getPersistentPokemonCache = getPersistentPokemonCache;
const savePersistentPokemonCache = (cacheKey, entry) => {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.run(`INSERT OR REPLACE INTO pokemon_cache
        (cacheKey, query, setId, pageSize, fetchAll, maxPages, data, totalCount, pagesFetched, fetchedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
        ], (err) => {
            if (err) {
                return reject(err);
            }
            resolve();
        });
    });
};
exports.savePersistentPokemonCache = savePersistentPokemonCache;
const getCacheKey = (cardName, setId, cardNumber) => {
    return `${cardName}|${setId}|${cardNumber || 'none'}`.toLowerCase();
};
exports.getCacheKey = getCacheKey;
