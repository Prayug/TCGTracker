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
