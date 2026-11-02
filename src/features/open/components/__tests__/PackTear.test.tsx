import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PackTear } from '../PackTear';

describe('PackTear', () => {
  it('opens from the keyboard-reachable button and hands over once', () => {
    vi.useFakeTimers();
    const onOpened = vi.fn();
    render(<PackTear title="Romance Dawn" code="OP01" count={12} onOpened={onOpened} />);
    const button = screen.getByRole('button', { name: /tear open/i });
    fireEvent.click(button);
    fireEvent.click(button);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onOpened).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    vi.useRealTimers();
  });
});
