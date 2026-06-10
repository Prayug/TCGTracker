import { describe, expect, it } from 'vitest';
import { normalizeVariantKey, deterministicProductId } from '../dataFetcher';

describe('normalizeVariantKey', () => {
  it('lowercases and strips non-alphanumeric characters', () => {
    expect(normalizeVariantKey('Reverse Holofoil')).toBe('reverseholofoil');
    expect(normalizeVariantKey('Holofoil')).toBe('holofoil');
    expect(normalizeVariantKey('1st Edition Normal')).toBe('1steditionnormal');
  });

  it('returns "normal" for empty input', () => {
    expect(normalizeVariantKey('')).toBe('normal');
    expect(normalizeVariantKey(undefined)).toBe('normal');
    expect(normalizeVariantKey('   ')).toBe('normal');
  });

  it('handles special characters', () => {
    expect(normalizeVariantKey('Holo-Foil ★')).toBe('holofoil');
    expect(normalizeVariantKey('Normal (Holo)')).toBe('normalholo');
  });

  it('returns "normal" when normalization produces empty string', () => {
    expect(normalizeVariantKey('!!!')).toBe('normal');
  });
});

describe('deterministicProductId', () => {
  it('produces consistent IDs for same inputs', () => {
    const a = deterministicProductId('swsh1-4', 'holofoil');
    const b = deterministicProductId('swsh1-4', 'holofoil');
    expect(a).toBe(b);
  });

  it('produces different IDs for different card+variant combos', () => {
    const a = deterministicProductId('base1-4', 'holofoil');
    const b = deterministicProductId('base1-4', 'reverseholofoil');
    expect(a).not.toBe(b);
  });

  it('produces IDs within a valid range', () => {
    const id = deterministicProductId('swsh1-1', 'normal');
    expect(id).toBeGreaterThan(0);
    expect(id).toBeLessThan(100000001);
  });
});
