import React from 'react';
import { PokemonCard } from '../../types/pokemon';
import { pokemonApi } from '../../services/pokemonApi';
import { vaultService } from '../../services/vaultService';
import { formatCurrency } from '../../utils/cardDisplay';
import { PortfolioSnapshot } from './PortfolioSnapshot';

interface HeroPortfolioPreviewProps {
  cards: PokemonCard[];
  onCardClick: (card: PokemonCard) => void;
}

export const HeroPortfolioPreview: React.FC<HeroPortfolioPreviewProps> = ({
  cards,
  onCardClick,
}) => {
  const stats = vaultService.getVaultStats();

  const cardsWithPrice = cards
    .map((card) => ({ card, price: card.marketPrice ?? pokemonApi.extractCardPrice(card) }))
    .filter((entry) => entry.price > 0);

  const topCards = cardsWithPrice.slice(0, 5);

  return (
    <aside className="rounded-lg border border-border-default bg-surface-raised p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-ink-primary">Your vault</h2>

      <div className="mt-4">
        <PortfolioSnapshot stats={stats} dailyChange={null} />
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs font-medium text-ink-muted">Top priced cards</p>

        {topCards.length > 0 ? (
          <ul className="space-y-1">
            {topCards.map(({ card, price }) => (
              <li key={card.id}>
                <button
                  type="button"
                  onClick={() => onCardClick(card)}
                  className="flex w-full items-center justify-between rounded-md border border-border-subtle px-2.5 py-2 text-left transition-colors hover:border-border-default hover:bg-surface-hover"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-ink-primary">
                      {card.name}
                    </span>
                    <span className="block truncate text-[11px] text-ink-muted">{card.set.name}</span>
                  </span>
                  <span className="font-mono text-xs font-medium tabular-nums text-gain">
                    {formatCurrency(price)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-border-default px-3 py-4 text-center text-xs text-ink-muted">
            Search to see priced cards.
          </p>
        )}
      </div>
    </aside>
  );
};
