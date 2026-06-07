import React, { useEffect, useState } from 'react';
import { PokemonCard } from '../../../types/pokemon';
import { pokemonApi } from '../../../services/pokemonApi';

interface FeaturedCardsProps {
  onCardClick: (card: PokemonCard) => void;
}

export const FeaturedCards: React.FC<FeaturedCardsProps> = ({ onCardClick }) => {
  const [cards, setCards] = useState<PokemonCard[]>([]);

  useEffect(() => {
    pokemonApi.searchCards('charizard', undefined, 5).then(setCards).catch(() => {});
  }, []);

  if (cards.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Featured Cards</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
          <button
            key={card.id}
            onClick={() => onCardClick(card)}
            className="group rounded-lg border border-border-subtle bg-surface-inset p-2 text-left transition hover:border-violet-500/40"
          >
            <img
              src={card.images.small}
              alt={card.name}
              className="mx-auto h-28 w-20 object-contain"
              loading="lazy"
            />
            <p className="mt-1 truncate text-xs font-medium text-ink-secondary group-hover:text-violet-200">
              {card.name}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
};

