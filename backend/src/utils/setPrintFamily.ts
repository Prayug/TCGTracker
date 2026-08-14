/**
 * Distinguishes main-set printings from subset/secret printings of the same
 * card name (Hidden Fates #9 vs Shiny Vault SV49, Trainer Gallery, etc.).
 *
 * PriceCharting often files both under the parent console ("Pokemon Hidden Fates"),
 * so set-name overlap is not enough — we need the collector-number family.
 */

const SUBSET_PRINT_RE =
  /shiny\s*vault|trainer\s*gallery|galarian\s*gallery|(?:pokemon|pokémon)\s*gallery/i;

export const setLooksLikeSubsetPrint = (setName?: string | null): boolean =>
  SUBSET_PRINT_RE.test(setName || '');

/** SV49, TG03, GG44, SWSH001 — letter-prefixed collector numbers. */
export const numberLooksSecretRare = (cardNumber?: string | null): boolean => {
  const n = (cardNumber || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!n) return false;
  return /^[a-z]+/.test(n);
};

export const setBaseKey = (setName?: string | null): string =>
  (setName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(SUBSET_PRINT_RE, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * True when two labels refer to the same print family: both main-set or both
 * the same kind of subset. "Hidden Fates" must not match "Hidden Fates Shiny Vault".
 */
export const setsSharePrintFamily = (a?: string | null, b?: string | null): boolean => {
  if (!a || !b) return false;
  if (setLooksLikeSubsetPrint(a) !== setLooksLikeSubsetPrint(b)) return false;
  const ka = setBaseKey(a);
  const kb = setBaseKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (ka.includes(kb) || kb.includes(ka)) return true;
  const tokens = (s: string) =>
    s.split(' ').filter((t) => t.length > 2 && !['the', 'and', 'pokemon'].includes(t));
  const ta = new Set(tokens(ka));
  const tb = tokens(kb);
  if (tb.length === 0) return false;
  const overlap = tb.filter((t) => ta.has(t)).length;
  return overlap >= Math.min(2, tb.length);
};
