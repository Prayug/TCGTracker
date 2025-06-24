import React from 'react';
import { PokemonCard as PokemonCardType } from '../types/pokemon';
import { pokemonApi } from '../services/pokemonApi';

interface PokemonCardProps {
  card: PokemonCardType;
  onClick: () => void;
}

export const PokemonCard: React.FC<PokemonCardProps> = ({ card, onClick }) => {
  const price = card.marketPrice || pokemonApi.extractCardPrice(card);

  return (
    <div 
      className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer transform hover:scale-105 overflow-hidden group relative"
      onClick={onClick}
    >
      <div className="relative overflow-hidden bg-gray-100 rounded-t-xl">
        <img
          src={card.images.small}
          alt={card.name}
          className="w-full h-auto object-contain transition-transform duration-300 group-hover:scale-105 aspect-[63/88]"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>
      
      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-bold text-gray-900 text-lg leading-tight line-clamp-2 mb-1">
            {card.name}
          </h3>
          <p className="text-gray-600 text-sm font-medium">{card.set.name}</p>
        </div>
        
        <div className="flex justify-between items-center">
          <div>
            {card.rarity && (
              <span className="inline-block px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
                {card.rarity}
              </span>
            )}
          </div>
          <div className="text-right">
            <p className="text-green-600 font-bold text-lg">
              {price > 0 ? `$${price.toFixed(2)}` : 'N/A'}
            </p>
          </div>
        </div>
        
        {card.types && card.types.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {card.types.slice(0, 2).map((type) => (
              <span
                key={type}
                className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium"
              >
                {type}
              </span>
            ))}
          </div>
        )}

        {/* Artist information if available */}
        {card.artist && (
          <div className="border-t pt-3">
            <p className="text-xs text-gray-600">
              <span className="font-semibold">Artist:</span> {card.artist}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};