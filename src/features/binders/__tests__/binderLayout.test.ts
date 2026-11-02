import { describe, expect, it } from 'vitest';
import type { BinderSlot } from '../types';
import { layoutPages, moveWithin, plannedCost, swapUpdates } from '../binderLayout';

function slot(id: number, pos: number, page = 1, price: number | null = 100): BinderSlot {
  return {
    id,
    binderId: 1,
    pageNumber: page,
    slotPosition: pos,
    cardId: `c${id}`,
    cardSnapshot: JSON.stringify({ cardId: `c${id}`, cardName: `Card ${id}` }),
    marketPriceCents: price,
    notes: null,
    createdAt: '',
  };
}

describe('layoutPages', () => {
  it('cuts plans saved on page 1 with positions past 8 into extra pages', () => {
    const pages = layoutPages({ pages: 1, slotsPerPage: 9, slots: [slot(1, 0), slot(2, 10)] });
    expect(pages).toHaveLength(2);
    expect(pages[0][0].card?.cardName).toBe('Card 1');
    expect(pages[1][1].card?.cardName).toBe('Card 2');
    expect(pages[0][5].slot).toBeNull();
  });

  it('survives a corrupt snapshot', () => {
    const bad = { ...slot(3, 0), cardSnapshot: '{nope' };
    expect(layoutPages({ pages: 1, slotsPerPage: 9, slots: [bad] })[0][0].card).toEqual({
      cardId: 'c3',
    });
  });
});

describe('swapUpdates', () => {
  it('exchanges the contents of two filled pockets', () => {
    const [page] = layoutPages({
      pages: 1,
      slotsPerPage: 9,
      slots: [slot(1, 0), slot(2, 1, 1, null)],
    });
    const u = swapUpdates(page[0], page[1]);
    expect(u?.[0]).toMatchObject({ slotId: 1, cardId: 'c2', marketPriceCents: undefined });
    expect(u?.[1]).toMatchObject({ slotId: 2, cardId: 'c1', marketPriceCents: 100 });
  });

  it('refuses to move into an empty pocket', () => {
    const [page] = layoutPages({ pages: 1, slotsPerPage: 9, slots: [slot(1, 0)] });
    expect(swapUpdates(page[0], page[4])).toBeNull();
  });
});

describe('moveWithin', () => {
  it('stays on the 3×3 grid', () => {
    expect(moveWithin(0, 'ArrowLeft')).toBe(0);
    expect(moveWithin(2, 'ArrowRight')).toBe(2);
    expect(moveWithin(4, 'ArrowDown')).toBe(7);
    expect(moveWithin(7, 'ArrowDown')).toBe(7);
  });
});

describe('plannedCost', () => {
  it('sums only snapshot prices that exist', () => {
    expect(plannedCost({ slots: [slot(1, 0), slot(2, 1, 1, null)] })).toEqual({
      cents: 100,
      priced: 1,
    });
  });
});
