import { describe, expect, it } from 'vitest';
import {
  formatGradePremium,
  formatOddsLabel,
  getPullTheme,
  packIdentityStats,
  pullVisualKind,
} from '../packPresentation';
import { PackPull, ValueRange } from '../../../types/pokemon';

const platinumRanges: ValueRange[] = [
  { min: 400, max: 600, probability: 35, label: '$400-600' },
  { min: 600, max: 800, probability: 35, label: '$600-800' },
  { min: 800, max: 1000, probability: 20, label: '$800-1000' },
  { min: 1000, max: 1500, probability: 8, label: '$1000-1500' },
  { min: 1500, max: 2500, probability: 1.5, label: '$1500-2500' },
  { min: 2500, max: 5000, probability: 0.5, label: '$2500-5000' },
];

describe('packIdentityStats', () => {
  it('reads floor, top pull, and jackpot from disclosed ranges', () => {
    const stats = packIdentityStats(platinumRanges, 1000);
    expect(stats.floor).toBe(400);
    expect(stats.top).toBe(5000);
    expect(stats.jackpotChance).toBe(0.5);
    expect(stats.beatCostChance).toBe(10);
  });
});

describe('getPullTheme', () => {
  const base = {
    pack: { id: 'p', name: 'Gold Pack', tier: 'gold', price: 500, averageValue: 500, cardsPerPack: 1, valueRanges: [] },
    cards: [],
    totalValue: 800,
    profit: 300,
    openedAt: '',
  } as unknown as PackPull;

  it('uses foil accents for raw pulls', () => {
    expect(pullVisualKind({ pullKind: 'raw' })).toBe('raw');
    expect(getPullTheme({ ...base, pullKind: 'raw' }).hitLabel).toBe('CARD PULLED');
  });

  it('uses gold accents for PSA 10 slabs', () => {
    const theme = getPullTheme({ ...base, pullKind: 'slab', grader: 'PSA', grade: '10' });
    expect(theme.kind).toBe('psa');
    expect(theme.label).toBe('PSA 10');
    expect(theme.hitLabel).toBe('PSA 10 HIT');
  });

  it('uses cyan accents for CGC slabs', () => {
    expect(getPullTheme({ ...base, pullKind: 'slab', grader: 'CGC', grade: '10' }).kind).toBe('cgc');
  });
});

describe('formatGradePremium', () => {
  it('formats the slab multiple vs raw', () => {
    expect(formatGradePremium(993.22, 146.5)).toBe('6.8× raw');
  });
});

describe('formatOddsLabel', () => {
  it('uses an en dash between compact currency bounds', () => {
    expect(formatOddsLabel(platinumRanges[0])).toBe('$400–600');
  });
});
