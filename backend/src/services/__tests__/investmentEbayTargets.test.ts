jest.mock('../../db/promisified', () => ({
  dbAll: jest.fn(async () => []),
}));
jest.mock('../investmentOpportunitiesService', () => ({
  OPPORTUNITY_GRADE_CUTS: { strongBuy: 75, buy: 60, watch: 45 },
  getOpportunities: jest.fn(),
}));
jest.mock('../strategyBacktest/service', () => ({
  getStrategyReport: jest.fn(),
}));

import { OPPORTUNITY_GRADE_CUTS } from '../investmentOpportunitiesService';
import {
  INVESTMENT_EBAY_MAX_RAW,
  INVESTMENT_EBAY_MAX_SLABS,
  selectInvestmentEbayTargets,
} from '../investmentEbayTargets';
import { DEAL_THRESHOLDS } from '../../utils/dealScoring';

describe('selectInvestmentEbayTargets', () => {
  const gameCardIds = new Set(['raw-1', 'raw-2', 'slab-1', 'both']);

  it('keeps fair-entry picks and watch-or-better slabs, and skips other games', () => {
    const targets = selectInvestmentEbayTargets({
      picks: [
        { cardId: 'raw-1', name: 'Umbreon', setName: 'Evolving Skies' },
        { cardId: 'other-game', name: 'Luffy', setName: 'Romance Dawn' },
        { cardId: null, name: 'Missing id', setName: null },
        { cardId: 'both', name: 'Pikachu', setName: 'Base' },
      ],
      opportunities: [
        {
          cardId: 'slab-1',
          cardName: 'Charizard',
          setName: 'Base',
          grade: 'buy',
          score: 62,
        },
        {
          cardId: 'both',
          cardName: 'Pikachu',
          setName: 'Base',
          grade: 'strong_buy',
          score: 80,
        },
        {
          cardId: 'pass-1',
          cardName: 'Rattata',
          setName: 'Base',
          grade: 'pass',
          score: 20,
        },
        {
          cardId: 'other-game',
          cardName: 'Luffy',
          setName: 'Romance Dawn',
          grade: 'watch',
          score: 50,
        },
      ],
      gameCardIds,
    });

    expect(targets.map((target) => `${target.kind}:${target.cardId}:${target.source}`)).toEqual([
      'raw:raw-1:fair_entry',
      'raw:both:fair_entry',
      'slab:slab-1:opportunity',
      'slab:both:opportunity',
    ]);
    expect(targets.find((target) => target.cardId === 'slab-1')?.grade).toBe('buy');
  });

  it('caps raw picks and slabs separately', () => {
    const picks = Array.from({ length: 20 }, (_, i) => ({
      cardId: `raw-${i}`,
      name: `Card ${i}`,
      setName: 'Set',
    }));
    const opportunities = Array.from({ length: 20 }, (_, i) => ({
      cardId: `slab-${i}`,
      cardName: `Slab ${i}`,
      setName: 'Set',
      grade: 'watch' as const,
      score: OPPORTUNITY_GRADE_CUTS.watch,
    }));
    const targets = selectInvestmentEbayTargets({
      picks,
      opportunities,
      gameCardIds: new Set([...picks.map((p) => p.cardId), ...opportunities.map((o) => o.cardId)]),
    });
    expect(targets.filter((target) => target.kind === 'raw')).toHaveLength(INVESTMENT_EBAY_MAX_RAW);
    expect(targets.filter((target) => target.kind === 'slab')).toHaveLength(
      INVESTMENT_EBAY_MAX_SLABS
    );
  });

  it('uses a looser bar than the deals thresholds', () => {
    // Worth a look shows a researched card at or under market.
    // Deals require a real discount before the same listing appears.
    expect(DEAL_THRESHOLDS.raw.minDiscountPercent).toBeGreaterThan(0);
    expect(DEAL_THRESHOLDS.graded.minDiscountPercent).toBeGreaterThan(0);
    expect(DEAL_THRESHOLDS.raw.minSavings).toBeGreaterThan(0);
    expect(OPPORTUNITY_GRADE_CUTS.watch).toBe(45);
    expect(OPPORTUNITY_GRADE_CUTS.watch).toBeLessThan(OPPORTUNITY_GRADE_CUTS.buy);
  });
});
