import { PokemonSet } from '../types/pokemon';

export interface SetEraGroup {
  era: string;
  label: string;
  sets: PokemonSet[];
}

export const groupSetsByEra = (sets: PokemonSet[]): SetEraGroup[] => {
  const groups: SetEraGroup[] = [];
  const seen = new Set<string>();

  for (const set of sets) {
    const era = set.era || 'other';
    if (seen.has(era)) continue;
    seen.add(era);
    groups.push({
      era,
      label: set.eraLabel || era,
      sets: sets.filter((s) => (s.era || 'other') === era),
    });
  }

  return groups;
};

export const formatReleaseYear = (releaseDate: string): string => {
  if (!releaseDate) return '';
  const year = releaseDate.slice(0, 4);
  return year !== '1970' ? year : '';
};
