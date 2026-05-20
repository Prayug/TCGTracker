import { MarketplaceFilters } from '../features/cards/components/FilterSidebar';

export function countActiveMarketplaceFilters(filters: MarketplaceFilters): number {
  let count = 0;
  if (filters.setName !== 'all') count += 1;
  if (filters.rarity !== 'all') count += 1;
  if (filters.priceRange !== 'all') count += 1;
  if (filters.cardType !== 'all') count += 1;
  return count;
}
