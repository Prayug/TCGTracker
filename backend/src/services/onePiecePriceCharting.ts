/**
 * PriceCharting matching for One Piece TCG.
 *
 * OPTCG names look like `Monkey.D.Luffy (003) (Parallel)` while PriceCharting
 * uses `Monkey.D.Luffy [Alt Art] OP01-003` on the `One Piece Romance Dawn`
 * console. Families must be matched the same way reverse/1st-edition finishes
 * are for Pokemon — otherwise the cheap base card overwrites manga slabs.
 */

export type OpPrintFamily =
  | 'standard'
  | 'parallel'
  | 'manga'
  | 'redmanga'
  | 'wanted'
  | 'tr'
  | 'sp'
  | 'anniversary'
  | 'anniversary2'
  | 'anniversary3'
  | 'anniversarysignature'
  | 'tournamentwinner'
  | 'giftcollection';

/** Reprints that share a collector number with a cheaper base card. */
const SET_FLEXIBLE_FAMILIES = new Set<OpPrintFamily>([
  'anniversary',
  'anniversary2',
  'anniversary3',
  'anniversarysignature',
  'tournamentwinner',
  'giftcollection',
]);

export const opFamilyAllowsSetMismatch = (family: OpPrintFamily): boolean =>
  SET_FLEXIBLE_FAMILIES.has(family);

const OP_GENERIC_SET_TOKENS = new Set(['one', 'piece', 'card', 'cards', 'game', 'tcg']);

const opSetTokens = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((t) => (t === 'promos' || t === 'promotion' ? 'promo' : t))
    .filter((t) => t.length > 2 && !OP_GENERIC_SET_TOKENS.has(t));

/**
 * One Piece set names all share "One Piece", so token overlap of those two
 * words must not count as a match (Promotion Cards ≠ Ultra Deck).
 */
export const opSetNamesMatch = (candidateSet: string, inputSet: string): boolean => {
  if (!inputSet.trim()) return true;
  const iTokens = opSetTokens(inputSet);
  const cTokens = new Set(opSetTokens(candidateSet));
  if (iTokens.length === 0) return false;
  const hits = iTokens.filter((t) => cTokens.has(t)).length;
  return hits >= Math.min(iTokens.length === 1 ? 1 : 2, iTokens.length);
};

export const isOpPromoSet = (setName?: string | null): boolean =>
  opSetTokens(setName || '').includes('promo');

/** Drop the generic promo set from search when the reprint lives on another console. */
export const opSearchSetName = (
  setName: string | undefined,
  family: OpPrintFamily
): string | undefined => {
  if (!setName) return undefined;
  if (opFamilyAllowsSetMismatch(family) && isOpPromoSet(setName)) return undefined;
  return setName;
};

const NUMBER_ONLY = /^\d+$/;

/** Parenthetical labels from an OPTCG / TCGPlayer-style name. */
export const opParenLabels = (name?: string | null): string[] => {
  if (!name) return [];
  return [...name.matchAll(/\(([^)]+)\)/g)]
    .map((m) => m[1].trim())
    .filter((label) => label.length > 0 && !NUMBER_ONLY.test(label));
};

/** Display name without collector-number / variant parentheses. */
export const stripOpNameDecorators = (name?: string | null): string =>
  (name || '')
    .replace(/\s*\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const hayOf = (...parts: Array<string | null | undefined>): string =>
  parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[_./]/g, ' ');

/**
 * Anniversary / tournament reprints that share a collector number with a
 * cheaper base card. Most-specific tags win: 3rd before 1st, signature before
 * bare anniversary. "Treasure Campaign" must not be classified as Treasure Rare.
 */
const detectOpSpecialReprintFamily = (hay: string): OpPrintFamily | null => {
  if (/anniversary[\s-]*signature/.test(hay)) return 'anniversarysignature';
  if (/3rd[\s-]*anniversary/.test(hay)) return 'anniversary3';
  if (/2nd[\s-]*anniversary/.test(hay)) return 'anniversary2';
  if (
    /1st[\s-]*anniversary/.test(hay) ||
    /english\s+version\s+1st\s+anniversary/.test(hay) ||
    /\[anniversary\]/.test(hay) ||
    /(?:^|[\s\-])anniversary(?:[\s\-]|$)/.test(hay)
  ) {
    return 'anniversary';
  }
  if (/tournament[\s-]*winner/.test(hay)) return 'tournamentwinner';
  if (/gift[\s-]*collection/.test(hay)) return 'giftcollection';
  return null;
};

/** OPTCG `_p1`–`_p4` alt arts. `_pr3` is a promo reprint, not red manga. */
const imageHasAltSuffix = (image: string, n: 1 | 2 | 3 | 4): boolean =>
  !/_pr\d*(?:$|[^0-9])/.test(image) && new RegExp(`_p${n}(?:$|[^0-9])`).test(image);

/**
 * Print family from OPTCG card name + image id (and an optional variant key).
 * Most-specific tags win so "Red Super Alternate Art" is not also "parallel".
 */
export const expectedOpPrintFamily = (input: {
  cardName?: string | null;
  cardImageId?: string | null;
  variant?: string | null;
}): OpPrintFamily => {
  const variant = (input.variant || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (variant === 'redmanga' || variant === 'redsuperalt' || variant === 'redsuper') {
    return 'redmanga';
  }
  if (variant === 'manga' || variant === 'superalt' || variant === 'superalternateart') {
    return 'manga';
  }
  if (variant === 'wanted' || variant === 'wantedposter') return 'wanted';
  if (variant === 'tr' || variant === 'treasurerare') return 'tr';
  if (variant === 'parallel' || variant === 'altart' || variant === 'alternateart') {
    return 'parallel';
  }
  if (variant === 'sp') return 'sp';
  if (variant === 'anniversary' || variant === '1stanniversary') return 'anniversary';
  if (variant === 'anniversary2' || variant === '2ndanniversary') return 'anniversary2';
  if (variant === 'anniversary3' || variant === '3rdanniversary') return 'anniversary3';

  const hay = hayOf(input.cardName);
  const special = detectOpSpecialReprintFamily(hay);
  if (special) return special;

  const image = (input.cardImageId || '').toLowerCase();
  if (/red\s*super/.test(hay) || /red\s*manga/.test(hay) || imageHasAltSuffix(image, 3)) {
    return 'redmanga';
  }
  if (/\bmanga\b/.test(hay) || /super\s*alternate/.test(hay) || imageHasAltSuffix(image, 2)) {
    return 'manga';
  }
  if (/wanted/.test(hay) || imageHasAltSuffix(image, 4)) return 'wanted';
  if (/\btr\b/.test(hay) || /treasure/.test(hay)) return 'tr';
  if (
    /parallel/.test(hay) ||
    /alternate\s*art/.test(hay) ||
    /alt\s*art/.test(hay) ||
    imageHasAltSuffix(image, 1)
  ) {
    return 'parallel';
  }
  // OPTCG names the base Secret Rare `(SP)` with no `_p` suffix. That is the
  // untagged PriceCharting product, not a distinct SP SKU.
  return 'standard';
};

/** Print family from a PriceCharting title / URL. */
export const detectOpPrintFamily = (
  title?: string | null,
  url?: string | null
): OpPrintFamily => {
  const hay = hayOf(title, url);
  const special = detectOpSpecialReprintFamily(hay);
  if (special) return special;
  if (/red[\s-]*manga/.test(hay) || /red[\s-]*super/.test(hay)) return 'redmanga';
  if (/\bmanga\b/.test(hay)) return 'manga';
  if (/\bwanted\b/.test(hay)) return 'wanted';
  if (/treasure[\s-]*rare/.test(hay) || /\[tr\]/.test(hay)) return 'tr';
  if (
    /alt[\s-]*art/.test(hay) ||
    /alternate[\s-]*art/.test(hay) ||
    /\bparallel\b/.test(hay)
  ) {
    return 'parallel';
  }
  return 'standard';
};

export const opPrintFamiliesMatch = (
  expected: OpPrintFamily,
  detected: OpPrintFamily
): boolean => expected === detected;

export const opFamilySearchTerms = (family: OpPrintFamily): string => {
  switch (family) {
    case 'parallel':
      return 'alternate art';
    case 'manga':
      return 'manga';
    case 'redmanga':
      return 'red manga';
    case 'wanted':
      return 'wanted';
    case 'tr':
      return 'treasure rare';
    case 'anniversary':
      return 'Anniversary';
    case 'anniversary2':
      return '2nd Anniversary';
    case 'anniversary3':
      return '3rd Anniversary';
    case 'anniversarysignature':
      return 'Anniversary Signature';
    case 'tournamentwinner':
      return 'Tournament Winner';
    case 'giftcollection':
      return 'Gift Collection';
    default:
      return '';
  }
};

/** URL path segment PriceCharting usually uses for this family. */
export const opFamilySlug = (family: OpPrintFamily): string => {
  switch (family) {
    case 'parallel':
      return 'alternate-art';
    case 'manga':
      return 'manga';
    case 'redmanga':
      return 'red-manga';
    case 'wanted':
      return 'wanted';
    case 'tr':
      return 'treasure-rare';
    case 'anniversary':
      return 'anniversary';
    case 'anniversary2':
      return '2nd-anniversary';
    case 'anniversary3':
      return '3rd-anniversary';
    case 'anniversarysignature':
      return 'anniversary-signature';
    case 'tournamentwinner':
      return 'tournament-winner';
    case 'giftcollection':
      return 'gift-collection';
    default:
      return '';
  }
};

export const isOnePieceConsoleName = (setName?: string | null): boolean =>
  /one\s*piece/i.test(setName || '');

/** Heuristic PriceCharting console from our OPTCG set name. */
export const guessOnePieceConsoleName = (ourSetName?: string | null): string | null => {
  const name = (ourSetName || '').trim();
  if (!name) return null;
  if (/^one\s*piece\b/i.test(name)) return name;
  return `One Piece ${name}`;
};

/**
 * PriceCharting strips periods in One Piece slugs:
 * `Monkey.D.Luffy` → `monkeydluffy`, not `monkey-d-luffy`.
 */
export const stripOpPeriodsForSlug = (name: string): string => name.replace(/\./g, '');

export const looksLikeOnePieceCardNumber = (cardNumber?: string | null): boolean => {
  const s = (cardNumber || '').trim().toLowerCase();
  if (!s) return false;
  return /^(op|st|eb|prb|p|don)\d{0,2}-?\d+[a-z]*$/i.test(s.replace(/\s+/g, ''));
};
