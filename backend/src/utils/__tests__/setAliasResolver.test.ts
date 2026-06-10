import { describe, expect, it } from 'vitest';
import { normalizeSetKey } from '../../services/setAliasResolver';

describe('normalizeSetKey', () => {
  it('strips punctuation for cross-source matching', () => {
    expect(normalizeSetKey('ME04: Chaos Rising')).toBe('me04chaosrising');
    expect(normalizeSetKey('Chaos Rising')).toBe('chaosrising');
  });
});
