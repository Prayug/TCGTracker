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
