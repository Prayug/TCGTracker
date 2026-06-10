import React from 'react';
import { PokemonCard } from '../../types/pokemon';
import { pokemonApi } from '../../services/pokemonApi';
import { formatCurrency } from '../../utils/cardDisplay';

interface MarketPulseListProps {
  cards: PokemonCard[];
  onCardClick: (card: PokemonCard) => void;
}

export const MarketPulseList: React.FC<MarketPulseListProps> = ({ cards, onCardClick }) => {
  const rows = cards
    .map((card) => ({
      card,
      price: card.marketPrice ?? pokemonApi.extractCardPrice(card),
    }))
    .filter((entry) => entry.price > 0)
    .slice(0, 8);

  if (rows.length === 0) {
    return (
      <section className="rounded-lg border border-border-subtle bg-surface-inset px-4 py-6 text-sm text-ink-muted">
        Market prices appear after cards load.
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border-default bg-surface-raised">
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <h2 className="text-sm font-semibold text-ink-primary">Market pulse</h2>
        <span className="text-xs text-ink-muted">{rows.length} cards</span>
      </div>
      <ul className="divide-y divide-border-subtle">
        {rows.map(({ card, price }) => (
          <li key={card.id}>
            <button
              type="button"
              onClick={() => onCardClick(card)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-hover"
            >
              <img
                src={card.images.small}
                alt=""
                className="h-10 w-7 shrink-0 rounded object-cover object-top"
                loading="lazy"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink-primary">{card.name}</span>
                <span className="block truncate text-xs text-ink-muted">{card.set.name}</span>
              </span>
              <span className="shrink-0 font-mono text-sm font-medium tabular-nums text-gain">
                {formatCurrency(price)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

/** @deprecated Use MarketPulseList */
export const MarketTicker = MarketPulseList;
