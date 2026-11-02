import { describe, expect, it } from 'vitest';
import { buildTimeline, sliceRange, undatedCount } from '../portfolioTimeline';
import type { VaultCard } from '../../../types/pokemon';

const card = (id: string, market: number) =>
  ({
    id,
    name: id,
    images: { small: '', large: '' },
    set: { id: 's', name: 'S', releaseDate: '2020/01/01', total: 1 },
    number: '1',
    marketPrice: market,
  }) as VaultCard['card'];

const vc = (id: string, date: string, market: number, paid: number | null, qty = 1): VaultCard => ({
  id,
  card: card(id, market),
  purchasePrice: paid ?? 0,
  costKnown: paid != null,
  purchaseDate: date,
  quantity: qty,
  condition: 'near-mint',
});

describe('buildTimeline', () => {
  it('accumulates recorded cost and today’s value by acquisition date', () => {
    const pts = buildTimeline([
      vc('b', '2026-03-01T00:00:00Z', 50, 40),
      vc('a', '2026-01-10T00:00:00Z', 100, null, 2),
      vc('c', '2026-03-01T12:00:00Z', 10, 5),
    ]);
    expect(pts.map((p) => p.date)).toEqual(['2026-01-10', '2026-03-01']);
    // Unknown cost adds nothing to cost but still counts at market.
    expect(pts[0]).toMatchObject({ cost: 0, marketToday: 200 });
    expect(pts[1]).toMatchObject({ cost: 45, marketToday: 260 });
    expect(pts[1].added).toHaveLength(2);
  });

  it('skips cards without a date and reports them', () => {
    const cards = [vc('a', '', 10, 5), vc('b', '2026-02-02', 10, 5)];
    expect(buildTimeline(cards)).toHaveLength(1);
    expect(undatedCount(cards)).toBe(1);
  });
});

describe('sliceRange', () => {
  it('carries the running totals into the window instead of starting at zero', () => {
    const pts = buildTimeline([vc('a', '2025-01-01', 100, 80), vc('b', '2026-10-01', 10, 5)]);
    const now = Date.parse('2026-11-01T00:00:00Z');
    const s = sliceRange(pts, '3m', now);
    expect(s[0]).toMatchObject({ cost: 80, marketToday: 100, added: [] });
    expect(s[s.length - 1]).toMatchObject({ cost: 85, marketToday: 110 });
  });
});
