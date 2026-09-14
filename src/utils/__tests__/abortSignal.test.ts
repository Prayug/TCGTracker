import { describe, it, expect } from 'vitest';
import { asAbortSignal } from '../abortSignal';

describe('asAbortSignal', () => {
  it('accepts a native AbortSignal', () => {
    const controller = new AbortController();
    expect(asAbortSignal(controller.signal)).toBe(controller.signal);
  });

  it('rejects click-event shaped objects that axios would treat as a signal', () => {
    const fakeEvent = { type: 'click', target: {}, aborted: undefined };
    expect(asAbortSignal(fakeEvent)).toBeUndefined();
  });

  it('rejects undefined and null', () => {
    expect(asAbortSignal(undefined)).toBeUndefined();
    expect(asAbortSignal(null)).toBeUndefined();
  });
});
