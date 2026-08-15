"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const investmentSignalEnrichment_1 = require("../investmentSignalEnrichment");
describe('investmentSignalEnrichment', () => {
    it('maps social source to reddit category', () => {
        expect((0, investmentSignalEnrichment_1.mapSignalCategory)('social', null)).toBe('reddit');
        expect((0, investmentSignalEnrichment_1.mapSignalCategory)('set_release', 'upcoming_set')).toBe('set_release');
    });
    it('computes bullish direction when sentiment and price align', () => {
        expect((0, investmentSignalEnrichment_1.computeSignalDirection)({
            sentiment: 0.5,
            price7dPct: 8,
            price30dPct: 12,
            riskType: null,
            category: 'news',
        })).toBe('bullish');
    });
    it('caps opportunity score below 100 for moderate signals', () => {
        const score = (0, investmentSignalEnrichment_1.computeOpportunityScore)({
            relevance: 0.6,
            sentiment: 0.3,
            direction: 'watch',
            price30dPct: 5,
            volumeChangePct: 10,
            sourceCount: 2,
            hasMarketData: false,
        });
        expect(score).toBeLessThan(80);
        expect(score).toBeGreaterThan(20);
    });
    it('raises confidence with market data and sources', () => {
        const low = (0, investmentSignalEnrichment_1.computeSignalConfidence)({
            hasCardMetrics: false,
            hasSetMetrics: false,
            volumeChangePct: null,
            sourceCount: 1,
            sparkPoints: 0,
        });
        const high = (0, investmentSignalEnrichment_1.computeSignalConfidence)({
            hasCardMetrics: true,
            hasSetMetrics: false,
            volumeChangePct: 15,
            sourceCount: 6,
            sparkPoints: 10,
        });
        expect(high).toBeGreaterThan(low);
    });
    it('extracts set entity from youtube title', () => {
        const entity = (0, investmentSignalEnrichment_1.resolveSignalEntity)({
            title: 'REVEALING Pokémon Pull Rates from Destined Rivals! #pokemontcg',
            summary: null,
            setName: null,
            cardName: null,
            category: 'youtube',
        });
        expect(entity.entityType).toBe('set');
        expect(entity.entityName.toLowerCase()).toContain('destined rivals');
        expect((0, investmentSignalEnrichment_1.buildEntityLabel)(entity.entityType, entity.entityName)).toContain('(Set)');
    });
    it('builds interpreted signal title for source-only momentum', () => {
        const entity = (0, investmentSignalEnrichment_1.resolveSignalEntity)({
            title: 'Huge New Mega Rayquaza Set Officially Revealed!',
            summary: null,
            setName: null,
            cardName: null,
            category: 'youtube',
        });
        const title = (0, investmentSignalEnrichment_1.buildSignalTitle)({
            entityName: entity.entityName,
            entityType: entity.entityType,
            direction: 'watch',
            category: 'youtube',
            hasMarketConfirmation: false,
            metrics: {
                price7dPct: null,
                price30dPct: null,
                volumeChangePct: null,
                liquidityTier: null,
                liquidityLabel: null,
            },
        });
        expect(title.toLowerCase()).not.toContain('god pack');
        expect(title.length).toBeLessThan(80);
    });
    it('classifies score-0 neutral as monitor tier', () => {
        expect((0, investmentSignalEnrichment_1.classifySignalTier)({
            opportunityScore: 0,
            confidence: 32,
            hasMarketConfirmation: false,
            direction: 'neutral',
        })).toBe('monitor');
    });
    it('detects market confirmation from price metrics', () => {
        expect((0, investmentSignalEnrichment_1.hasMarketConfirmation)({ price7dPct: 5, price30dPct: null, volumeChangePct: null, liquidityTier: null, liquidityLabel: null }, [])).toBe(true);
    });
    it('builds youtube thumbnail url from watch link', () => {
        const { sourceThumbnailUrl } = require('../investmentSignalEnrichment');
        expect(sourceThumbnailUrl('https://youtube.com/watch?v=dQw4w9WgXcQ')).toContain('dQw4w9WgXcQ');
    });
});
