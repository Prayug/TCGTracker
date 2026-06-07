import { SetTrackerCard } from '../services/setTrackerService';

export type SetCardSort = 'number' | 'price-high' | 'price-low' | 'name' | 'rarity';

const cardNumberSortKey = (number: string): number => {
  const parsed = parseInt(number, 10);
  return Number.isNaN(parsed) ? 99999 : parsed;
};

const rarityRank = (rarity?: string): number => {
  if (!rarity) return 0;
  const key = rarity.toLowerCase();
  if (key.includes('secret')) return 6;
  if (key.includes('ultra') || key.includes('illustration') || key.includes('special')) return 5;
  if (key.includes('holo')) return 4;
  if (key.includes('rare')) return 3;
  if (key.includes('uncommon')) return 2;
  return 1;
};

export const sortSetTrackerCards = (
  cards: SetTrackerCard[],
  sortBy: SetCardSort
): SetTrackerCard[] => {
  const sorted = [...cards];
  const price = (c: SetTrackerCard) => c.marketPrice ?? 0;

  switch (sortBy) {
    case 'price-high':
      return sorted.sort((a, b) => price(b) - price(a) || a.name.localeCompare(b.name));
    case 'price-low':
      return sorted.sort((a, b) => price(a) - price(b) || a.name.localeCompare(b.name));
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'rarity':
      return sorted.sort(
        (a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || price(b) - price(a)
      );
    case 'number':
    default:
      return sorted.sort(
        (a, b) =>
          cardNumberSortKey(a.number) - cardNumberSortKey(b.number) ||
          a.name.localeCompare(b.name)
      );
  }
};
