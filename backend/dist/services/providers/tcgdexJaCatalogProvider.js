"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tcgdexJaCatalogProvider = exports.TcgdexJaCatalogProvider = exports.JA_PRIORITY_SET_IDS = void 0;
const logger_1 = require("../../utils/logger");
const matchName_1 = require("../../utils/matchName");
const TCGDEX_JA_BASE = 'https://api.tcgdex.net/v2/ja';
const REQUEST_TIMEOUT_MS = 12000;
const DETAIL_CONCURRENCY = 8;
/** High-liquidity JP sets to sync first (PriceCharting coverage + investable). */
exports.JA_PRIORITY_SET_IDS = [
    'SV2a', // ポケモンカード151
    'SV4a', // シャイニートレジャーex
    'S12a', // VSTARユニバース
    'SV5a', // クリムゾンヘイズ / related modern
    'SV6a', // ナイトワンダラー
    'SV7a', // 楽園ドラゴーナ
    'SV8a', // テラスタルフェスex
    'SV1a', // トリプレットビート
    'SV1S', // スカーレットex
    'SV1V', // バイオレットex
    'SV3a', // レイジングサーフ
    'SV5K', // ワイルドフォース
    'SV5M', // サイバージャッジ
];
async function fetchJson(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        });
        if (response.status === 404)
            return null;
        if (!response.ok) {
            throw new Error(`TCGdex JA fetch failed (${response.status}): ${url}`);
        }
        return (await response.json());
    }
    finally {
        clearTimeout(timeout);
    }
}
const toImageUrls = (imageBase) => {
    if (!imageBase)
        return {};
    return {
        small: `${imageBase}/low.webp`,
        large: `${imageBase}/high.webp`,
    };
};
const firstDexId = (dexId) => {
    if (dexId == null)
        return undefined;
    return Array.isArray(dexId) ? dexId[0] : dexId;
};
const mapCard = (brief, detail, setDetail) => {
    var _a, _b, _c, _d, _e, _f;
    const name = (detail === null || detail === void 0 ? void 0 : detail.name) || brief.name;
    const dexId = firstDexId(detail === null || detail === void 0 ? void 0 : detail.dexId);
    const matchName = (0, matchName_1.resolveMatchName)({
        language: 'ja',
        cardName: name,
        dexId,
        suffix: detail === null || detail === void 0 ? void 0 : detail.suffix,
        category: detail === null || detail === void 0 ? void 0 : detail.category,
    });
    const images = toImageUrls((detail === null || detail === void 0 ? void 0 : detail.image) || brief.image);
    let tcgplayerProductId;
    let tcgplayerPrices;
    if ((_a = detail === null || detail === void 0 ? void 0 : detail.pricing) === null || _a === void 0 ? void 0 : _a.tcgplayer) {
        tcgplayerPrices = {};
        for (const [variant, entry] of Object.entries(detail.pricing.tcgplayer)) {
            if (!entry || typeof entry !== 'object')
                continue;
            if (entry.productId != null && !tcgplayerProductId) {
                tcgplayerProductId = String(entry.productId);
            }
            tcgplayerPrices[variant] = {
                low: (_b = entry.lowPrice) !== null && _b !== void 0 ? _b : undefined,
                mid: (_c = entry.midPrice) !== null && _c !== void 0 ? _c : undefined,
                high: (_d = entry.highPrice) !== null && _d !== void 0 ? _d : undefined,
                market: (_e = entry.marketPrice) !== null && _e !== void 0 ? _e : undefined,
            };
        }
    }
    return {
        cardId: ((detail === null || detail === void 0 ? void 0 : detail.id) || brief.id).toLowerCase(),
        cardName: name,
        setId: setDetail.id,
        setName: setDetail.name,
        setReleaseDate: setDetail.releaseDate || ((_f = detail === null || detail === void 0 ? void 0 : detail.set) === null || _f === void 0 ? void 0 : _f.releaseDate),
        cardNumber: (detail === null || detail === void 0 ? void 0 : detail.localId) || brief.localId,
        rarity: detail === null || detail === void 0 ? void 0 : detail.rarity,
        artist: detail === null || detail === void 0 ? void 0 : detail.illustrator,
        types: detail === null || detail === void 0 ? void 0 : detail.types,
        imageSmall: images.small,
        imageLarge: images.large,
        tcgplayerProductId,
        tcgplayerPrices,
        language: 'ja',
        matchName,
        dexId,
    };
};
async function mapPool(items, concurrency, worker) {
    const results = new Array(items.length);
    let next = 0;
    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (next < items.length) {
            const i = next++;
            results[i] = await worker(items[i]);
        }
    });
    await Promise.all(runners);
    return results;
}
/**
 * Catalog provider for Japanese Pokemon cards via TCGdex `/v2/ja`.
 * Prefer modern Scarlet/Violet-era sets first when syncing.
 */
class TcgdexJaCatalogProvider {
    async getSets(limit = 250) {
        const sets = (await fetchJson(`${TCGDEX_JA_BASE}/sets`)) || [];
        const priorityRank = new Map(exports.JA_PRIORITY_SET_IDS.map((id, i) => [id.toLowerCase(), exports.JA_PRIORITY_SET_IDS.length - i]));
        const scored = sets.map((s) => {
            var _a;
            const id = (s.id || '').toLowerCase();
            let score = (_a = priorityRank.get(id)) !== null && _a !== void 0 ? _a : 0;
            if (/^sv/.test(id))
                score += 100;
            if (/^s\d|^swsh|^svp/.test(id))
                score += 50;
            if (/151|vstar|shiny|ex/.test(id + (s.name || '').toLowerCase()))
                score += 20;
            return { set: s, score };
        });
        scored.sort((a, b) => b.score - a.score || a.set.id.localeCompare(b.set.id));
        return scored.slice(0, limit).map(({ set }) => ({
            id: set.id,
            name: set.name,
            releaseDate: set.releaseDate,
        }));
    }
    /** Sync only the listed set IDs (used for fast bootstrap). */
    async getPrioritySets(limit = exports.JA_PRIORITY_SET_IDS.length) {
        const all = await this.getSets(500);
        const byId = new Map(all.map((s) => [s.id.toLowerCase(), s]));
        const ordered = [];
        for (const id of exports.JA_PRIORITY_SET_IDS) {
            const hit = byId.get(id.toLowerCase());
            if (hit)
                ordered.push(hit);
        }
        // Fill remainder with other high-scoring modern sets.
        for (const s of all) {
            if (ordered.length >= limit)
                break;
            if (!ordered.some((o) => o.id.toLowerCase() === s.id.toLowerCase())) {
                ordered.push(s);
            }
        }
        return ordered.slice(0, limit);
    }
    async getCardsForSet(setId) {
        var _a;
        const setUrl = `${TCGDEX_JA_BASE}/sets/${encodeURIComponent(setId)}`;
        const setDetail = await fetchJson(setUrl);
        if (!((_a = setDetail === null || setDetail === void 0 ? void 0 : setDetail.cards) === null || _a === void 0 ? void 0 : _a.length)) {
            return [];
        }
        const briefs = setDetail.cards;
        const details = await mapPool(briefs, DETAIL_CONCURRENCY, async (brief) => {
            try {
                return await fetchJson(`${TCGDEX_JA_BASE}/cards/${encodeURIComponent(brief.id)}`);
            }
            catch (error) {
                logger_1.logger.debug('TCGdex JA card detail failed', {
                    cardId: brief.id,
                    error: error.message,
                });
                return null;
            }
        });
        return briefs.map((brief, i) => mapCard(brief, details[i], setDetail));
    }
    /**
     * Live name search across the full JA catalog (includes unsynced sets/promos).
     * Uses TCGdex filters, then hydrates card details for Browse-ready rows.
     */
    async searchCardsByName(name, limit = 250) {
        const trimmed = name.trim();
        if (trimmed.length < 2)
            return [];
        const briefs = (await fetchJson(`${TCGDEX_JA_BASE}/cards?name=${encodeURIComponent(trimmed)}`)) || [];
        const capped = briefs.slice(0, Math.min(Math.max(limit, 1), 500));
        if (!capped.length)
            return [];
        const details = await mapPool(capped, DETAIL_CONCURRENCY, async (brief) => {
            try {
                return await fetchJson(`${TCGDEX_JA_BASE}/cards/${encodeURIComponent(brief.id)}`);
            }
            catch (_a) {
                return null;
            }
        });
        return capped.map((brief, i) => {
            var _a, _b, _c;
            const detail = details[i];
            const setMeta = {
                id: ((_a = detail === null || detail === void 0 ? void 0 : detail.set) === null || _a === void 0 ? void 0 : _a.id) || brief.id.split('-').slice(0, -1).join('-') || brief.id,
                name: ((_b = detail === null || detail === void 0 ? void 0 : detail.set) === null || _b === void 0 ? void 0 : _b.name) || '',
                releaseDate: (_c = detail === null || detail === void 0 ? void 0 : detail.set) === null || _c === void 0 ? void 0 : _c.releaseDate,
            };
            return mapCard(brief, detail, setMeta);
        });
    }
}
exports.TcgdexJaCatalogProvider = TcgdexJaCatalogProvider;
exports.tcgdexJaCatalogProvider = new TcgdexJaCatalogProvider();
