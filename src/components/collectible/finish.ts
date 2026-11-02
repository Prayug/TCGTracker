/**
 * Card finish, derived only from what the catalog says about the print.
 * Foil treatment in the UI follows this; an ordinary card never gets foil.
 */
export type Finish =
  | 'none'
  | 'holo' // foil confined to the art window (classic holo rare)
  | 'reverse' // foil everywhere except the art window
  | 'textured' // full art / ultra rare: whole-card etched shimmer
  | 'rainbow' // rainbow / hyper rare
  | 'gold' // gold secret, gold star, gold-bordered
  | 'illustration'; // alt art / illustration rares: soft full-card sheen

export interface FinishSource {
  rarity?: string | null;
  preferredVariant?: string | null;
  /** Variant / subtype label from price feeds, e.g. "Holofoil", "Reverse Holofoil". */
  subTypeName?: string | null;
}

export function finishOf(card: FinishSource | null | undefined): Finish {
  if (!card) return 'none';
  const r = (card.rarity ?? '').toLowerCase();
  const v = `${card.preferredVariant ?? ''} ${card.subTypeName ?? ''}`.toLowerCase();

  if (/rainbow|hyper/.test(r)) return 'rainbow';
  if (/gold|\bstar\b|shining|radiant/.test(r)) return 'gold';
  if (/special illustration|illustration rare|alt|\bsp\b|manga|treasure/.test(r))
    return 'illustration';
  if (
    /secret|\bsec\b|ultra|full art|vmax|vstar|\bv\b|\bex\b|\bgx\b|amazing|\bsr\b|double rare/.test(
      r
    )
  )
    return 'textured';
  if (/reverse/.test(v) || /reverse/.test(r)) return 'reverse';
  if (/holo/.test(r) || /(^|\s)holofoil/.test(v)) return 'holo';
  return 'none';
}

export const FINISH_LABEL: Record<Finish, string> = {
  none: 'Non-foil',
  holo: 'Holofoil',
  reverse: 'Reverse holo',
  textured: 'Textured foil',
  rainbow: 'Rainbow foil',
  gold: 'Gold foil',
  illustration: 'Illustration foil',
};

/** Rough "how special is this print" rank used to choose hero pieces. Never shown as data. */
export function finishRank(f: Finish): number {
  return { none: 0, reverse: 1, holo: 2, textured: 3, illustration: 4, gold: 4, rainbow: 4 }[f];
}
