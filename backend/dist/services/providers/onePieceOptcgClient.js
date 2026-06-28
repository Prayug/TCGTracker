"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
function fetchOptcgJson(path) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = path.startsWith('http') ? path : `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
        const response = yield fetch(url, {
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
            throw new Error(`OPTCG API ${response.status}: ${response.statusText}`);
        }
        return response.json();
    });
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
function getAllOptcgCards() {
    return __awaiter(this, arguments, void 0, function* (forceRefresh = false) {
        if (!forceRefresh && cachedCatalog && Date.now() - cachedCatalog.fetchedAt < CATALOG_CACHE_TTL_MS) {
            return cachedCatalog.cards;
        }
        const [setCards, stCards, promoCards, donCards] = yield Promise.all([
            fetchOptcgJson('/allSetCards/'),
            fetchOptcgJson('/allSTCards/'),
            fetchOptcgJson('/promos/filtered/?card_name='),
            fetchOptcgJson('/allDonCards/').then((rows) => rows.map(normalizeDonCard)),
        ]);
        const merged = dedupeCards([...setCards, ...stCards, ...promoCards, ...donCards]);
        cachedCatalog = { fetchedAt: Date.now(), cards: merged };
        return merged;
    });
}
function getOptcgSets() {
    return __awaiter(this, void 0, void 0, function* () {
        const [boosters, decks] = yield Promise.all([
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
    });
}
function getOptcgSetCards(setId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (setId === 'PROMO') {
            return fetchOptcgJson('/promos/filtered/?card_name=');
        }
        if (setId === 'DON') {
            const don = yield fetchOptcgJson('/allDonCards/');
            return don.map(normalizeDonCard);
        }
        if (setId.startsWith('ST-')) {
            const all = yield fetchOptcgJson('/allSTCards/');
            return all.filter((c) => c.set_id === setId);
        }
        return fetchOptcgJson(`/sets/${encodeURIComponent(setId)}/`);
    });
}
function getOptcgCardVariants(cardSetId) {
    return __awaiter(this, void 0, void 0, function* () {
        const all = yield getAllOptcgCards();
        const matches = all.filter((c) => c.card_set_id === cardSetId);
        if (matches.length > 0)
            return matches;
        try {
            const data = yield fetchOptcgJson(`/sets/card/${encodeURIComponent(cardSetId)}/`);
            return Array.isArray(data) ? data : [data];
        }
        catch (_a) {
            try {
                const promo = yield fetchOptcgJson(`/promos/card/${encodeURIComponent(cardSetId)}/`);
                return Array.isArray(promo) ? promo : [promo];
            }
            catch (_b) {
                return [];
            }
        }
    });
}
function clearOptcgCatalogCache() {
    cachedCatalog = null;
}
