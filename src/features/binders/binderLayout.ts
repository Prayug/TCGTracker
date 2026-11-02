import type { Binder, BinderCard, BinderSlot } from './types';

export const POCKETS_PER_PAGE = 9;

export interface Pocket {
  /** 0-based position across the whole binder. */
  index: number;
  slot: BinderSlot | null;
  card: Partial<BinderCard> | null;
}

export function parseSnapshot(slot: BinderSlot | null | undefined): Partial<BinderCard> | null {
  if (!slot?.cardSnapshot) return slot?.cardId ? { cardId: slot.cardId } : null;
  try {
    const parsed = JSON.parse(slot.cardSnapshot) as Partial<BinderCard>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return { cardId: slot.cardId };
  }
}

/**
 * Lay a binder's slots out as 3×3 pages. Saved plans may put every slot on
 * page 1 with positions past 8, so the global index is derived from both
 * fields and pages are cut every nine pockets.
 */
export function layoutPages(binder: Pick<Binder, 'pages' | 'slotsPerPage' | 'slots'>): Pocket[][] {
  const perPage = binder.slotsPerPage > 0 ? binder.slotsPerPage : POCKETS_PER_PAGE;
  const byIndex = new Map<number, BinderSlot>();
  let maxIndex = -1;
  for (const s of binder.slots) {
    const idx = (Math.max(1, s.pageNumber) - 1) * perPage + s.slotPosition;
    byIndex.set(idx, s);
    maxIndex = Math.max(maxIndex, idx);
  }
  const declared = Math.max(1, binder.pages) * POCKETS_PER_PAGE;
  const total = Math.max(declared, Math.ceil((maxIndex + 1) / POCKETS_PER_PAGE) * POCKETS_PER_PAGE);
  const pages: Pocket[][] = [];
  for (let p = 0; p < total / POCKETS_PER_PAGE; p++) {
    const page: Pocket[] = [];
    for (let i = 0; i < POCKETS_PER_PAGE; i++) {
      const index = p * POCKETS_PER_PAGE + i;
      const slot = byIndex.get(index) ?? null;
      page.push({ index, slot, card: parseSnapshot(slot) });
    }
    pages.push(page);
  }
  return pages;
}

/** Move focus within a 3×3 page with arrow keys; returns the new pocket index on the page. */
export function moveWithin(pos: number, key: string): number {
  const row = Math.floor(pos / 3);
  const col = pos % 3;
  switch (key) {
    case 'ArrowLeft':
      return col > 0 ? pos - 1 : pos;
    case 'ArrowRight':
      return col < 2 ? pos + 1 : pos;
    case 'ArrowUp':
      return row > 0 ? pos - 3 : pos;
    case 'ArrowDown':
      return row < 2 ? pos + 3 : pos;
    case 'Home':
      return 0;
    case 'End':
      return 8;
    default:
      return pos;
  }
}

export interface SlotUpdate {
  slotId: number;
  cardId: string;
  cardSnapshot?: string;
  marketPriceCents?: number;
}

/**
 * Swapping two filled pockets is two slot updates that exchange contents.
 * Moving into an empty pocket would need a new slot, which the API can't
 * create, so that returns null and the UI says so.
 */
export function swapUpdates(a: Pocket, b: Pocket): SlotUpdate[] | null {
  if (!a.slot || !b.slot || a.slot.id === b.slot.id) return null;
  const contents = (s: BinderSlot) => ({
    cardId: s.cardId,
    cardSnapshot: s.cardSnapshot ?? undefined,
    marketPriceCents: s.marketPriceCents ?? undefined,
  });
  return [
    { slotId: a.slot.id, ...contents(b.slot) },
    { slotId: b.slot.id, ...contents(a.slot) },
  ];
}

/** Planned cost: snapshot prices saved with the plan, not today's market. */
export function plannedCost(binder: Pick<Binder, 'slots'>): { cents: number; priced: number } {
  let cents = 0;
  let priced = 0;
  for (const s of binder.slots) {
    if (s.marketPriceCents != null && s.marketPriceCents > 0) {
      cents += s.marketPriceCents;
      priced += 1;
    }
  }
  return { cents, priced };
}

/** Put a different card into a filled pocket: one slot update. Empty pockets have no slot to update. */
export function replaceUpdate(
  pocket: Pocket,
  card: Pick<
    BinderCard,
    | 'cardId'
    | 'cardName'
    | 'setId'
    | 'setName'
    | 'cardNumber'
    | 'rarity'
    | 'imageSmall'
    | 'imageLarge'
    | 'marketPrice'
  >
): SlotUpdate | null {
  if (!pocket.slot) return null;
  return {
    slotId: pocket.slot.id,
    cardId: card.cardId,
    cardSnapshot: JSON.stringify(card),
    marketPriceCents:
      card.marketPrice != null && card.marketPrice > 0
        ? Math.round(card.marketPrice * 100)
        : undefined,
  };
}
