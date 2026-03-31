import React from 'react';
import { PokemonCard as PokemonCardType } from '../../../types/pokemon';
import { pokemonApi } from '../../../services/pokemonApi';

interface PokemonCardProps {
  card: PokemonCardType;
  onClick: () => void;
}

const RARITY_COLORS: Record<string, string> = {
  common: 'bg-slate-100 text-slate-600',
  uncommon: 'bg-green-50 text-green-700',
  rare: 'bg-blue-50 text-blue-700',
  'rare holo': 'bg-violet-50 text-violet-700',
  'rare ultra': 'bg-amber-50 text-amber-700',
  'rare secret': 'bg-rose-50 text-rose-700',
};

function getRarityStyle(rarity?: string): string {
  if (!rarity) return 'bg-slate-100 text-slate-600';
  const key = rarity.toLowerCase();
  return RARITY_COLORS[key] || (
    key.includes('secret') ? 'bg-rose-50 text-rose-700' :
    key.includes('ultra') ? 'bg-amber-50 text-amber-700' :
    key.includes('holo') ? 'bg-violet-50 text-violet-700' :
    key.includes('rare') ? 'bg-blue-50 text-blue-700' :
    'bg-slate-100 text-slate-600'
  );
}

export const PokemonCard: React.FC<PokemonCardProps> = ({ card, onClick }) => {
  const price = card.marketPrice ?? pokemonApi.extractCardPrice(card);

  return (
    <div
      className="group bg-white border border-slate-200 rounded-xl overflow-hidden cursor-pointer
                 hover:border-slate-300 hover:shadow-card-hover transition-all duration-200"
      onClick={onClick}
    >
      {/* Card image */}
      <div className="relative bg-slate-50 aspect-[63/88] overflow-hidden">
        <img
          src={card.images.small}
          alt={card.name}
          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            if (card.images.large && target.src !== card.images.large) {
              target.src = card.images.large;
            } else {
              target.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='245' height='342' viewBox='0 0 245 342'%3E%3Crect width='245' height='342' fill='%23f1f5f9' rx='8'/%3E%3Ctext x='50%25' y='50%25' font-family='Inter,sans-serif' font-size='13' fill='%2394a3b8' text-anchor='middle' dominant-baseline='middle'%3E${encodeURIComponent(card.name)}%3C/text%3E%3C/svg%3E`;
            }
          }}
        />

        {/* Price tag */}
        {price > 0 && (
          <div className="absolute top-2 right-2 px-2 py-0.5 bg-white/90 backdrop-blur-sm
                          border border-slate-200 rounded-md text-xs font-semibold text-emerald-700 shadow-sm">
            ${price.toFixed(2)}
          </div>
        )}
      </div>

      {/* Card info */}
      <div className="px-3 py-2.5 space-y-1.5">
        <div>
          <p className="font-semibold text-slate-900 text-sm leading-tight truncate" title={card.name}>
            {card.name}
          </p>
          <p className="text-xs text-slate-500 truncate">{card.set.name}</p>
        </div>

        <div className="flex items-center justify-between gap-2">
          {/* Rarity badge */}
          {card.rarity && (
            <span className={`badge text-[10px] font-medium ${getRarityStyle(card.rarity)}`}>
              {card.rarity}
            </span>
          )}

          {/* Card number */}
          {card.number && (
            <span className="text-[10px] text-slate-400 font-mono ml-auto">
              #{card.number}
            </span>
          )}
        </div>

        {/* Market price row */}
        <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Market</span>
          <span className={`text-xs font-semibold ${price > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
            {price > 0 ? `$${price.toFixed(2)}` : 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
};
