import React from 'react';
import { PokemonCard as PokemonCardType } from '../types/pokemon';
import { pokemonApi } from '../services/pokemonApi';

interface PokemonCardProps {
  card: PokemonCardType;
  onClick: () => void;
}

export const PokemonCard: React.FC<PokemonCardProps> = ({ card, onClick }) => {
  const price = card.marketPrice || pokemonApi.extractCardPrice(card);

  const getRarityGradient = (rarity?: string) => {
    if (!rarity) return 'from-gray-100 to-gray-200';
    if (rarity.toLowerCase().includes('rare')) return 'from-accent-100 to-pink-100';
    if (rarity.toLowerCase().includes('holo')) return 'from-purple-100 to-pink-100';
    if (rarity.toLowerCase().includes('ultra')) return 'from-yellow-100 to-orange-100';
    return 'from-primary-100 to-accent-100';
  };

  return (
    <div 
      className="group relative bg-white rounded-2xl shadow-card hover:shadow-card-hover transition-all duration-500 cursor-pointer overflow-hidden border-2 border-gray-100 hover:border-primary-300 shine"
      onClick={onClick}
    >
      {/* Enhanced Glow effect on hover */}
      <div className="absolute -inset-1 bg-gradient-to-r from-primary-600 via-accent-600 to-pink-600 rounded-2xl opacity-0 group-hover:opacity-30 blur-xl transition-all duration-500" />
      
      <div className="relative bg-white rounded-2xl">
        {/* Card Image Section with enhanced background */}
        <div className={`relative overflow-hidden bg-gradient-to-br ${getRarityGradient(card.rarity)} rounded-t-2xl p-4`}>
          <div className="relative">
            <img
              src={card.images.small}
              alt={card.name}
              className="w-full h-auto object-contain transition-all duration-700 group-hover:scale-110 group-hover:rotate-2 aspect-[63/88] rounded-lg shadow-lg"
              loading="lazy"
              onError={(e) => {
                // Fallback to large image if small image fails, or use a data URI placeholder
                const target = e.target as HTMLImageElement;
                if (target.src !== card.images.large && card.images.large) {
                  target.src = card.images.large;
                } else if (!target.src.startsWith('data:')) {
                  // Create a simple placeholder
                  target.src = `data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="245" height="342" viewBox="0 0 245 342"%3E%3Crect width="245" height="342" fill="%23f3f4f6" rx="12"/%3E%3Ctext x="50%25" y="50%25" font-family="Arial,sans-serif" font-size="14" fill="%239ca3af" text-anchor="middle"%3E${encodeURIComponent(card.name)}%3C/text%3E%3C/svg%3E`;
                }
              }}
            />
            
            {/* Enhanced Shimmer effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 rounded-lg" />
          </div>
          
          {/* Enhanced Price badge with animation */}
          {price > 0 && (
            <div className="absolute top-6 right-6 bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 text-white px-4 py-2 rounded-full text-sm font-black shadow-lg shadow-green-500/50 transform group-hover:scale-110 group-hover:-rotate-6 transition-all duration-300 border-2 border-white">
              ${price.toFixed(2)}
            </div>
          )}
        </div>
        
        {/* Card Info Section - More Dense Like TCGPlayer */}
        <div className="p-4 space-y-2.5 bg-gradient-to-b from-white to-gray-50/30">
          <div>
            <h3 className="font-bold text-gray-900 text-base leading-tight line-clamp-2 mb-1 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-primary-600 group-hover:to-accent-600 group-hover:bg-clip-text transition-all duration-300">
              {card.name}
            </h3>
            <p className="text-gray-500 text-xs font-semibold line-clamp-1">
              {card.set.name}
            </p>
          </div>
          
          {/* Card Number and Release Year */}
          <div className="flex items-center justify-between text-xs">
            {card.number && (
              <span className="text-gray-500 font-semibold">
                #{card.number}
              </span>
            )}
            {card.set.releaseDate && (
              <span className="text-gray-500 font-semibold">
                {new Date(card.set.releaseDate).getFullYear()}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Enhanced Rarity Badge - Compact */}
            {card.rarity && (
              <span className={`inline-flex items-center px-2 py-0.5 bg-gradient-to-r ${getRarityGradient(card.rarity)} text-accent-800 rounded-md text-[10px] font-black shadow-sm border border-accent-200 group-hover:shadow-md transition-shadow uppercase`}>
                {card.rarity}
              </span>
            )}
            
            {/* Type Badge - Compact */}
            {card.types && card.types.slice(0, 1).map((type) => (
              <span
                key={type}
                className="inline-flex items-center px-2 py-0.5 bg-gradient-to-r from-primary-100 to-accent-100 text-primary-800 rounded-md text-[10px] font-black shadow-sm border border-primary-200 group-hover:shadow-md transition-shadow uppercase"
              >
                {type}
              </span>
            ))}
          </div>

          {/* Market Stats - Dense Info */}
          <div className="pt-2.5 border-t border-gray-200 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500 font-bold uppercase">Market</span>
              <span className="text-xs font-black text-green-600">${price.toFixed(2)}</span>
            </div>
            {card.set.printedTotal && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 font-bold uppercase">Set Size</span>
                <span className="text-xs font-semibold text-gray-700">{card.set.printedTotal} cards</span>
              </div>
            )}
          </div>
        </div>

        {/* Enhanced Hover indicator with gradient animation */}
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary-600 via-accent-600 to-pink-600 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left rounded-b-2xl" />
        
        {/* Corner accent */}
        <div className="absolute top-3 left-3 w-3 h-3 border-t-2 border-l-2 border-transparent group-hover:border-primary-400 transition-colors duration-300 rounded-tl-lg" />
        <div className="absolute bottom-3 right-3 w-3 h-3 border-b-2 border-r-2 border-transparent group-hover:border-accent-400 transition-colors duration-300 rounded-br-lg" />
      </div>
    </div>
  );
};