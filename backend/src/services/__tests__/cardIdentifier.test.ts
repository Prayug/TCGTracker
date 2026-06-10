import { describe, expect, it } from 'vitest';
import { generateUniqueIdentifier } from '../cardIdentifier';

describe('generateUniqueIdentifier', () => {
  it('normalizes set ID by removing special characters and lowercasing', () => {
    const id = generateUniqueIdentifier('SWORD & SHIELD', '1', 'Pikachu', 'normal');
    expect(id).toContain('sword');
    expect(id).not.toContain('&');
  });

  it('includes variant key in the identifier', () => {
    const normal = generateUniqueIdentifier('set1', '1', 'Pikachu', 'normal');
    const holo = generateUniqueIdentifier('set1', '1', 'Pikachu', 'holofoil');
    expect(normal).not.toBe(holo);
  });

  it('produces consistent output for same inputs', () => {
    const a = generateUniqueIdentifier('base1', '4', 'Charizard', 'holofoil');
    const b = generateUniqueIdentifier('base1', '4', 'Charizard', 'holofoil');
    expect(a).toBe(b);
  });

  it('handles missing card number', () => {
    const id = generateUniqueIdentifier('swsh1', undefined, 'Energy', 'normal');
    expect(id).toMatch(/swsh1\|\|energy\|normal/);
  });

  it('defaults variant to normal when empty', () => {
    const id = generateUniqueIdentifier('set1', '1', 'Card', '');
    expect(id).toContain('normal');
  });
});
