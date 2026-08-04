import { describe, expect, it } from 'vitest';
import { normalizeName, normalizeSetKey } from '../gradeWorthinessService';

describe('grade worthiness image name normalization', () => {
  it('folds accents and hyphens', () => {
    expect(normalizeName('Pokémon GO')).toBe('pokemon go');
    expect(normalizeName('Charizard-GX')).toBe('charizard gx');
    expect(normalizeName('Charizard GX')).toBe('charizard gx');
    expect(normalizeName('Hidden Fates: Shiny Vault')).toBe('hidden fates shiny vault');
  });

  it('strips TCGCSV era prefixes from set labels', () => {
    expect(normalizeSetKey('SM - Celestial Storm')).toBe('celestial storm');
    expect(normalizeSetKey('SWSH - Evolving Skies')).toBe('evolving skies');
    expect(normalizeSetKey('Hidden Fates')).toBe('hidden fates');
    expect(normalizeSetKey('Pokemon GO')).toBe('pokemon go');
  });
});
