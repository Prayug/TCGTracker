import { ERA_ORDER, parseReleaseDate } from '@tcgtracker/shared';
import { PokemonSet } from '../types/pokemon';

export interface SetEraGroup {
  era: string;
  label: string;
  sets: PokemonSet[];
}

const eraIndex = new Map(ERA_ORDER.map((e, i) => [e.id, i]));

export const groupSetsByEra = (sets: PokemonSet[]): SetEraGroup[] => {
  const byEra = new Map<string, PokemonSet[]>();

  for (const set of sets) {
    const era = set.era || 'other';
    const list = byEra.get(era) || [];
    list.push(set);
    byEra.set(era, list);
  }

  const groups: SetEraGroup[] = [];
  for (const meta of ERA_ORDER) {
    const eraSets = byEra.get(meta.id);
    if (!eraSets?.length) continue;
    eraSets.sort((a, b) => {
      const dateDiff = parseReleaseDate(b.releaseDate) - parseReleaseDate(a.releaseDate);
      if (dateDiff !== 0) return dateDiff;
      return a.name.localeCompare(b.name);
    });
    groups.push({
      era: meta.id,
      label: eraSets[0]?.eraLabel || meta.label,
      sets: eraSets,
    });
  }

  for (const [era, eraSets] of byEra) {
    if (eraIndex.has(era)) continue;
    eraSets.sort((a, b) => parseReleaseDate(b.releaseDate) - parseReleaseDate(a.releaseDate));
    groups.push({
      era,
      label: eraSets[0]?.eraLabel || era,
      sets: eraSets,
    });
  }

  return groups;
};

export { formatReleaseYear } from '@tcgtracker/shared';
