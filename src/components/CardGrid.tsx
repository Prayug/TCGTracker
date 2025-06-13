import React from 'react';
import { PokemonCard } from './PokemonCard';
import { PokemonCard as PokemonCardType } from '../types/pokemon';

interface CardGridProps {
  cards: PokemonCardType[];
  onCardClick: (card: PokemonCardType) => void;
}

export const CardGrid: React.FC<CardGridProps> = ({ cards, onCardClick }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
      {cards.map((card) => (
        <PokemonCard
          key={card.id}
          card={card}
          onClick={() => onCardClick(card)}
        />
      ))}
    </div>
  );
};