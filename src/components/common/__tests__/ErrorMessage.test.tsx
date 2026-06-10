import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../test/utils';
import { ErrorMessage } from '../ErrorMessage';

describe('ErrorMessage', () => {
  it('renders error message', () => {
    const errorMsg = 'Network connection failed';
    render(<ErrorMessage message={errorMsg} onRetry={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByText(errorMsg)).toBeInTheDocument();
  });

  it('calls onRetry when retry button is clicked', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();

    render(<ErrorMessage message="Error" onRetry={onRetry} />);
    const retryButton = screen.getByRole('button', { name: /try again/i });

    await user.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
