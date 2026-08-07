import { OpRarity, PullCard } from '../types';

/**
 * One Piece catalog variant detection.
 *
 * optcgapi encodes treatments in the card name. Order matters — longer /
 * more specific suffixes must win before base SEC/SR symbols:
 *   "(Red Super Alternate Art)" → SAA (OP-13 ultra chase, ~1/200 boxes)
 *   "(Super Alternate Art)" / "(Manga)" → MANGA
 *   "(Wanted Poster)" → SP-tier special parallel
 *   "(SP)" → Special Rare
 *   "(Parallel)" / "(Alternate Art)" → AA / LAA
 */
export const VARIANT_SUFFIXES = [
  '(Red Super Alternate Art)',
  '(Super Alternate Art)',
  '(Wanted Poster)',
  '(Manga)',
  '(SP) (Silver)',
  '(SP) (Gold)',
  '(Silver)',
  '(Gold)',
  '(SP)',
  '(Treasure Rare)',
  '(TR)',
  '(Alternate Art)',
  '(Parallel)',
  '(Box Topper)',
  '(Dash Pack)',
  '(Signed)',
] as const;

export interface ClassifyResult {
  rarity: OpRarity;
  /** Cleaned display name. */
  name: string;
  /** Original rarity symbol from the catalog. */
  baseRarity?: string;
  /** True when the card is a variant treatment of a base card. */
  isVariant: boolean;
}

/** Normalize "OP05-069" style numbers for stable dedupe keys. */
export function normalizeNumber(number: string | null | undefined): string {
  return (number || '').replace(/\s/g, '').toLowerCase();
}

/**
 * Classify a raw catalog card into a simulator rarity bucket.
 * Critical: never let manga / red SAA / SP variants fall into the base SEC pool.
 */
export function classifyVariant(
  name: string,
  rarity?: string | null
): ClassifyResult {
  const n = name || '';
  const base = rarity || undefined;

  const has = (s: string) => n.includes(s);

  // Ultra chase (OP-13 Red Super Parallel etc.) — BEFORE Super Alternate Art.
  if (has('(Red Super Alternate Art)')) {
    return {
      rarity: 'SAA',
      name: cleanName(n),
      baseRarity: base,
      isVariant: true,
    };
  }
  // Manga / Super Alternate Art (catalog often omits the word "Manga").
  if (has('(Super Alternate Art)') || has('(Manga)')) {
    return {
      rarity: 'MANGA',
      name: cleanName(n),
      baseRarity: base,
      isVariant: true,
    };
  }
  // Anniversary gold/silver SP inserts are ultra-chase, not normal SP.
  if (/\(SP\)\s*\((Silver|Gold)\)/i.test(n) || /\((Silver|Gold)\)\s*\(SP\)/i.test(n)) {
    return {
      rarity: 'SAA',
      name: cleanName(n),
      baseRarity: base,
      isVariant: true,
    };
  }
  if (has('(SP)')) {
    return {
      rarity: 'SP',
      name: cleanName(n),
      baseRarity: base,
      isVariant: true,
    };
  }
  // Wanted Poster = special parallel art, not the SP hit slot.
  if (has('(Wanted Poster)')) {
    return {
      rarity: 'AA',
      name: cleanName(n),
      baseRarity: base,
      isVariant: true,
    };
  }
  if (has('(Treasure Rare)') || has('(TR)') || base === 'TR') {
    return {
      rarity: 'TR',
      name: cleanName(n),
      baseRarity: base,
      isVariant: has('(Treasure Rare)') || has('(TR)'),
    };
  }
  if (has('(Parallel)') || has('(Alternate Art)') || has('(Box Topper)')) {
    const isLeaderAlt = (base || '').toUpperCase() === 'L';
    return {
      rarity: isLeaderAlt ? 'LAA' : 'AA',
      name: cleanName(n),
      baseRarity: base,
      isVariant: true,
    };
  }
  if (base === 'DON!!' || base === 'DON') {
    return { rarity: 'DON', name: cleanName(n), baseRarity: base, isVariant: false };
  }

  const mapped = (base || '').toUpperCase();
  if (mapped === 'C' || mapped === 'UC' || mapped === 'R' || mapped === 'L' || mapped === 'SR' || mapped === 'SEC') {
    return { rarity: mapped as OpRarity, name: cleanName(n), baseRarity: base, isVariant: false };
  }

  return { rarity: 'R', name: cleanName(n), baseRarity: base, isVariant: false };
}

/** Strip variant suffixes for display (longest first). */
export function cleanName(name: string): string {
  let out = name;
  for (const suffix of VARIANT_SUFFIXES) {
    out = out.replace(new RegExp(`\\s*${escapeRegExp(suffix)}$`), '');
  }
  return out.trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isPackableRarity(rarity?: string | null): boolean {
  const mapped = (rarity || '').toUpperCase();
  if (mapped === 'P' || mapped === 'PR' || mapped === 'PS' || mapped.startsWith('P-')) return false;
  return true;
}

/** Cards in the catalog that never appear in booster packs. */
export const isExcludedFromPacks = (name: string): boolean =>
  name.includes('(Dash Pack)') || name.includes('(Signed)');

/**
 * Native set prefix for a card number: "OP13-120" → "OP13", "EB02-028" → "EB02".
 */
export function cardNumberSetPrefix(number: string): string {
  return (number || '').split('-')[0].replace(/[^a-z0-9]/gi, '').toUpperCase();
}

export function setCodePrefix(code: string): string {
  return code.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

/** True when the card number belongs to a different set than the product being opened. */
export function isReprintInsert(cardNumber: string, productSetCode: string): boolean {
  const cardPrefix = cardNumberSetPrefix(cardNumber);
  const setPrefix = setCodePrefix(productSetCode);
  if (!cardPrefix || !setPrefix) return false;
  return cardPrefix !== setPrefix;
}

export function toPullCard(input: {
  id: string;
  name: string;
  number?: string | null;
  rarity?: string | null;
  imageUrl?: string;
  marketPrice?: number;
}): PullCard {
  const { rarity: opRarity, name, baseRarity, isVariant } = classifyVariant(
    input.name,
    input.rarity
  );
  return {
    id: input.id,
    name,
    number: input.number || '',
    rarity: opRarity,
    baseRarity,
    imageUrl: input.imageUrl,
    marketPrice: input.marketPrice,
    isChase:
      isVariant ||
      ['SAA', 'MANGA', 'TR', 'SP', 'SEC', 'LAA', 'AA'].includes(opRarity),
  };
}
