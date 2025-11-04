import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/utils';
import { LoadingSpinner } from '../LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders loading spinner', () => {
    render(<LoadingSpinner />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('displays loading message', () => {
    render(<LoadingSpinner />);
    expect(screen.getByText(/discovering amazing cards/i)).toBeInTheDocument();
  });
});

