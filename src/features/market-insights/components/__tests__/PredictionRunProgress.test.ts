import { describe, it, expect } from 'vitest';
import { runCompletionPercent } from '../PredictionRunProgress';
import type { PredictionRunStatus } from '../../types';

describe('runCompletionPercent', () => {
  it('returns null until the universe size is known', () => {
    const status: PredictionRunStatus = {
      running: true,
      startedAt: new Date().toISOString(),
      last: null,
      progress: { phase: 'loading', total: 0, processed: 0, succeeded: 0, failed: 0 },
    };
    expect(runCompletionPercent(status)).toBeNull();
  });

  it('rounds scored / total to a percent', () => {
    const status: PredictionRunStatus = {
      running: true,
      startedAt: new Date().toISOString(),
      last: null,
      progress: { phase: 'scoring', total: 200, processed: 51, succeeded: 40, failed: 11 },
    };
    expect(runCompletionPercent(status)).toBe(26);
  });
});
