import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../../test/utils';
import { ErrorMessage } from '../ErrorMessage';

describe('ErrorMessage', () => {
  it('renders error message', () => {
    const errorMsg = 'Something went wrong';
    render(<ErrorMessage message={errorMsg} onRetry={() => {}} />);
    expect(screen.getByText(errorMsg)).toBeInTheDocument();
  });

  it('calls onRetry when retry button is clicked', async () => {
    const onRetry = vi.fn();
    const { user } = await import('@testing-library/user-event');
    const userEvent = user.setup();
    
    render(<ErrorMessage message="Error" onRetry={onRetry} />);
    const retryButton = screen.getByRole('button', { name: /try again/i });
    
    await userEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

