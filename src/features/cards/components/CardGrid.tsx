import React from 'react';
import { motion } from 'framer-motion';
import { PokemonCard } from './PokemonCard';
import { PokemonCard as PokemonCardType } from '../../../types/pokemon';

interface CardGridProps {
  cards: PokemonCardType[];
  onCardClick: (card: PokemonCardType) => void;
}

export const CardGrid: React.FC<CardGridProps> = ({ cards, onCardClick }) => {
  // Container animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  // Card animation variants
  const cardVariants = {
    hidden: { 
      opacity: 0, 
      y: 20,
      scale: 0.9
    },
    visible: { 
      opacity: 1, 
      y: 0,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 260,
        damping: 20
      }
    }
  };

  return (
    <motion.div 
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {cards.map((card, index) => (
        <motion.div
          key={card.id}
          variants={cardVariants}
          custom={index}
        >
          <PokemonCard
            card={card}
            onClick={() => onCardClick(card)}
          />
        </motion.div>
      ))}
    </motion.div>
  );
};