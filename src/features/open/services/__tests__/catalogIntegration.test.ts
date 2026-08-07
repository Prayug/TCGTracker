import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RarityPools, PullCard } from '../../types';
import { toPullCard, isPackableRarity, isExcludedFromPacks } from '../rarityClassifier';
import { openPack, openBox } from '../packOdds';
import { getSetConfig } from '../../data/setConfigs';

interface RawCard {
  id: string;
  name: string;
  number?: string;
  rarity?: string;
  images?: { small?: string };
  marketPrice?: number;
}

function loadFixture(file: string): RawCard[] {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', file), 'utf8'));
}

function buildPools(cards: RawCard[]): RarityPools {
  const pools: RarityPools = {
    C: [],
    UC: [],
    R: [],
    L: [],
    SR: [],
    SEC: [],
    AA: [],
    LAA: [],
    SP: [],
    TR: [],
    MANGA: [],
    SAA: [],
    DON: [],
  };
  const seen = new Set<string>();
  for (const raw of cards) {
    if (!isPackableRarity(raw.rarity)) continue;
    if (isExcludedFromPacks(raw.name)) continue;
    const card: PullCard = toPullCard({
      id: raw.id,
      name: raw.name,
      number: raw.number,
      rarity: raw.rarity,
      imageUrl: raw.images?.small,
      marketPrice: raw.marketPrice,
    });
    const key = `${card.rarity}::${card.number}::${card.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pools[card.rarity].push(card);
  }
  return pools;
}

const seededRng = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
};

describe('catalog integration (real payloads)', () => {
  it('builds OP-05 pools from the live catalog shape', () => {
    const pools = buildPools(loadFixture('OP-05.json'));
    expect(pools.MANGA.length).toBe(3);
    expect(pools.SP.length).toBeGreaterThan(4);
    expect(pools.AA.length + pools.LAA.length).toBeGreaterThan(20);
    expect(pools.C.length).toBeGreaterThan(20);
    expect(pools.SR.length).toBeGreaterThan(5);
    expect(pools.SEC.length).toBeGreaterThan(0);
  });

  it('classifies OP-01 parallels into AA / LAA pools', () => {
    const pools = buildPools(loadFixture('OP-01.json'));
    expect(pools.AA.length + pools.LAA.length).toBeGreaterThan(15);
    expect(pools.MANGA.length).toBe(1);
  });

  it('opens realistic OP-05 packs with real card data', () => {
    const cfg = getSetConfig('OP-05')!;
    const pools = buildPools(loadFixture('OP-05.json'));
    let withPrice = 0;
    for (let i = 0; i < 40; i++) {
      const pack = openPack(cfg, pools, seededRng(i), 't');
      expect(pack.cards).toHaveLength(12);
      const last = pack.cards[11];
      expect(['L', 'SR', 'AA', 'LAA', 'SEC', 'SP', 'TR', 'MANGA', 'R']).toContain(last.rarity);
      if (last.marketPrice && last.marketPrice > 0) withPrice++;
    }
    expect(withPrice).toBeGreaterThan(0);
  });

  it('opens a full OP-05 box with soft English structure', () => {
    const cfg = getSetConfig('OP-05')!;
    const pools = buildPools(loadFixture('OP-05.json'));
    const packs = openBox(cfg, pools, seededRng(42), 't');
    expect(packs).toHaveLength(24);
    const leaders = packs.filter((p) => p.cards[11].rarity === 'L').length;
    // Soft budget ~7 leaders/box — allow variance
    expect(leaders).toBeGreaterThanOrEqual(3);
    expect(leaders).toBeLessThanOrEqual(11);
  });
});
