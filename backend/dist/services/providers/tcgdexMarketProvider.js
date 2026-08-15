"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tcgdexJaMarketProvider = exports.tcgdexMarketProvider = exports.TcgdexMarketProvider = void 0;
const logger_1 = require("../../utils/logger");
const normalizeVariantKey_1 = require("../../utils/normalizeVariantKey");
const resolveListingPrice_1 = require("../../utils/resolveListingPrice");
/** Rough EUR→USD for Cardmarket snapshots when no TCGPlayer print exists. */
const EUR_TO_USD = 1.08;
class TcgdexMarketProvider {
    constructor(locale = 'en') {
        this.timeoutMs = 8000;
        this.fetchFailureCount = 0;
        this.nextFailureLogAt = 5;
        this.consecutiveFailures = 0;
        this.circuitOpen = false;
        this.circuitThreshold = 8;
        this.baseUrl = `https://api.tcgdex.net/v2/${locale}`;
        this.sourceTag = locale === 'ja' ? 'tcgdex_ja' : 'tcgdex';
    }
    get failureCount() {
        return this.fetchFailureCount;
    }
    get isCircuitOpen() {
        return this.circuitOpen;
    }
    resetCircuit() {
        this.circuitOpen = false;
        this.consecutiveFailures = 0;
        this.fetchFailureCount = 0;
        this.nextFailureLogAt = 5;
    }
    get localeSource() {
        return this.sourceTag;
    }
    async fetchCard(cardId) {
        const url = `${this.baseUrl}/cards/${encodeURIComponent(cardId)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        const response = await fetch(url, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
        if (response.status === 404) {
            return null;
        }
        if (!response.ok) {
            throw new Error(`TCGdex card fetch failed (${response.status})`);
        }
        return (await response.json());
    }
    async getSnapshotForCard(cardId, _cardName, _setId, _setName) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        if (this.circuitOpen) {
            return null;
        }
        try {
            const card = await this.fetchCard(cardId);
            this.fetchFailureCount = 0;
            this.consecutiveFailures = 0;
            this.nextFailureLogAt = 25;
            if (!(card === null || card === void 0 ? void 0 : card.set)) {
                return null;
            }
            const points = [];
            if ((_a = card.pricing) === null || _a === void 0 ? void 0 : _a.tcgplayer) {
                for (const [rawVariantName, value] of Object.entries(card.pricing.tcgplayer)) {
                    if (!value || typeof value !== 'object' || Array.isArray(value)) {
                        continue;
                    }
                    const marketPrice = (0, resolveListingPrice_1.resolveListingPrice)({
                        market: value.marketPrice,
                        mid: value.midPrice,
                        low: value.lowPrice,
                        high: value.highPrice,
                    });
                    if (marketPrice <= 0)
                        continue;
                    points.push({
                        variantKey: (0, normalizeVariantKey_1.normalizeVariantKey)(rawVariantName),
                        rawVariantName,
                        productId: (_b = value.productId) !== null && _b !== void 0 ? _b : 0,
                        marketPrice,
                        lowPrice: (_c = value.lowPrice) !== null && _c !== void 0 ? _c : undefined,
                        highPrice: (_d = value.highPrice) !== null && _d !== void 0 ? _d : undefined,
                        volume: value.volume,
                    });
                }
            }
            // Cardmarket fallback (common for Japanese prints) — convert EUR→USD.
            if (points.length === 0 && ((_e = card.pricing) === null || _e === void 0 ? void 0 : _e.cardmarket)) {
                const cm = card.pricing.cardmarket;
                const marketEur = (0, resolveListingPrice_1.resolveListingPrice)({
                    market: (_f = cm.trend) !== null && _f !== void 0 ? _f : cm.avg,
                    mid: cm.avg,
                    low: cm.low,
                });
                if (marketEur > 0) {
                    const marketPrice = Math.round(marketEur * EUR_TO_USD * 100) / 100;
                    points.push({
                        variantKey: 'normal',
                        rawVariantName: 'cardmarket',
                        productId: (_g = cm.idProduct) !== null && _g !== void 0 ? _g : 0,
                        marketPrice,
                        lowPrice: cm.low != null ? Math.round(cm.low * EUR_TO_USD * 100) / 100 : undefined,
                        highPrice: undefined,
                    });
                }
                const holoEur = (0, resolveListingPrice_1.resolveListingPrice)({
                    market: (_h = cm['trend-holo']) !== null && _h !== void 0 ? _h : cm['avg-holo'],
                    mid: cm['avg-holo'],
                    low: cm['low-holo'],
                });
                if (holoEur > 0) {
                    const marketPrice = Math.round(holoEur * EUR_TO_USD * 100) / 100;
                    points.push({
                        variantKey: 'holofoil',
                        rawVariantName: 'cardmarket-holo',
                        productId: (_j = cm.idProduct) !== null && _j !== void 0 ? _j : 0,
                        marketPrice,
                        lowPrice: cm['low-holo'] != null
                            ? Math.round(cm['low-holo'] * EUR_TO_USD * 100) / 100
                            : undefined,
                    });
                }
            }
            if (points.length === 0) {
                return null;
            }
            return {
                cardId: card.id,
                cardName: card.name,
                setId: card.set.id,
                setName: card.set.name,
                cardNumber: card.localId,
                points,
            };
        }
        catch (error) {
            this.fetchFailureCount += 1;
            this.consecutiveFailures += 1;
            if (this.consecutiveFailures >= this.circuitThreshold) {
                this.circuitOpen = true;
                logger_1.logger.error('TCGdex circuit open — skipping remaining live fetches', {
                    failures: this.fetchFailureCount,
                    sampleCardId: cardId,
                    locale: this.baseUrl,
                    error: error.message,
                });
            }
            else if (this.fetchFailureCount >= this.nextFailureLogAt) {
                logger_1.logger.error('TCGdex market fetch failing repeatedly', {
                    failures: this.fetchFailureCount,
                    sampleCardId: cardId,
                    locale: this.baseUrl,
                    error: error.message,
                });
                this.nextFailureLogAt += 25;
            }
            return null;
        }
    }
}
exports.TcgdexMarketProvider = TcgdexMarketProvider;
exports.tcgdexMarketProvider = new TcgdexMarketProvider('en');
exports.tcgdexJaMarketProvider = new TcgdexMarketProvider('ja');
