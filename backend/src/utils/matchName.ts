import { getPokedexEnglishName } from './pokedexEnNames';

/**
 * Build an ASCII matchName for Japanese cards from dexId + TCGdex suffix.
 * Falls back to null when we cannot derive a usable English name.
 */
export const buildMatchNameFromDex = (
  dexId: number | number[] | null | undefined,
  suffix?: string | null,
  category?: string | null
): string | null => {
  const id = Array.isArray(dexId) ? dexId[0] : dexId;
  const base = getPokedexEnglishName(id);
  if (!base) return null;

  // Trainers / Energy shouldn't get a Pokemon species name.
  if (category && /trainer|energy/i.test(category) && !suffix) {
    return null;
  }

  const suffixPart = (suffix || '').trim();
  if (!suffixPart) return base;

  // Modern TCG often prints "ex" (lowercase); older eras use "EX".
  if (
    suffixPart === 'EX' ||
    suffixPart === 'GX' ||
    suffixPart === 'V' ||
    suffixPart === 'VMAX' ||
    suffixPart === 'VSTAR'
  ) {
    return `${base} ${suffixPart}`;
  }
  if (/^ex$/i.test(suffixPart)) return `${base} ex`;
  return `${base} ${suffixPart}`;
};

/** Prefer an existing matchName; otherwise derive from dex + suffix. */
export const resolveMatchName = (opts: {
  matchName?: string | null;
  cardName?: string | null;
  language?: string | null;
  dexId?: number | number[] | null;
  suffix?: string | null;
  category?: string | null;
}): string => {
  if (opts.matchName?.trim()) return opts.matchName.trim();
  if ((opts.language || 'en') !== 'ja') {
    return (opts.cardName || '').trim();
  }
  const derived = buildMatchNameFromDex(opts.dexId, opts.suffix, opts.category);
  return derived || (opts.cardName || '').trim();
};
