/**
 * Normalizes a variant key (e.g., "Reverse Holofoil", "1st Edition Holofoil")
 * to a consistent lowercase alphanumeric string.
 *
 * This function must be used consistently across all price ingestion and
 * lookup paths to ensure uniqueIdentifier generation matches.
 */
export const normalizeVariantKey = (value?: string): string => {
  if (!value) return 'normal';
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized || 'normal';
};

/**
 * Map marketplace channel labels onto the actual card finish.
 * TCGdex Cardmarket fallbacks used raw names like "cardmarket-holo", which
 * wrote a different uniqueIdentifier than Holofoil and froze charts.
 */
export const canonicalFinishVariantKey = (value?: string): string => {
  const key = normalizeVariantKey(value);
  if (key === 'cardmarket' || key === 'cardmarketavg' || key === 'cardmarketaverage') {
    return 'normal';
  }
  if (key.startsWith('cardmarket') && key.includes('holo')) {
    return 'holofoil';
  }
  return key;
};
