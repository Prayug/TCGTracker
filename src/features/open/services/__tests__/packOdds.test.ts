import { describe, it, expect } from 'vitest';
import { RarityPools, PullCard } from '../../types';
import { getSetConfig, buildOddsRows, BOXES_PER_CASE } from '../../data/setConfigs';
import {
  computeHitSlotOdds,
  openPack,
  openBox,
  openBoxes,
  rollRarity,
  rollBoxBudget,
  BoxBudget,
  buildPack,
  buildGodPack,
  fanCardsForPack,
  packMarketValue,
  softCount,
} from '../packOdds';

function card(rarity: string, i: number): PullCard {
  return {
    id: `${rarity}-${i}`,
    name: `${rarity} Card ${i}`,
    number: `OP01-${i}`,
    rarity: rarity as PullCard['rarity'],
    isChase: ['SAA', 'MANGA', 'TR', 'SP', 'SEC', 'LAA', 'AA'].includes(rarity),
  };
}

function makePools(counts: Partial<Record<keyof RarityPools, number>> = {}): RarityPools {
  const pool = (key: keyof RarityPools, n = 0) =>
    Array.from({ length: n }, (_, i) => card(String(key), i));
  return {
    C: pool('C', counts.C ?? 40),
    UC: pool('UC', counts.UC ?? 30),
    R: pool('R', counts.R ?? 25),
    L: pool('L', counts.L ?? 6),
    SR: pool('SR', counts.SR ?? 10),
    SEC: pool('SEC', counts.SEC ?? 2),
    AA: pool('AA', counts.AA ?? 12),
    LAA: pool('LAA', counts.LAA ?? 4),
    SP: pool('SP', counts.SP ?? 6),
    TR: pool('TR', counts.TR ?? 1),
    MANGA: pool('MANGA', counts.MANGA ?? 1),
    SAA: pool('SAA', counts.SAA ?? 3),
    DON: pool('DON', counts.DON ?? 10),
  };
}

const seededRng = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
};

const OP06 = getSetConfig('OP-06')!;
const EB03 = getSetConfig('EB-03')!;

describe('computeHitSlotOdds', () => {
  it('uses English box averages for OP-06 (~7 L / ~7 SR / ~⅔ SEC)', () => {
    const odds = computeHitSlotOdds(OP06, makePools());
    const byRarity = Object.fromEntries(odds.map((o) => [o.rarity, o.probability]));
    expect(byRarity.L).toBeCloseTo(7 / 24, 5);
    expect(byRarity.SR).toBeCloseTo(7 / 24, 5);
    expect(byRarity.AA).toBeCloseTo(1 / 24, 5);
    expect(byRarity.LAA).toBeCloseTo(4 / 12 / 24, 5);
    expect(byRarity.SEC).toBeCloseTo(8 / 12 / 24, 5);
    expect(byRarity.SP).toBeCloseTo(2 / (24 * BOXES_PER_CASE), 5);
    expect(byRarity.TR).toBeCloseTo(1 / (24 * BOXES_PER_CASE), 5);
    expect(byRarity.MANGA).toBeCloseTo(1 / (5 * 24 * BOXES_PER_CASE), 5);
    const total = odds.reduce((s, o) => s + o.probability, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('zeroes probabilities when pools are missing', () => {
    const pools = makePools({ MANGA: 0, TR: 0, SP: 0, LAA: 0 });
    const odds = computeHitSlotOdds(OP06, pools);
    const byRarity = Object.fromEntries(odds.map((o) => [o.rarity, o.probability]));
    expect(byRarity.MANGA ?? 0).toBe(0);
    expect(byRarity.TR ?? 0).toBe(0);
    expect(byRarity.SP ?? 0).toBe(0);
    expect(byRarity.LAA ?? 0).toBe(0);
    expect(byRarity.R).toBeGreaterThan(0);
  });
});

describe('rollRarity', () => {
  it('respects configured weights over many rolls', () => {
    const odds = computeHitSlotOdds(OP06, makePools());
    const counts: Record<string, number> = {};
    for (let i = 0; i < 20000; i++) {
      const r = rollRarity(odds, seededRng(i + 1));
      counts[r] = (counts[r] ?? 0) + 1;
    }
    // ~7/24 ≈ 29% Leaders and SRs
    expect(counts.L / 20000).toBeGreaterThan(0.24);
    expect(counts.L / 20000).toBeLessThan(0.35);
    expect(counts.SR / 20000).toBeGreaterThan(0.24);
    expect(counts.SR / 20000).toBeLessThan(0.35);
  });
});

describe('openPack', () => {
  it('returns exactly 12 cards with 7 C / 3 UC / 1 R + hit for standard sets', () => {
    for (let i = 0; i < 50; i++) {
      const pack = openPack(OP06, makePools(), seededRng(i), '2026-01-01T00:00:00Z');
      expect(pack.cards).toHaveLength(12);
      const byRarity: Record<string, number> = {};
      pack.cards.forEach((c) => (byRarity[c.rarity] = (byRarity[c.rarity] ?? 0) + 1));
      expect(byRarity.C).toBe(7);
      expect(byRarity.UC).toBe(3);
      expect(byRarity.R).toBeGreaterThanOrEqual(1);
      expect(byRarity.R).toBeLessThanOrEqual(2);
    }
  });

  it('uses 10C + no UC for extra boosters', () => {
    for (let i = 0; i < 30; i++) {
      const pack = openPack(EB03, makePools(), seededRng(i), 't');
      expect(pack.cards).toHaveLength(12);
      expect(pack.cards.filter((c) => c.rarity === 'C')).toHaveLength(10);
      expect(pack.cards.filter((c) => c.rarity === 'UC')).toHaveLength(0);
    }
  });

  it('hit slot is always L/SR/AA/LAA/SEC/SP/TR/MANGA/R', () => {
    const allowed = new Set(['L', 'SR', 'AA', 'LAA', 'SEC', 'SP', 'TR', 'MANGA', 'R']);
    for (let i = 0; i < 200; i++) {
      const pack = openPack(OP06, makePools(), seededRng(i), 't');
      const hit = pack.cards[pack.cards.length - 1];
      expect(allowed.has(hit.rarity)).toBe(true);
    }
  });

  it('degrades to Rare when a rarity pool is missing', () => {
    const pools = makePools({ L: 0, SR: 0, AA: 0, LAA: 0, SEC: 0, SP: 0, TR: 0, MANGA: 0 });
    for (let i = 0; i < 30; i++) {
      const pack = openPack(OP06, pools, seededRng(i), 't');
      const hit = pack.cards[11];
      expect(['R', 'UC']).toContain(hit.rarity);
    }
  });

  it('still yields 12 cards when C/UC pools are thinner than the pack needs', () => {
    const pools = makePools({ C: 3, UC: 2, R: 5 });
    for (let i = 0; i < 40; i++) {
      const pack = openPack(OP06, pools, seededRng(i), 't');
      expect(pack.cards).toHaveLength(12);
      expect(pack.cards.filter((c) => c.rarity === 'C')).toHaveLength(7);
      expect(pack.cards.filter((c) => c.rarity === 'UC')).toHaveLength(3);
    }
  });

  it('buildPack keeps the hit slot last', () => {
    const pools = makePools();
    for (let i = 0; i < 30; i++) {
      const cards = buildPack(OP06, pools, seededRng(i), { hitRarity: 'SEC' });
      expect(cards).toHaveLength(12);
      expect(cards[11].rarity).toBe('SEC');
    }
  });
});

describe('fanCardsForPack / DON!!', () => {
  it('appends donCard after the pack for the reveal fan', () => {
    const pack = openPack(OP06, makePools(), seededRng(1), 't');
    const don = card('DON', 99);
    pack.donCard = don;
    const fan = fanCardsForPack(pack);
    expect(fan).toHaveLength(13);
    expect(fan[12].rarity).toBe('DON');
    expect(packMarketValue(pack)).toBe(
      pack.cards.reduce((s, c) => s + (c.marketPrice ?? 0), 0) + (don.marketPrice ?? 0)
    );
  });

  it('openBox assigns a DON!! to exactly one pack when hasDon', () => {
    const pools = makePools();
    const donPool = makePools().DON;
    for (let seed = 1; seed <= 20; seed++) {
      const packs = openBox(OP06, pools, seededRng(seed), 't', donPool);
      expect(packs.filter((p) => p.donCard)).toHaveLength(1);
    }
  });
});

describe('god pack', () => {
  it('replaces a pack with a full chase god pack', () => {
    const cfg = {
      ...OP06,
      godPack: { kind: 'sec' as const, perCases: 1, cardCount: 6 },
    };
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const packs = openBox(cfg, makePools(), seededRng(seed), 't');
      const god = packs.find((p) => p.cards.every((c) => c.rarity === 'SEC') && p.hits.length >= 6);
      if (god) {
        found = true;
        expect(god.cards).toHaveLength(12);
        expect(god.cards.every((c) => c.rarity === 'SEC')).toBe(true);
      }
    }
    expect(found).toBe(true);
  });

  it('buildGodPack returns cardCount chase cards padded to 12', () => {
    const cfg = { ...EB03, godPack: { kind: 'sp' as const, perCases: 15, cardCount: 6 } };
    const cards = buildGodPack(cfg, makePools(), seededRng(3));
    expect(cards).not.toBeNull();
    expect(cards!).toHaveLength(12);
    expect(cards!.every((c) => c.rarity === 'SP')).toBe(true);
  });
});

describe('openBox', () => {
  const summarize = (packs: ReturnType<typeof openBox>) => {
    const hits: Record<string, number> = {};
    packs.forEach((p) => {
      // Skip full god packs when summarizing slot hits
      if (p.cards.every((c) => c.isChase) && p.hits.length >= 6) return;
      const hit = p.cards[p.cards.length - 1];
      hits[hit.rarity] = (hits[hit.rarity] ?? 0) + 1;
    });
    return hits;
  };

  it('produces 24 packs of 12 cards', () => {
    const packs = openBox(OP06, makePools(), seededRng(7), 't');
    expect(packs).toHaveLength(24);
    packs.forEach((p) => expect(p.cards).toHaveLength(12));
  });

  it('matches English box averages on soft budget (L ~7, SR ~7, SEC ~0.67)', () => {
    const totals: Record<string, number> = {};
    let boxes = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const packs = openBox(OP06, makePools(), seededRng(seed), 't');
      boxes++;
      Object.entries(summarize(packs)).forEach(([r, n]) => (totals[r] = (totals[r] ?? 0) + n));
    }
    const avg = (r: string) => (totals[r] ?? 0) / boxes;
    expect(avg('L')).toBeGreaterThan(5);
    expect(avg('L')).toBeLessThan(9.5);
    expect(avg('SR')).toBeGreaterThan(5);
    expect(avg('SR')).toBeLessThan(9.5);
    expect(avg('AA')).toBeGreaterThan(0.3);
    expect(avg('AA')).toBeLessThan(2.2);
    expect(avg('SEC')).toBeGreaterThan(0.25);
    expect(avg('SEC')).toBeLessThan(1.4);
  });

  it('SP/TR/Manga appear rarely at case odds', () => {
    let sp = 0;
    let tr = 0;
    let manga = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const hits = summarize(openBox(OP06, makePools(), seededRng(seed), 't'));
      sp += hits.SP ?? 0;
      tr += hits.TR ?? 0;
      manga += hits.MANGA ?? 0;
    }
    // 300 boxes ≈ 25 cases → ~50 SP, ~25 TR, ~5 manga
    expect(sp).toBeGreaterThan(15);
    expect(sp).toBeLessThan(90);
    expect(tr).toBeGreaterThan(5);
    expect(tr).toBeLessThan(50);
    expect(manga).toBeGreaterThan(0);
    expect(manga).toBeLessThan(20);
  });

  it('never gives a normal pack more than one budgeted hit', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const packs = openBox(OP06, makePools(), seededRng(seed), 't');
      packs.forEach((p) => {
        if (p.hits.length >= 6) return; // god pack
        const hits = p.cards.filter((c) =>
          ['L', 'SR', 'AA', 'LAA', 'SEC', 'SP', 'TR', 'MANGA'].includes(c.rarity)
        );
        expect(hits.length).toBeLessThanOrEqual(1);
      });
    }
  });
});

describe('openBoxes / case', () => {
  it('opens 12 boxes for a case', () => {
    const boxes = openBoxes(OP06, makePools(), seededRng(9), 't', BOXES_PER_CASE);
    expect(boxes).toHaveLength(12);
    expect(boxes.flat()).toHaveLength(12 * 24);
  });
});

describe('rollBoxBudget', () => {
  it('soft-counts box hits and caps case hits at 1', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const b: BoxBudget = rollBoxBudget(OP06, makePools(), seededRng(seed));
      expect(b.L).toBeGreaterThanOrEqual(0);
      expect(b.L).toBeLessThanOrEqual(10);
      expect(b.SR).toBeGreaterThanOrEqual(0);
      expect(b.SR).toBeLessThanOrEqual(10);
      expect(b.SP).toBeLessThanOrEqual(1);
      expect(b.TR).toBeLessThanOrEqual(1);
      expect(b.MANGA).toBeLessThanOrEqual(1);
    }
  });

  it('softCount averages near the expected value', () => {
    let sum = 0;
    for (let i = 0; i < 2000; i++) sum += softCount(7, seededRng(i + 3));
    expect(sum / 2000).toBeGreaterThan(6.2);
    expect(sum / 2000).toBeLessThan(7.8);
  });
});

describe('buildOddsRows', () => {
  it('renders disclosure rows for OP-06 with accurate rates', () => {
    const rows = buildOddsRows(OP06, { count: 25 });
    const labels = rows.map((r) => r.label);
    expect(labels).toContain('Common');
    expect(labels).toContain('Leader');
    expect(labels).toContain('Super Rare');
    expect(labels).toContain('Alternate Art');
    expect(labels).toContain('Leader Alternate Art');
    expect(labels).toContain('Secret Rare');
    expect(labels).toContain('Special Rare');
    expect(labels).toContain('Treasure Rare');
    expect(labels).toContain('Manga / Super Alt Art');
    expect(labels).toContain('DON!!');
    const manga = rows.find((r) => r.label === 'Manga / Super Alt Art')!;
    expect(manga.perPack).toBeCloseTo(1 / (5 * 24 * BOXES_PER_CASE) * 100, 5);
    const common = rows.find((r) => r.label === 'Common')!;
    expect(common.perBox).toContain('7');
  });

  it('shows 10 commons for extra boosters', () => {
    const rows = buildOddsRows(EB03, { count: 10 });
    expect(rows.find((r) => r.label === 'Common')!.perBox).toContain('10');
    expect(rows.find((r) => r.label === 'Uncommon')!.perBox).toBe('none');
  });

  it('excludes case-level rows when the set has no such cards', () => {
    const op01 = getSetConfig('OP-01')!;
    const rows = buildOddsRows(op01, { count: 0 });
    expect(rows.some((r) => r.label === 'Special Rare')).toBe(false);
    expect(rows.some((r) => r.label === 'DON!!')).toBe(false);
    expect(rows.some((r) => r.label === 'Manga / Super Alt Art')).toBe(true);
  });

  it('lists Red Super Alt Art rates for OP-13', () => {
    const op13 = getSetConfig('OP-13')!;
    const rows = buildOddsRows(op13, { count: 10 });
    const saa = rows.find((r) => r.label === 'Red Super Alternate Art')!;
    expect(saa).toBeTruthy();
    expect(saa.perBox).toContain('200');
  });
});
