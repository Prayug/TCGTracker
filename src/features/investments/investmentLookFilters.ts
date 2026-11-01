import { DEFAULT_DEAL_FILTERS, type DealFiltersState } from '../deals/types';

/**
 * Deals opens at a 12% discount, $5 saved, and a $10 market.
 * Worth a look uses the same controls but starts at any listing whose all-in
 * price is at or under TCGTracker market. The fair-entry screen and slab
 * scores already chose the cards.
 */
export const INVESTMENT_LOOK_FILTERS: DealFiltersState = {
  ...DEFAULT_DEAL_FILTERS,
  minDiscount: 0,
  minSavings: 0,
  minMarketValue: 0,
};
