import type { PokemonCard } from '../../types/pokemon';

/** One light per Pokémon energy type; the stage takes the front card's colour. */
const TYPE_TONE: Record<string, string> = {
  Fire: '#ff7a3d',
  Water: '#4aa8ff',
  Grass: '#3fd37a',
  Lightning: '#f5c542',
  Psychic: '#c070ff',
  Fighting: '#d9774b',
  Darkness: '#7b86b8',
  Metal: '#9fb3c8',
  Dragon: '#d8a73a',
  Fairy: '#ff8fc8',
  Colorless: '#c9ced8',
};

export const DEFAULT_TONE = '#7f9bff';

export function heroTone(card: Pick<PokemonCard, 'types'> | null | undefined): string {
  const t = card?.types?.[0];
  return (t && TYPE_TONE[t]) || DEFAULT_TONE;
}
