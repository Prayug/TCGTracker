/**
 * Guards against TCGdex/TCGPlayer productId collisions across print families
 * (Trainer Gallery / Shiny Vault / Galarian Gallery vs main set).
 *
 * Upstream providers often return the main-set SKU for a subset card that shares
 * a name (Mimikyu V TG16 → Brilliant Stars #68). Trusting that productId
 * overwrites mappings and stitches the cheap main-set price series onto the
 * expensive subset uniqueIdentifier.
 */

import {
  numberLooksSecretRare,
  setLooksLikeSubsetPrint,
  setsSharePrintFamily,
} from './setPrintFamily';

export type ProductIdOwner = {
  cardId: string;
  setName: string | null;
  cardNumber: string | null;
};

export const normalizeCollectorNumber = (cardNumber?: string | null): string =>
  (cardNumber || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const normalizeCardNameKey = (cardName?: string | null): string =>
  (cardName || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** True when this catalog row is a subset/secret printing family. */
export const cardLooksLikeSubsetPrint = (
  setName?: string | null,
  cardNumber?: string | null
): boolean => setLooksLikeSubsetPrint(setName) || numberLooksSecretRare(cardNumber);

/**
 * A productId is incompatible when it is already owned by a mapping in a
 * different print family (main set vs Trainer Gallery, etc.).
 */
export const productIdConflictsWithPrintFamily = (
  productId: number | null | undefined,
  setName: string | null | undefined,
  owners: ProductIdOwner[]
): boolean => {
  if (productId == null || !Number.isFinite(productId) || productId <= 0) return false;
  if (!setName || owners.length === 0) return false;
  return owners.some((owner) => {
    if (!owner.setName) return false;
    return !setsSharePrintFamily(owner.setName, setName);
  });
};

/**
 * Pick the single TCGCSV productId that matches name + collector number + print family.
 */
export const resolveProductIdFromOwners = (
  cardName: string,
  setName: string | null | undefined,
  cardNumber: string | null | undefined,
  candidates: Array<ProductIdOwner & { cardName: string; productId: number }>
): number | null => {
  const nameKey = normalizeCardNameKey(cardName);
  const numKey = normalizeCollectorNumber(cardNumber);
  if (!nameKey || !numKey) return null;

  const matches = candidates.filter((c) => {
    if (normalizeCardNameKey(c.cardName) !== nameKey) return false;
    if (normalizeCollectorNumber(c.cardNumber) !== numKey) return false;
    if (!setsSharePrintFamily(c.setName, setName)) return false;
    return Number.isFinite(c.productId) && c.productId > 0;
  });

  const ids = [...new Set(matches.map((m) => m.productId))];
  return ids.length === 1 ? ids[0] : null;
};
