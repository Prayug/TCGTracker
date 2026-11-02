import { describe, expect, it } from 'vitest';
import { confidenceLabel } from '../confidence';

describe('confidenceLabel', () => {
  it('words the score and keeps the number', () => {
    expect(confidenceLabel(0.92)).toEqual({ text: 'Confident match · 92%', tone: 'good' });
    expect(confidenceLabel(0.8).tone).toBe('good');
    expect(confidenceLabel(0.64).text).toMatch(/^Possible match · 64%/);
    expect(confidenceLabel(0.35)).toMatchObject({ tone: 'weak' });
    expect(confidenceLabel(0.35).text).toMatch(/different card/);
  });
});
