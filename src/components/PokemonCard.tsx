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
      className="group relative bg-white rounded-2xl shadow-md hover:shadow-2xl transition-all duration-500 cursor-pointer overflow-hidden border border-gray-100"
      onClick={onClick}
    >
      {/* Glow effect on hover */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl opacity-0 group-hover:opacity-20 blur transition-opacity duration-500" />
      
      <div className="relative">
        {/* Card Image Section */}
        <div className="relative overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 rounded-t-2xl">
          <img
            src={card.images.small}
            alt={card.name}
            className="w-full h-auto object-contain transition-all duration-500 group-hover:scale-110 aspect-[63/88]"
            loading="lazy"
          />
          {/* Shimmer effect on hover */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
          
          {/* Price badge overlay */}
          {price > 0 && (
            <div className="absolute top-3 right-3 bg-gradient-to-br from-emerald-500 to-green-600 text-white px-3 py-1.5 rounded-full text-sm font-bold shadow-lg transform group-hover:scale-110 transition-transform duration-300">
              ${price.toFixed(2)}
            </div>
          )}
        </div>
        
        {/* Card Info Section */}
        <div className="p-5 space-y-3">
          <div>
            <h3 className="font-bold text-gray-900 text-lg leading-tight line-clamp-2 mb-1.5 group-hover:text-blue-600 transition-colors duration-300">
              {card.name}
            </h3>
            <p className="text-gray-500 text-sm font-medium">{card.set.name}</p>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            {/* Rarity Badge */}
            {card.rarity && (
              <span className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-800 rounded-full text-xs font-semibold shadow-sm">
                ✨ {card.rarity}
              </span>
            )}
            
            {/* Type Badges */}
            {card.types && card.types.slice(0, 2).map((type) => (
              <span
                key={type}
                className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-800 rounded-full text-xs font-semibold shadow-sm"
              >
                {type}
              </span>
            ))}
          </div>

          {/* Artist info */}
          {card.artist && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                <span className="font-semibold text-gray-700">Artist:</span> {card.artist}
              </p>
            </div>
          )}
        </div>

        {/* Hover indicator */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 to-purple-600 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
      </div>
    </div>
  );
};