import { describe, expect, it } from 'vitest';
import { formatInsightScore, insightScoreValue } from '../formatInsightNumbers';

describe('formatInsightScore', () => {
  it('rounds long floats to whole scores', () => {
    expect(formatInsightScore(31.40975473976649)).toBe('31');
    expect(formatInsightScore(28.1)).toBe('28');
  });

  it('shows integers without a trailing decimal', () => {
    expect(formatInsightScore(72)).toBe('72');
    expect(formatInsightScore(72.04)).toBe('72');
    expect(formatInsightScore(58)).toBe('58');
  });

  it('handles nullish and non-finite values', () => {
    expect(formatInsightScore(null)).toBe('—');
    expect(formatInsightScore(undefined)).toBe('—');
    expect(formatInsightScore(Number.NaN)).toBe('—');
  });
});

describe('insightScoreValue', () => {
  it('returns a rounded integer for bars', () => {
    expect(insightScoreValue(31.40975473976649)).toBe(31);
    expect(insightScoreValue(28.1)).toBe(28);
  });
});
