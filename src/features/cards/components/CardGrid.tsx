import React from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { PokemonCard } from './PokemonCard';
import { CardListRow } from './CardListRow';
import { PokemonCard as PokemonCardType } from '../../../types/pokemon';

export type CardViewMode = 'grid' | 'list';

interface CardGridProps {
  cards: PokemonCardType[];
  viewMode?: CardViewMode;
  onCardClick: (card: PokemonCardType) => void;
  onAddToCollection?: (card: PokemonCardType) => void;
  onViewPriceHistory?: (card: PokemonCardType) => void;
}

export const CardGrid: React.FC<CardGridProps> = ({
  cards,
  viewMode = 'grid',
  onCardClick,
  onAddToCollection,
  onViewPriceHistory,
}) => {
  if (viewMode === 'list') {
    return (
      <section className="animate-fade-in space-y-3">
        {cards.map((card) => (
          <CardListRow
            key={card.id}
            card={card}
            onClick={() => onCardClick(card)}
            onAddToCollection={onAddToCollection ? () => onAddToCollection(card) : undefined}
            onViewPriceHistory={onViewPriceHistory ? () => onViewPriceHistory(card) : undefined}
          />
        ))}
        <p className="pt-2 text-center text-xs text-slate-400">Showing {cards.length} cards</p>
      </section>
    );
  }

  return (
    <section className="animate-fade-in">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {cards.map((card) => (
          <PokemonCard
            key={card.id}
            card={card}
            onClick={() => onCardClick(card)}
            onAddToCollection={onAddToCollection ? () => onAddToCollection(card) : undefined}
            onViewPriceHistory={onViewPriceHistory ? () => onViewPriceHistory(card) : undefined}
          />
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-slate-400">Showing {cards.length} cards</p>
    </section>
  );
};

interface ViewModeToggleProps {
  viewMode: CardViewMode;
  onChange: (mode: CardViewMode) => void;
}

export const ViewModeToggle: React.FC<ViewModeToggleProps> = ({ viewMode, onChange }) => (
  <div className="inline-flex rounded-lg border border-white/15 bg-white/[0.04] p-0.5">
    <button
      type="button"
      onClick={() => onChange('grid')}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
        viewMode === 'grid' ? 'bg-white/12 text-white' : 'text-slate-400 hover:text-slate-200'
      }`}
      aria-pressed={viewMode === 'grid'}
    >
      <LayoutGrid className="h-3.5 w-3.5" />
      Grid
    </button>
    <button
      type="button"
      onClick={() => onChange('list')}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
        viewMode === 'list' ? 'bg-white/12 text-white' : 'text-slate-400 hover:text-slate-200'
      }`}
      aria-pressed={viewMode === 'list'}
    >
      <List className="h-3.5 w-3.5" />
      List
    </button>
  </div>
);
