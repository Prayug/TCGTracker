import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SlabPriceHistory } from '../SlabPriceHistory';

const history = {
  cardId: 'ex8-107',
  series: [
    {
      cardId: 'ex8-107',
      grader: 'cgc',
      grade: '10',
      latestPrice: 168000,
      points: [
        { date: '2026-10-01', price: 160000 },
        { date: '2026-11-01', price: 168000 },
      ],
    },
    {
      cardId: 'ex8-107',
      grader: 'psa',
      grade: '10',
      latestPrice: 49000,
      points: [
        { date: '2026-10-01', price: 47000 },
        { date: '2026-11-01', price: 49000 },
      ],
    },
  ],
};

describe('SlabPriceHistory', () => {
  it('lists every grade, PSA first, and charts PSA 10 by default', () => {
    render(<SlabPriceHistory history={history} range="ALL" cardName="Rayquaza ★" />);
    const chips = screen.getAllByRole('button');
    expect(chips[0]).toHaveTextContent('PSA 10');
    expect(screen.getByRole('button', { name: /PSA 10/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /CGC 10/ })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: /CGC 10/ }));
    expect(screen.getByRole('button', { name: /CGC 10/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('says so when there is no slab history', () => {
    render(<SlabPriceHistory history={{ cardId: 'x', series: [] }} range="6M" cardName="X" />);
    expect(screen.getByText('No slab price history yet')).toBeInTheDocument();
  });
});
