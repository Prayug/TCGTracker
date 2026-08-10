import { PokemonSet } from '../types/pokemon';

export interface SetEraGroup {
  era: string;
  label: string;
  sets: PokemonSet[];
}

/** Newest eras first — keep in sync with backend/src/utils/setEra.ts */
const ERA_ORDER: Array<{ id: string; label: string }> = [
  { id: 'mega', label: 'Mega Evolution' },
  { id: 'sv', label: 'Scarlet & Violet' },
  { id: 'swsh', label: 'Sword & Shield' },
  { id: 'sm', label: 'Sun & Moon' },
  { id: 'xy', label: 'XY' },
  { id: 'bw', label: 'Black & White' },
  { id: 'col', label: 'Call of Legends' },
  { id: 'hgss', label: 'HeartGold & SoulSilver' },
  { id: 'dp', label: 'Diamond & Pearl' },
  { id: 'ex', label: 'EX Series' },
  { id: 'ecard', label: 'e-Card' },
  { id: 'neo', label: 'Neo' },
  { id: 'gym', label: 'Gym' },
  { id: 'base', label: 'Base' },
  { id: 'promo', label: 'Promos & Special' },
  { id: 'other', label: 'Other' },
];

const eraIndex = new Map(ERA_ORDER.map((e, i) => [e.id, i]));

const parseReleaseDate = (value?: string): number => {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
};

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

  // Any unknown era ids from the API
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

export const formatReleaseYear = (releaseDate: string): string => {
  if (!releaseDate) return '';
  const year = releaseDate.slice(0, 4);
  return year !== '1970' ? year : '';
};
