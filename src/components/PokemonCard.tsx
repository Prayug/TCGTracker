import React from 'react';
import { PokemonCard as PokemonCardType } from '../types/pokemon';
import { pokemonApi } from '../services/pokemonApi';
import { InvestmentBadge } from './InvestmentBadge';
import { TrendingUp, Award, Target } from 'lucide-react';

interface PokemonCardProps {
  card: PokemonCardType;
  onClick: () => void;
}

export const PokemonCard: React.FC<PokemonCardProps> = ({ card, onClick }) => {
  const price = pokemonApi.extractCardPrice(card);
  const hasInvestmentData = !!card.investmentData;

  return (
    <div 
      className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer transform hover:scale-105 overflow-hidden group relative"
      onClick={onClick}
    >
      {/* Investment Score Badge */}
      {hasInvestmentData && (
        <div className="absolute top-2 left-2 z-10">
          <div className="bg-purple-600 text-white px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
            <Target className="w-3 h-3" />
            {card.investmentData.investmentScore}
          </div>
        </div>
      )}

      {/* Recommendation Badge */}
      {hasInvestmentData && card.investmentData.recommendation === 'BUY' && (
        <div className="absolute top-2 right-2 z-10">
          <div className="bg-green-600 text-white px-2 py-1 rounded-full text-xs font-bold">
            🚀 BUY
          </div>
        </div>
      )}

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

        {/* Investment Data */}
        {hasInvestmentData && (
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1">
                <Award className="w-3 h-3 text-orange-500" />
                <span className="text-gray-600">PSA 10:</span>
                <span className="font-semibold">
                  {card.investmentData.psaData.population.grade10.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-blue-500" />
                <span className={`font-semibold ${
                  card.investmentData.marketAnalysis.trend === 'BULLISH' ? 'text-green-600' :
                  card.investmentData.marketAnalysis.trend === 'BEARISH' ? 'text-red-600' :
                  'text-gray-600'
                }`}>
                  {card.investmentData.marketAnalysis.trend}
                </span>
              </div>
            </div>

            {/* Quick Investment Indicators */}
            <div className="flex gap-1 flex-wrap">
              {card.investmentData.marketAnalysis.isUndervalued && (
                <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                  💎 Undervalued
                </span>
              )}
              {card.investmentData.psaData.popReport.lowPop && (
                <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                  🏆 Low Pop
                </span>
              )}
              {card.investmentData.psaData.returnRate > 60 && (
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                  📈 High Return
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};