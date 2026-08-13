import { normalizeVariantKey } from './normalizeVariantKey';

/**
 * Score how well a price-history subtype matches the finish the user selected.
 *
 * CRITICAL: never use naive `row.includes(preferred)` — `reverseholofoil`.includes(`holofoil`)
 * is true, which bleeds reverse history into holofoil charts (Expedition Charizard cliffs, etc.).
 *
 * Scores: 3 exact · 2 same finish family · 0 no match.
 */
export function scoreVariantMatch(preferredRaw?: string | null, rowRaw?: string | null): number {
  const preferred = normalizeVariantKey(preferredRaw ?? undefined);
  const row = normalizeVariantKey(rowRaw ?? undefined);

  if (row === preferred) return 3;

  // Cardmarket channel labels are finishes, not a separate print.
  if (row === 'cardmarket' || row === 'cardmarketavg' || row === 'cardmarketaverage') {
    return preferred === 'normal' || preferred === 'unlimited' ? 2 : 0;
  }
  if (row.startsWith('cardmarket') && row.includes('holo')) {
    if (preferred.includes('reverse')) return 0;
    return preferred === 'holofoil' || preferred === 'unlimitedholofoil' ? 2 : 0;
  }

  if (preferred === 'normal') {
    return row === 'unlimited' ? 2 : 0;
  }

  const rowIsReverse = row.includes('reverse');
  const preferredIsReverse = preferred.includes('reverse');

  // Holofoil family (non-reverse): 1st ed / unlimited holo only.
  if (preferred === 'holofoil' || preferred === 'unlimitedholofoil') {
    if (rowIsReverse) return 0;
    if (row.endsWith('holofoil') || row === 'holo') return 2;
    return 0;
  }

  if (preferredIsReverse) {
    return rowIsReverse ? 2 : 0;
  }

  if (preferred.includes('1stedition')) {
    if (rowIsReverse) return 0;
    return row.includes('1stedition') ? 2 : 0;
  }

  // Generic: suffix match (e.g. preferred "normal" already handled).
  // Do not match reverse rows into non-reverse preferences.
  if (row.endsWith(preferred)) {
    if (rowIsReverse && !preferredIsReverse) return 0;
    return 2;
  }

  return 0;
}
