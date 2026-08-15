"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const investmentOpportunitiesService_1 = require("../investmentOpportunitiesService");
describe('computeChange (mover math)', () => {
    it('computes absolute and percent change', () => {
        expect((0, investmentOpportunitiesService_1.computeChange)(120, 100)).toEqual({ changeAbs: 20, changePct: 20 });
        expect((0, investmentOpportunitiesService_1.computeChange)(90, 100)).toEqual({ changeAbs: -10, changePct: -10 });
    });
    it('guards against zero previous price', () => {
        expect((0, investmentOpportunitiesService_1.computeChange)(50, 0).changePct).toBe(0);
    });
});
describe('passesMoverThresholds', () => {
    const base = { currentPrice: 100, prevPrice: 90, historyPoints: 5 };
    it('accepts a $5+ move above min price with enough history', () => {
        expect((0, investmentOpportunitiesService_1.passesMoverThresholds)(base)).toBe(true);
    });
    it('accepts an 8%+ move even when the $ move is under $5', () => {
        // $20 → $22 = +10% but only +$2
        expect((0, investmentOpportunitiesService_1.passesMoverThresholds)({ currentPrice: 22, prevPrice: 20, historyPoints: 3 })).toBe(true);
    });
    it('rejects sub-threshold moves', () => {
        // +$4 and +4% — under both gates
        expect((0, investmentOpportunitiesService_1.passesMoverThresholds)({ currentPrice: 104, prevPrice: 100, historyPoints: 5 })).toBe(false);
    });
    it('rejects cards under the $20 floor', () => {
        expect((0, investmentOpportunitiesService_1.passesMoverThresholds)({ currentPrice: 15, prevPrice: 10, historyPoints: 5 })).toBe(false);
    });
    it('rejects series with fewer than 3 history points', () => {
        expect((0, investmentOpportunitiesService_1.passesMoverThresholds)({ ...base, historyPoints: 2 })).toBe(false);
    });
});
describe('characterToken', () => {
    it('extracts the character from suffixed names', () => {
        expect((0, investmentOpportunitiesService_1.characterToken)('Charizard ex')).toBe('charizard');
        expect((0, investmentOpportunitiesService_1.characterToken)('Mega Charizard EX')).toBe('charizard');
        expect((0, investmentOpportunitiesService_1.characterToken)('Pikachu VMAX')).toBe('pikachu');
        expect((0, investmentOpportunitiesService_1.characterToken)('Radiant Greninja')).toBe('greninja');
    });
    it('returns null for empty input', () => {
        expect((0, investmentOpportunitiesService_1.characterToken)(null)).toBeNull();
        expect((0, investmentOpportunitiesService_1.characterToken)('')).toBeNull();
    });
});
describe('moveCorrelation', () => {
    const series = (prices) => prices.map((price, i) => ({
        date: `2026-08-${String(i + 1).padStart(2, '0')}`,
        price,
    }));
    it('finds strong positive correlation for parallel moves', () => {
        const anchor = series([100, 102, 104, 103, 106, 108, 110]);
        const comp = series([50, 51, 52, 51.5, 53, 54, 55]);
        const result = (0, investmentOpportunitiesService_1.moveCorrelation)(anchor, comp);
        expect(result).not.toBeNull();
        expect(result.correlation).toBeGreaterThan(0.9);
        // Comp moves roughly 1:1 in % terms → +5% anchor ≈ +5% comp.
        expect(result.avgMovePer5Pct).toBeGreaterThan(3);
        expect(result.avgMovePer5Pct).toBeLessThan(7);
    });
    it('finds negative correlation for opposite moves', () => {
        const anchor = series([100, 102, 104, 103, 106, 108]);
        const comp = series([100, 98, 96, 97, 94, 92]);
        const result = (0, investmentOpportunitiesService_1.moveCorrelation)(anchor, comp);
        expect(result).not.toBeNull();
        expect(result.correlation).toBeLessThan(-0.9);
    });
    it('returns null with fewer than 5 overlapping returns', () => {
        expect((0, investmentOpportunitiesService_1.moveCorrelation)(series([100, 101, 102]), series([50, 51, 52]))).toBeNull();
    });
    it('returns null when one series is flat (zero variance)', () => {
        const anchor = series([100, 102, 104, 103, 106, 108]);
        const flat = series([50, 50, 50, 50, 50, 50]);
        expect((0, investmentOpportunitiesService_1.moveCorrelation)(anchor, flat)).toBeNull();
    });
});
describe('computeBuyoutScore (thresholds)', () => {
    it('scores zero-ish without a 15% spike', () => {
        const result = (0, investmentOpportunitiesService_1.computeBuyoutScore)({
            spikePct: 10,
            listedCount: 2,
            listedCountPrev: 12,
            velocityRatio: 2,
            liquidityTier: 'thin',
            premiumPctDelta: 8,
            popDelta: -3,
        });
        // No price_spike or supply_drain signals without the 15% gate.
        expect(result.signals).not.toContain('price_spike:+10%');
        expect(result.signals.some((s) => s.startsWith('supply_drain'))).toBe(false);
    });
    it('never emits supply_drain without a recorded baseline', () => {
        const result = (0, investmentOpportunitiesService_1.computeBuyoutScore)({
            spikePct: 30,
            listedCount: 2,
            listedCountPrev: null,
            velocityRatio: null,
            liquidityTier: 'thin',
            premiumPctDelta: null,
            popDelta: null,
        });
        expect(result.signals.some((s) => s.startsWith('supply_drain'))).toBe(false);
    });
    it('requires a measured >=30% drop from a meaningful baseline', () => {
        const smallBaseline = (0, investmentOpportunitiesService_1.computeBuyoutScore)({
            spikePct: 30,
            listedCount: 1,
            listedCountPrev: 2,
            velocityRatio: null,
            liquidityTier: 'ok',
            premiumPctDelta: null,
            popDelta: null,
        });
        expect(smallBaseline.signals.some((s) => s.startsWith('supply_drain'))).toBe(false);
        const shallowDrop = (0, investmentOpportunitiesService_1.computeBuyoutScore)({
            spikePct: 30,
            listedCount: 10,
            listedCountPrev: 12,
            velocityRatio: null,
            liquidityTier: 'ok',
            premiumPctDelta: null,
            popDelta: null,
        });
        expect(shallowDrop.signals.some((s) => s.startsWith('supply_drain'))).toBe(false);
        const realDrain = (0, investmentOpportunitiesService_1.computeBuyoutScore)({
            spikePct: 30,
            listedCount: 4,
            listedCountPrev: 12,
            velocityRatio: null,
            liquidityTier: 'ok',
            premiumPctDelta: null,
            popDelta: null,
        });
        expect(realDrain.signals).toContain('supply_drain:12->4_listed');
    });
    it('stacks all signals into a high active/late score', () => {
        const result = (0, investmentOpportunitiesService_1.computeBuyoutScore)({
            spikePct: 30,
            listedCount: 3,
            listedCountPrev: 12,
            velocityRatio: 2.1,
            liquidityTier: 'thin',
            premiumPctDelta: 9,
            popDelta: -2,
        });
        expect(result.score).toBeGreaterThanOrEqual(70);
        expect(result.phase).toBe('active');
        expect(result.signals).toEqual(expect.arrayContaining([
            expect.stringContaining('price_spike'),
            expect.stringContaining('supply_drain'),
            expect.stringContaining('velocity'),
            expect.stringContaining('thin_liquidity'),
            expect.stringContaining('premium_expansion'),
            'pop_tightening',
        ]));
    });
    it('marks huge spikes or empty shelves as late phase', () => {
        expect((0, investmentOpportunitiesService_1.computeBuyoutScore)({
            spikePct: 60,
            listedCount: 5,
            listedCountPrev: null,
            velocityRatio: null,
            liquidityTier: 'ok',
            premiumPctDelta: null,
            popDelta: null,
        }).phase).toBe('late');
        expect((0, investmentOpportunitiesService_1.computeBuyoutScore)({
            spikePct: 20,
            listedCount: 1,
            listedCountPrev: null,
            velocityRatio: null,
            liquidityTier: 'ok',
            premiumPctDelta: null,
            popDelta: null,
        }).phase).toBe('late');
    });
    it('marks a lone modest spike as early phase', () => {
        const result = (0, investmentOpportunitiesService_1.computeBuyoutScore)({
            spikePct: 16,
            listedCount: 20,
            listedCountPrev: 21,
            velocityRatio: null,
            liquidityTier: 'strong',
            premiumPctDelta: null,
            popDelta: null,
        });
        expect(result.phase).toBe('early');
        expect(result.score).toBeLessThan(55);
    });
});
describe('computeOpportunityScore (weighting)', () => {
    it('grades a strong confident prediction with momentum as strong_buy', () => {
        const { score, grade } = (0, investmentOpportunitiesService_1.computeOpportunityScore)({
            predictedReturn90d: 35,
            confidence: 85,
            momentumPct: 20,
            buyoutScore: 60,
            premiumVsSetMedian: -15,
            netSentiment: 0.6,
            compMomentumPct: 12,
        });
        expect(score).toBeGreaterThanOrEqual(75);
        expect(grade).toBe('strong_buy');
    });
    it('grades a negative prediction with weak momentum as pass', () => {
        const { score, grade } = (0, investmentOpportunitiesService_1.computeOpportunityScore)({
            predictedReturn90d: -15,
            confidence: 80,
            momentumPct: -10,
            buyoutScore: 0,
            premiumVsSetMedian: 20,
            netSentiment: -0.5,
            compMomentumPct: -5,
        });
        expect(score).toBeLessThan(45);
        expect(grade).toBe('pass');
    });
    it('pulls low-confidence predictions toward neutral', () => {
        const confident = (0, investmentOpportunitiesService_1.computeOpportunityScore)({
            predictedReturn90d: 35,
            confidence: 90,
            momentumPct: 0,
            buyoutScore: 0,
            premiumVsSetMedian: null,
            netSentiment: null,
            compMomentumPct: null,
        });
        const shaky = (0, investmentOpportunitiesService_1.computeOpportunityScore)({
            predictedReturn90d: 35,
            confidence: 10,
            momentumPct: 0,
            buyoutScore: 0,
            premiumVsSetMedian: null,
            netSentiment: null,
            compMomentumPct: null,
        });
        expect(confident.score).toBeGreaterThan(shaky.score);
    });
    it('falls back to momentum-weighted scoring without a prediction', () => {
        const withMomentum = (0, investmentOpportunitiesService_1.computeOpportunityScore)({
            predictedReturn90d: null,
            confidence: null,
            momentumPct: 25,
            buyoutScore: 50,
            premiumVsSetMedian: -10,
            netSentiment: 0.4,
            compMomentumPct: 10,
        });
        const flat = (0, investmentOpportunitiesService_1.computeOpportunityScore)({
            predictedReturn90d: null,
            confidence: null,
            momentumPct: 0,
            buyoutScore: 0,
            premiumVsSetMedian: null,
            netSentiment: null,
            compMomentumPct: null,
        });
        expect(withMomentum.score).toBeGreaterThan(flat.score);
        expect(withMomentum.grade).not.toBe('pass');
        // No momentum + no signals = nothing to act on.
        expect(flat.grade).toBe('pass');
    });
});
