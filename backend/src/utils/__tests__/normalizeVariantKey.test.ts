import { canonicalFinishVariantKey, normalizeVariantKey } from '../normalizeVariantKey';

describe('canonicalFinishVariantKey', () => {
  it('keeps real finishes', () => {
    expect(canonicalFinishVariantKey('Reverse Holofoil')).toBe('reverseholofoil');
    expect(canonicalFinishVariantKey('holofoil')).toBe('holofoil');
  });

  it('maps Cardmarket channel names onto finishes', () => {
    expect(canonicalFinishVariantKey('cardmarket')).toBe('normal');
    expect(canonicalFinishVariantKey('cardmarket-holo')).toBe('holofoil');
    expect(normalizeVariantKey('cardmarket-holo')).toBe('cardmarketholo');
  });
});
