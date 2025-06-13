import { PokemonCard, SortOption } from '../types/pokemon';
import { pokemonApi } from '../services/pokemonApi';

export const sortCards = (cards: PokemonCard[], sortBy: SortOption): PokemonCard[] => {
  const sorted = [...cards];

  switch (sortBy) {
    case 'price-high':
      return sorted.sort((a, b) => pokemonApi.extractCardPrice(b) - pokemonApi.extractCardPrice(a));
    
    case 'price-low':
      return sorted.sort((a, b) => pokemonApi.extractCardPrice(a) - pokemonApi.extractCardPrice(b));
    
    case 'name-asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    
    case 'name-desc':
      return sorted.sort((a, b) => b.name.localeCompare(a.name));
    
    case 'set-asc':
      return sorted.sort((a, b) => a.set.name.localeCompare(b.set.name));
    
    case 'set-desc':
      return sorted.sort((a, b) => b.set.name.localeCompare(a.set.name));
    
    case 'date-new':
      return sorted.sort((a, b) => new Date(b.set.releaseDate).getTime() - new Date(a.set.releaseDate).getTime());
    
    case 'date-old':
      return sorted.sort((a, b) => new Date(a.set.releaseDate).getTime() - new Date(b.set.releaseDate).getTime());
    
    case 'rarity':
      const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Rare Holo', 'Rare Ultra', 'Rare Secret'];
      return sorted.sort((a, b) => {
        const aIndex = rarityOrder.indexOf(a.rarity || '');
        const bIndex = rarityOrder.indexOf(b.rarity || '');
        return bIndex - aIndex;
      });
    
    default:
      return sorted;
  }
};

export const getSortOptions = (): { value: SortOption; label: string }[] => [
  { value: 'price-high', label: 'Price (High to Low)' },
  { value: 'price-low', label: 'Price (Low to High)' },
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
  { value: 'set-asc', label: 'Set (A-Z)' },
  { value: 'set-desc', label: 'Set (Z-A)' },
  { value: 'date-new', label: 'Release Date (Newest)' },
  { value: 'date-old', label: 'Release Date (Oldest)' },
  { value: 'rarity', label: 'Rarity (Rare First)' }
];