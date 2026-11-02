import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useProgressiveCount } from '../useProgressiveCount';

describe('useProgressiveCount', () => {
  it('starts with one step, never past the total, and resets on a new key', () => {
    const { result, rerender } = renderHook(
      ({ total, key }) => useProgressiveCount(total, 10, key),
      {
        initialProps: { total: 25, key: 'a' },
      }
    );
    expect(result.current.count).toBe(10);
    expect(result.current.done).toBe(false);
    rerender({ total: 4, key: 'a' });
    expect(result.current.count).toBe(4);
    act(() => rerender({ total: 25, key: 'b' }));
    expect(result.current.count).toBe(10);
  });
});
