import { describe, expect, it } from 'vitest';
import { finishOf } from '../finish';

describe('finishOf', () => {
  it('keeps ordinary prints non-foil', () => {
    expect(finishOf({ rarity: 'Common' })).toBe('none');
    expect(finishOf({ rarity: 'Rare' })).toBe('none');
    expect(finishOf({})).toBe('none');
    expect(finishOf(null)).toBe('none');
  });

  it('reads holo and reverse holo from rarity and variant', () => {
    expect(finishOf({ rarity: 'Rare Holo' })).toBe('holo');
    expect(finishOf({ rarity: 'Rare', preferredVariant: 'holofoil' })).toBe('holo');
    expect(finishOf({ rarity: 'Common', preferredVariant: 'reverseHolofoil' })).toBe('reverse');
    expect(finishOf({ rarity: 'Uncommon', subTypeName: 'Reverse Holofoil' })).toBe('reverse');
  });

  it('distinguishes the chase finishes', () => {
    expect(finishOf({ rarity: 'Special Illustration Rare' })).toBe('illustration');
    expect(finishOf({ rarity: 'Rare Rainbow' })).toBe('rainbow');
    expect(finishOf({ rarity: 'Hyper Rare' })).toBe('rainbow');
    expect(finishOf({ rarity: 'Rare Holo Star' })).toBe('gold');
    expect(finishOf({ rarity: 'Rare Holo VMAX' })).toBe('textured');
    expect(finishOf({ rarity: 'Double Rare' })).toBe('textured');
    expect(finishOf({ rarity: 'Rare Holo VSTAR' })).toBe('textured');
    expect(finishOf({ rarity: 'SEC' })).toBe('textured');
  });
});
