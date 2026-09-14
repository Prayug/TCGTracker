/** True only for a spec AbortSignal. Click events and plain objects fail this. */
export function asAbortSignal(value: unknown): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && value instanceof AbortSignal) {
    return value;
  }
  return undefined;
}
