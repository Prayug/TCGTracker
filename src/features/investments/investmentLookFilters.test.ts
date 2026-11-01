import { describe, expect, it } from 'vitest';
import { DEFAULT_DEAL_FILTERS } from '../deals/types';
import { INVESTMENT_LOOK_FILTERS } from './investmentLookFilters';

describe('INVESTMENT_LOOK_FILTERS', () => {
  it('starts looser than the deals tab', () => {
    expect(INVESTMENT_LOOK_FILTERS.minDiscount).toBe(0);
    expect(INVESTMENT_LOOK_FILTERS.minSavings).toBe(0);
    expect(INVESTMENT_LOOK_FILTERS.minMarketValue).toBe(0);
    expect(INVESTMENT_LOOK_FILTERS.minDiscount).toBeLessThan(DEFAULT_DEAL_FILTERS.minDiscount);
    expect(INVESTMENT_LOOK_FILTERS.minSavings).toBeLessThan(DEFAULT_DEAL_FILTERS.minSavings);
    expect(INVESTMENT_LOOK_FILTERS.minMarketValue).toBeLessThan(
      DEFAULT_DEAL_FILTERS.minMarketValue
    );
    expect(INVESTMENT_LOOK_FILTERS.sort).toBe(DEFAULT_DEAL_FILTERS.sort);
  });
});
