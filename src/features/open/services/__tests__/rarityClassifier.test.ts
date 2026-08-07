import { describe, it, expect } from 'vitest';
import {
  classifyVariant,
  cleanName,
  isExcludedFromPacks,
  isPackableRarity,
  toPullCard,
  normalizeNumber,
} from '../rarityClassifier';

describe('classifyVariant', () => {
  it('detects manga rares before parallel/alt-art suffixes', () => {
    const c = classifyVariant('Monkey.D.Luffy (119) (Alternate Art) (Manga)', 'SEC', 'OP05-119');
    expect(c.rarity).toBe('MANGA');
    expect(c.baseRarity).toBe('SEC');
    expect(c.name).toBe('Monkey.D.Luffy (119)');
  });

  it('detects OP-01 manga naming "(Parallel) (Manga) (Alternate Art)"', () => {
    const c = classifyVariant('Shanks (Parallel) (Manga) (Alternate Art)', 'SEC', 'OP01-120');
    expect(c.rarity).toBe('MANGA');
  });

  it('maps Super Alternate Art to MANGA (never SEC)', () => {
    expect(classifyVariant('Monkey.D.Luffy (118) (Super Alternate Art)', 'SEC').rarity).toBe('MANGA');
    expect(classifyVariant('Sabo (120) (Super Alternate Art)', 'SEC').rarity).toBe('MANGA');
  });

  it('maps Red Super Alternate Art to SAA (never SEC)', () => {
    expect(classifyVariant('Monkey.D.Luffy (118) (Red Super Alternate Art)', 'SEC').rarity).toBe('SAA');
    expect(classifyVariant('Portgas.D.Ace (119) (Red Super Alternate Art)', 'SEC').rarity).toBe('SAA');
  });

  it('maps Wanted Poster to AA (not SP / SEC)', () => {
    expect(classifyVariant('Monkey.D.Luffy (118) (Wanted Poster)', 'SEC').rarity).toBe('AA');
  });

  it('maps anniversary gold/silver SP to SAA', () => {
    expect(classifyVariant('Shanks - OP09-004 (SP) (Silver)', 'SR').rarity).toBe('SAA');
  });

  it('keeps plain SEC as SEC', () => {
    expect(classifyVariant('Monkey.D.Luffy (118)', 'SEC').rarity).toBe('SEC');
  });

  it('detects SP cards', () => {
    const c = classifyVariant('Trafalgar Law (SP)', 'SR', 'OP01-047');
    expect(c.rarity).toBe('SP');
    expect(c.name).toBe('Trafalgar Law');
  });

  it('detects treasure rares by suffix and by rarity symbol', () => {
    expect(classifyVariant('Portgas.D.Ace (TR)', 'TR', 'OP08-052').rarity).toBe('TR');
    expect(classifyVariant('Nami (TR)', 'TR', 'ST01-007').rarity).toBe('TR');
    expect(classifyVariant('Some Card', 'TR', 'OP12-108').rarity).toBe('TR');
  });

  it('detects leader parallel / alternate art as LAA', () => {
    const c = classifyVariant('Roronoa Zoro (001) (Parallel)', 'L', 'OP01-001');
    expect(c.rarity).toBe('LAA');
    expect(c.baseRarity).toBe('L');
  });

  it('detects non-leader parallels as AA', () => {
    expect(classifyVariant('Nami (Parallel)', 'R', 'OP01-016').rarity).toBe('AA');
  });

  it('detects box toppers as alt arts (OP-01 leaders)', () => {
    expect(classifyVariant('Cavendish (Box Topper)', 'C', 'OP01-008').rarity).toBe('AA');
  });

  it('maps base rarities', () => {
    expect(classifyVariant('Caribou', 'C', 'OP01-007').rarity).toBe('C');
    expect(classifyVariant('Otama', 'UC', 'OP01-006').rarity).toBe('UC');
    expect(classifyVariant('Sanji', 'R', 'OP01-013').rarity).toBe('R');
    expect(classifyVariant('Kouzuki Oden', 'L', 'OP01-031').rarity).toBe('L');
    expect(classifyVariant('Monkey.D.Luffy (024)', 'SR', 'OP01-024').rarity).toBe('SR');
    expect(classifyVariant('Kaido (118)', 'SEC', 'OP05-118').rarity).toBe('SEC');
    expect(classifyVariant('Don!!', 'DON!!', 'OP04-001').rarity).toBe('DON');
  });

  it('does not mutate number-only names', () => {
    expect(classifyVariant('Round Table', 'C', 'OP01-027').name).toBe('Round Table');
  });
});

describe('cleanName', () => {
  it('strips variant suffixes', () => {
    expect(cleanName('Sabo (Alternate Art) (Manga)')).toBe('Sabo');
    expect(cleanName('Boa Hancock (SP)')).toBe('Boa Hancock');
    expect(cleanName('Monkey.D.Luffy (119) (Alternate Art)')).toBe('Monkey.D.Luffy (119)');
    expect(cleanName('Cavendish (Box Topper)')).toBe('Cavendish');
    expect(cleanName('Perona (Store Treasure Cup 2024)')).toBe('Perona (Store Treasure Cup 2024)');
  });
});

describe('filters', () => {
  it('excludes dash pack / signed promos from packs', () => {
    expect(isExcludedFromPacks('Speed Jil (Dash Pack)')).toBe(true);
    expect(isExcludedFromPacks('Monkey.D.Luffy (012) (Signed)')).toBe(true);
    expect(isExcludedFromPacks('Caribou')).toBe(false);
  });

  it('excludes promo rarities', () => {
    expect(isPackableRarity('P')).toBe(false);
    expect(isPackableRarity('PR')).toBe(false);
    expect(isPackableRarity('PS')).toBe(false);
    expect(isPackableRarity('C')).toBe(true);
  });

  it('normalizes card numbers', () => {
    expect(normalizeNumber('OP05-069')).toBe('op05-069');
    expect(normalizeNumber(' op05 - 069 ')).toBe('op05-069');
  });
});

describe('toPullCard', () => {
  it('marks chase cards', () => {
    const manga = toPullCard({ id: 'x', name: 'Enel (Alternate Art) (Manga)', rarity: 'SEC', number: 'OP15-118' });
    expect(manga.isChase).toBe(true);

    const common = toPullCard({ id: 'y', name: 'Caribou', rarity: 'C', number: 'OP01-007' });
    expect(common.isChase).toBe(false);
  });
});
