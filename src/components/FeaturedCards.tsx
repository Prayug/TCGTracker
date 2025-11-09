import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Flame, Star, ArrowRight } from 'lucide-react';
import { PokemonCard } from '../types/pokemon';
import { pokemonApi } from '../services/pokemonApi';

interface FeaturedCardsProps {
  onCardClick: (card: PokemonCard) => void;
}

export const FeaturedCards: React.FC<FeaturedCardsProps> = ({ onCardClick }) => {
  const [featuredCards, setFeaturedCards] = useState<PokemonCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchFeatured = async () => {
      try {
        // Fetch some popular Pokemon cards
        const searches = ['Charizard', 'Pikachu', 'Mewtwo'];
        const randomSearch = searches[Math.floor(Math.random() * searches.length)];
        const response = await pokemonApi.searchCards(randomSearch);
        setFeaturedCards(response.slice(0, 6));
      } catch (error) {
        console.error('Error fetching featured cards:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFeatured();
  }, []);

  const getCardPrice = (card: PokemonCard) => {
    return card.marketPrice || pokemonApi.extractCardPrice(card);
  };

  if (isLoading) {
    return (
      <section className="py-16 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse space-y-8">
            <div className="h-10 bg-gray-200 rounded-lg w-64" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-gray-200 rounded-2xl h-80" />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg">
                <Flame className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-3xl md:text-4xl font-black text-gray-900">
                Trending Cards
              </h2>
            </div>
            <p className="text-gray-600 text-lg font-medium">
              Most searched and viewed cards this week
            </p>
          </div>
          <button className="hidden md:flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105">
            View All
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {featuredCards.map((card, index) => {
            const price = getCardPrice(card);
            return (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => onCardClick(card)}
                className="group relative cursor-pointer"
              >
                {/* Card Container */}
                <div className="relative bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 overflow-hidden border-2 border-gray-100 hover:border-primary-300">
                  {/* Trending Badge */}
                  <div className="absolute top-3 left-3 z-10 flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg text-xs font-black shadow-lg">
                    <TrendingUp className="w-3 h-3" />
                    #{index + 1}
                  </div>

                  {/* Card Image */}
                  <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 p-2">
                    <img
                      src={card.images.small}
                      alt={card.name}
                      className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110 group-hover:rotate-3"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>

                  {/* Card Info */}
                  <div className="p-3 bg-gradient-to-b from-white to-gray-50">
                    <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-2 mb-1 group-hover:text-primary-600 transition-colors">
                      {card.name}
                    </h3>
                    <p className="text-xs text-gray-500 font-medium mb-2 line-clamp-1">
                      {card.set.name}
                    </p>
                    
                    {/* Price */}
                    {price > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 font-semibold">Market Price</span>
                        <span className="text-lg font-black text-green-600">
                          ${price.toFixed(2)}
                        </span>
                      </div>
                    )}

                    {/* Rarity Badge */}
                    {card.rarity && (
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-accent-100 to-pink-100 text-accent-800 rounded-full text-xs font-bold">
                          <Star className="w-3 h-3" />
                          {card.rarity}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 border-2 border-primary-500 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Mobile View All Button */}
        <div className="md:hidden mt-8 text-center">
          <button className="inline-flex items-center gap-2 px-8 py-4 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-all duration-300 shadow-lg">
            View All Trending Cards
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
};

