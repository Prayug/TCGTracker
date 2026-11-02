import { describe, expect, it } from 'vitest';
import type { BinderSlot } from '../types';
import { layoutPages, moveWithin, plannedCost, replaceUpdate, swapUpdates } from '../binderLayout';

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

describe('replaceUpdate', () => {
  const slot = {
    id: 7,
    binderId: 1,
    pageNumber: 1,
    slotPosition: 0,
    cardId: 'a',
    cardSnapshot: null,
    marketPriceCents: 100,
    notes: null,
    createdAt: '',
  };
  const card = {
    cardId: 'b',
    cardName: 'B',
    setId: 's',
    setName: 'S',
    cardNumber: '1',
    rarity: 'Rare',
    imageSmall: null,
    imageLarge: null,
    marketPrice: 12.5,
  };
  it('writes the new card and its price into the existing slot', () => {
    const u = replaceUpdate({ index: 0, slot, card: { cardId: 'a' } }, card);
    expect(u).toMatchObject({ slotId: 7, cardId: 'b', marketPriceCents: 1250 });
    expect(JSON.parse(u!.cardSnapshot!)).toMatchObject({ cardName: 'B' });
  });
  it('leaves an unknown price unset rather than zero', () => {
    expect(
      replaceUpdate({ index: 0, slot, card: null }, { ...card, marketPrice: null })
        ?.marketPriceCents
    ).toBeUndefined();
  });
  it('cannot fill an empty pocket', () => {
    expect(replaceUpdate({ index: 3, slot: null, card: null }, card)).toBeNull();
  });
});
