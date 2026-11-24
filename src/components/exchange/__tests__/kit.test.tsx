import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { SectionHeader, LinkRow } from '../Section';
import { Sparkline } from '../Sparkline';
import { DataTable } from '../DataTable';
import { EmptyState, ErrorState, LoadingRows } from '../States';
import { CardTile } from '../CardTile';

describe('exchange kit', () => {
  it('section header renders a sentence-case title and a link action', () => {
    render(
      <MemoryRouter>
        <SectionHeader
          title="What moved"
          note="7 days"
          action={{ to: '/vault', label: 'Open vault' }}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'What moved' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open vault' })).toHaveAttribute('href', '/vault');
  });

  it('link row lists links with counts', () => {
    render(
      <MemoryRouter>
        <LinkRow label="More" links={[{ to: '/a', label: 'Slab movers', meta: 12 }]} />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Slab movers' })).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('sparkline colours by direction and degrades with too few points', () => {
    const { container, rerender } = render(<Sparkline values={[1, 2, 3]} label="Up" />);
    expect(container.querySelector('svg')).toHaveClass('text-gain');
    rerender(<Sparkline values={[3, 2, 1]} label="Down" />);
    expect(container.querySelector('svg')).toHaveClass('text-loss');
    rerender(<Sparkline values={[3]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('data table renders rows and an empty state', () => {
    const cols = [
      { key: 'n', header: 'Name', cell: (r: { n: string; v: number }) => r.n },
      { key: 'v', header: 'Value', numeric: true, cell: (r: { n: string; v: number }) => r.v },
    ];
    const { rerender } = render(
      <DataTable rows={[{ n: 'Charizard', v: 5 }]} columns={cols} rowKey={(r) => r.n} />
    );
    expect(screen.getByText('Charizard')).toBeInTheDocument();
    rerender(<DataTable rows={[]} columns={cols} rowKey={(r) => r.n} empty={<p>Nothing</p>} />);
    expect(screen.getByText('Nothing')).toBeInTheDocument();
  });

  it('states announce themselves', async () => {
    const retry = vi.fn();
    render(
      <>
        <LoadingRows rows={2} label="Loading movers" />
        <EmptyState title="No holdings yet" />
        <ErrorState onRetry={retry} />
      </>
    );
    expect(screen.getByRole('status', { name: 'Loading movers' })).toBeInTheDocument();
    expect(screen.getByText('No holdings yet')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });

  it('card tile links to the research page without overlapping badges', () => {
    render(
      <MemoryRouter>
        <CardTile
          card={{ id: 'base1-4', name: 'Charizard', set: { name: 'Base' }, number: '4' }}
          to="/card/base1-4"
          density="row"
          aside={<span>Buy</span>}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Charizard, Base' })).toHaveAttribute(
      'href',
      '/card/base1-4'
    );
    expect(screen.getByText('Base · #4')).toBeInTheDocument();
  });
});
