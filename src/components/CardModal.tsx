import React from 'react';
import { PokemonCard } from '../types/pokemon';
import { pokemonApi } from '../services/pokemonApi';
import { Modal } from './Modal';

interface CardModalProps {
  card: PokemonCard | null;
  isOpen: boolean;
  onClose: () => void;
}

export const CardModal: React.FC<CardModalProps> = ({ card, isOpen, onClose }) => {
  if (!card) return null;

  const price = pokemonApi.extractCardPrice(card);
  const formattedDate = new Date(card.set.releaseDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6 text-center">
        <img
          src={card.images.large}
          alt={card.name}
          className="w-full max-w-xs mx-auto rounded-xl shadow-lg mb-6"
          loading="lazy"
        />
        
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">{card.name}</h2>
            {card.types && card.types.length > 0 && (
              <div className="flex justify-center gap-2 mb-2">
                {card.types.map((type) => (
                  <span
                    key={type}
                    className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                  >
                    {type}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="text-left">
              <p className="font-semibold text-gray-700 mb-1">Set</p>
              <p className="text-gray-900">{card.set.name}</p>
            </div>
            
            <div className="text-left">
              <p className="font-semibold text-gray-700 mb-1">Rarity</p>
              <p className="text-gray-900">{card.rarity || 'N/A'}</p>
            </div>
            
            <div className="text-left">
              <p className="font-semibold text-gray-700 mb-1">Release Date</p>
              <p className="text-gray-900">{formattedDate}</p>
            </div>
            
            <div className="text-left">
              <p className="font-semibold text-gray-700 mb-1">Price</p>
              <p className="text-green-600 font-semibold">
                {price > 0 ? `$${price.toFixed(2)}` : 'N/A'}
              </p>
            </div>
          </div>

          {card.artist && (
            <div className="text-center pt-2 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                <span className="font-semibold">Artist:</span> {card.artist}
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};