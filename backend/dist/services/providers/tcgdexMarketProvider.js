"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tcgdexMarketProvider = exports.TcgdexMarketProvider = void 0;
const logger_1 = require("../../utils/logger");
const normalizeVariantKey_1 = require("../../utils/normalizeVariantKey");
const TCGDEX_BASE_URL = 'https://api.tcgdex.net/v2/en';
class TcgdexMarketProvider {
    constructor() {
        this.timeoutMs = 8000;
        this.fetchFailureCount = 0;
        this.nextFailureLogAt = 5;
    }
    get failureCount() {
        return this.fetchFailureCount;
    }
    async fetchCard(cardId) {
        const url = `${TCGDEX_BASE_URL}/cards/${encodeURIComponent(cardId)}`;
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
        var _a;
        try {
            const card = await this.fetchCard(cardId);
            this.fetchFailureCount = 0;
            this.nextFailureLogAt = 25;
            if (!((_a = card === null || card === void 0 ? void 0 : card.pricing) === null || _a === void 0 ? void 0 : _a.tcgplayer) || !card.set) {
                return null;
            }
            const points = Object.entries(card.pricing.tcgplayer)
                .map(([rawVariantName, value]) => {
                var _a, _b;
                const marketPrice = (_a = value.marketPrice) !== null && _a !== void 0 ? _a : 0;
                if (marketPrice <= 0) {
                    return null;
                }
                return {
                    variantKey: (0, normalizeVariantKey_1.normalizeVariantKey)(rawVariantName),
                    rawVariantName,
                    productId: (_b = value.productId) !== null && _b !== void 0 ? _b : 0,
                    marketPrice,
                    lowPrice: value.lowPrice,
                    highPrice: value.highPrice,
                    volume: value.volume,
                };
            })
                .filter((point) => Boolean(point));
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
            if (this.fetchFailureCount >= this.nextFailureLogAt) {
                logger_1.logger.error('TCGdex market fetch failing repeatedly', {
                    failures: this.fetchFailureCount,
                    sampleCardId: cardId,
                    error: error.message,
                });
                this.nextFailureLogAt += 25;
            }
            return null;
        }
    }
}
exports.TcgdexMarketProvider = TcgdexMarketProvider;
exports.tcgdexMarketProvider = new TcgdexMarketProvider();
