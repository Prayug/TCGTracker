"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const predictionEngine_1 = require("../predictionEngine");
describe('prediction tracking quality', () => {
    it('dedupes same-day quotes preferring tcgdex', () => {
        const deduped = (0, predictionEngine_1.dedupePriceHistoryByDate)([
            { date: '2026-06-01', price: 110, source: 'catalog_fallback' },
            { date: '2026-06-01', price: 150, source: 'tcgdex' },
            { date: '2026-06-02', price: 150, source: 'tcgdex' },
        ]);
        expect(deduped).toHaveLength(2);
        expect(deduped[0].price).toBe(150);
    });
    it('counts live tcgdex quotes by distinct day', () => {
        expect((0, predictionEngine_1.countLiveQuotes)([
            { date: '2026-06-01', price: 1, source: 'tcgdex' },
            { date: '2026-06-01', price: 2, source: 'tcgdex' },
            { date: '2026-06-02', price: 3, source: 'catalog_fallback' },
        ])).toBe(1);
    });
    it('rejects cliffy step-function series like Sharpedo holofoil', () => {
        // Mirrors the real pattern: 219 → 112 cliff, only a handful of distinct prices.
        const prices = [
            ...Array.from({ length: 5 }, (_, i) => ({
                date: `2026-05-${String(27 + i).padStart(2, '0')}`,
                price: 219.99,
                source: 'tcgdex',
            })),
            ...Array.from({ length: 20 }, (_, i) => ({
                date: `2026-06-${String(1 + i).padStart(2, '0')}`,
                price: 112.5,
                source: 'tcgdex',
            })),
            ...Array.from({ length: 20 }, (_, i) => ({
                date: `2026-07-${String(1 + i).padStart(2, '0')}`,
                price: 150,
                source: 'tcgdex',
            })),
        ];
        const history = (0, predictionEngine_1.dedupePriceHistoryByDate)(prices);
        expect((0, predictionEngine_1.countDistinctPrices)(history)).toBeLessThan(5);
        expect((0, predictionEngine_1.calendarSpanDays)(history)).toBeGreaterThan(20);
        expect((0, predictionEngine_1.hasAdequateTrackingHistory)(history, (0, predictionEngine_1.countLiveQuotes)(prices), {
            minPoints: 14,
            setReleaseDate: '2005-02-01',
        })).toBe(false);
    });
    it('accepts gradual series with enough distinct live quotes', () => {
        const prices = Array.from({ length: 30 }, (_, i) => ({
            date: `2026-06-${String(i + 1).padStart(2, '0')}`,
            price: 10 + i * 0.15,
            source: 'tcgdex',
        }));
        const history = (0, predictionEngine_1.dedupePriceHistoryByDate)(prices);
        expect((0, predictionEngine_1.hasAdequateTrackingHistory)(history, (0, predictionEngine_1.countLiveQuotes)(prices), {
            minPoints: 14,
            setReleaseDate: '2020-01-01',
        })).toBe(true);
    });
    it('rejects single-quote catalog fallbacks', () => {
        const prices = [{ date: '2026-06-01', price: 110.22, source: 'catalog_fallback' }];
        const history = (0, predictionEngine_1.dedupePriceHistoryByDate)(prices);
        expect((0, predictionEngine_1.hasAdequateTrackingHistory)(history, (0, predictionEngine_1.countLiveQuotes)(prices), {
            minPoints: 14,
            setReleaseDate: '2005-02-01',
        })).toBe(false);
    });
});
