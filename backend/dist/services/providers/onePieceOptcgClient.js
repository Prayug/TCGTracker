"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchOptcgJson = fetchOptcgJson;
exports.getAllOptcgCards = getAllOptcgCards;
exports.getOptcgSets = getOptcgSets;
exports.getOptcgSetCards = getOptcgSetCards;
exports.getOptcgCardVariants = getOptcgCardVariants;
exports.clearOptcgCatalogCache = clearOptcgCatalogCache;
const onePieceCatalogId_1 = require("../onePieceCatalogId");
const BASE_URL = 'https://optcgapi.com/api';
const CATALOG_CACHE_TTL_MS = 60 * 60 * 1000;
let cachedCatalog = null;
async function fetchOptcgJson(path) {
    const url = path.startsWith('http') ? path : `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
    const response = await fetch(url, {
        headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
        throw new Error(`OPTCG API ${response.status}: ${response.statusText}`);
    }
    return response.json();
}
const normalizeDonCard = (raw) => ({
    inventory_price: raw.inventory_price,
    market_price: raw.market_price,
    card_name: raw.card_name,
    set_name: "Don!! Cards",
    card_text: raw.card_text || '',
    set_id: 'DON',
    rarity: raw.rarity || 'DON!!',
    card_set_id: raw.card_image_id || raw.optcg_don_name || raw.card_name,
    card_color: '',
    card_type: raw.card_type || 'DON!!',
    life: null,
    card_cost: null,
    card_power: null,
    sub_types: null,
    counter_amount: null,
    attribute: null,
    date_scraped: raw.date_scraped,
    card_image_id: raw.card_image_id,
    card_image: raw.card_image,
});
const dedupeCards = (cards) => {
    const seen = new Map();
    for (const card of cards) {
        seen.set((0, onePieceCatalogId_1.buildOnePieceCatalogId)(card), card);
    }
    return Array.from(seen.values());
};
/**
 * Fetch the complete English OPTCG catalog:
 * booster sets + starter decks + promos + Don!! cards (~5,300+ rows).
 */
async function getAllOptcgCards(forceRefresh = false) {
    if (!forceRefresh && cachedCatalog && Date.now() - cachedCatalog.fetchedAt < CATALOG_CACHE_TTL_MS) {
        return cachedCatalog.cards;
    }
    const [setCards, stCards, promoCards, donCards] = await Promise.all([
        fetchOptcgJson('/allSetCards/'),
        fetchOptcgJson('/allSTCards/'),
        fetchOptcgJson('/promos/filtered/?card_name='),
        fetchOptcgJson('/allDonCards/').then((rows) => rows.map(normalizeDonCard)),
    ]);
    const merged = dedupeCards([...setCards, ...stCards, ...promoCards, ...donCards]);
    cachedCatalog = { fetchedAt: Date.now(), cards: merged };
    return merged;
}
async function getOptcgSets() {
    const [boosters, decks] = await Promise.all([
        fetchOptcgJson('/allSets/'),
        fetchOptcgJson('/allDecks/'),
    ]);
    const starterSets = decks.map((d) => ({
        set_id: d.structure_deck_id,
        set_name: d.structure_deck_name,
    }));
    return [
        ...boosters,
        ...starterSets,
        { set_id: 'PROMO', set_name: 'Promo Cards' },
        { set_id: 'DON', set_name: 'Don!! Cards' },
    ];
}
async function getOptcgSetCards(setId) {
    if (setId === 'PROMO') {
        return fetchOptcgJson('/promos/filtered/?card_name=');
    }
    if (setId === 'DON') {
        const don = await fetchOptcgJson('/allDonCards/');
        return don.map(normalizeDonCard);
    }
    if (setId.startsWith('ST-')) {
        const all = await fetchOptcgJson('/allSTCards/');
        return all.filter((c) => c.set_id === setId);
    }
    return fetchOptcgJson(`/sets/${encodeURIComponent(setId)}/`);
}
async function getOptcgCardVariants(cardSetId) {
    const all = await getAllOptcgCards();
    const matches = all.filter((c) => c.card_set_id === cardSetId);
    if (matches.length > 0)
        return matches;
    try {
        const data = await fetchOptcgJson(`/sets/card/${encodeURIComponent(cardSetId)}/`);
        return Array.isArray(data) ? data : [data];
    }
    catch (_a) {
        try {
            const promo = await fetchOptcgJson(`/promos/card/${encodeURIComponent(cardSetId)}/`);
            return Array.isArray(promo) ? promo : [promo];
        }
        catch (_b) {
            return [];
        }
    }
}
function clearOptcgCatalogCache() {
    cachedCatalog = null;
}
