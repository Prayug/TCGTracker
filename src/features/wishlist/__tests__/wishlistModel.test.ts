import { describe, expect, it } from 'vitest';
import type { WishlistItem } from '../../../services/cardWishlistService';
import {
  buildRows,
  filterRows,
  parseTargetInput,
  sortRows,
  summarize,
  wishStatus,
  type LivePrice,
} from '../wishlistModel';

const item = (
  id: string,
  opts: Partial<WishlistItem> & { saved?: number } = {}
): WishlistItem & { saved?: number } => ({
  id: `w-${id}`,
  card: { id, name: id.toUpperCase(), set: { id: 's', name: 'Set' } } as WishlistItem['card'],
  addedAt: opts.addedAt ?? '2026-10-01T00:00:00Z',
  priority: opts.priority ?? 'medium',
  targetPrice: opts.targetPrice,
  game: 'pokemon',
  saved: opts.saved,
});

const saved = (i: WishlistItem) => (i as WishlistItem & { saved?: number }).saved ?? null;

describe('wishStatus', () => {
  it('needs a target before it can say anything about the price', () => {
    expect(wishStatus(10, undefined)).toBe('no-target');
    expect(wishStatus(null, undefined)).toBe('no-target');
  });
  it('does not call a card at target when its price is unknown', () => {
    expect(wishStatus(null, 20)).toBe('no-price');
  });
  it('compares market to target', () => {
    expect(wishStatus(20, 20)).toBe('at-target');
    expect(wishStatus(20.01, 20)).toBe('above');
  });
});

describe('buildRows', () => {
  it('prefers a live price and labels the basis', () => {
    const live = new Map<string, LivePrice>([['a', { price: 8, asOf: '2026-11-01' }]]);
    const [row] = buildRows([item('a', { saved: 12, targetPrice: 10 })], live, saved);
    expect(row).toMatchObject({
      market: 8,
      basis: 'live',
      asOf: '2026-11-01',
      status: 'at-target',
      gap: -2,
    });
  });
  it('treats a successful lookup that found no price as no price, not the stale saved one', () => {
    const live = new Map<string, LivePrice>([['a', { price: null }]]);
    const [row] = buildRows([item('a', { saved: 12, targetPrice: 10 })], live, saved);
    expect(row.market).toBeNull();
    expect(row.status).toBe('no-price');
    expect(row.gap).toBeNull();
  });
  it('falls back to the saved price, dated when the card was added', () => {
    const [row] = buildRows([item('a', { saved: 12 })], new Map(), saved);
    expect(row).toMatchObject({ market: 12, basis: 'saved', asOf: '2026-10-01T00:00:00Z' });
  });
  it('never turns a zero price into a market value', () => {
    const live = new Map<string, LivePrice>([['a', { price: 0 }]]);
    const [row] = buildRows([item('a', { targetPrice: 5 })], live, saved);
    expect(row.market).toBeNull();
    expect(row.status).toBe('no-price');
  });
});

describe('sortRows / filterRows / summarize', () => {
  const rows = buildRows(
    [
      item('a', { saved: 30, targetPrice: 20, priority: 'low' }),
      item('b', { saved: 15, targetPrice: 20, priority: 'high' }),
      item('c', { priority: 'high', targetPrice: 5 }),
      item('d', { saved: 50, addedAt: '2026-10-05T00:00:00Z' }),
    ],
    new Map(),
    saved
  );

  it('sorts unknown gaps and prices last', () => {
    expect(sortRows(rows, 'gap').map((r) => r.item.card.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(sortRows(rows, 'price').map((r) => r.item.card.id)).toEqual(['d', 'a', 'b', 'c']);
  });
  it('sorts by priority, then by closeness to target', () => {
    expect(sortRows(rows, 'priority').map((r) => r.item.card.id)).toEqual(['b', 'c', 'd', 'a']);
  });
  it('filters by status and priority', () => {
    expect(filterRows(rows, 'at-target').map((r) => r.item.card.id)).toEqual(['b']);
    expect(filterRows(rows, 'no-target').map((r) => r.item.card.id)).toEqual(['d']);
    expect(filterRows(rows, 'high').map((r) => r.item.card.id)).toEqual(['b', 'c']);
  });
  it('totals only known prices and reports how many were priced', () => {
    expect(summarize(rows)).toEqual({
      total: 4,
      priced: 3,
      costAll: 95,
      withTarget: 3,
      atTarget: 1,
      costAtTarget: 15,
    });
  });
});

describe('parseTargetInput', () => {
  it('clears on blank and rejects non-positive input', () => {
    expect(parseTargetInput('  ')).toBeNull();
    expect(parseTargetInput('0')).toBeUndefined();
    expect(parseTargetInput('-3')).toBeUndefined();
    expect(parseTargetInput('abc')).toBeUndefined();
    expect(parseTargetInput('$1,250.505')).toBe(1250.51);
  });
});
