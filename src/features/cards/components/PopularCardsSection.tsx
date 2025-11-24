import React from 'react';
import { motion } from 'framer-motion';
import { Flame, TrendingUp, Star, Zap } from 'lucide-react';

interface PopularCardsSectionProps {
  onSearch: (query: string) => void;
}

export const PopularCardsSection: React.FC<PopularCardsSectionProps> = ({ onSearch }) => {
  const popularCards = [
    {
      name: 'Charizard',
      description: 'Iconic fire-type legendary',
      price: '$150-500',
      rarity: 'Rare Holo',
      gradient: 'from-red-500 to-orange-500',
      query: 'Charizard'
    },
    {
      name: 'Pikachu',
      description: 'The original electric mouse',
      price: '$50-200',
      rarity: 'Rare Holo',
      gradient: 'from-yellow-500 to-orange-500',
      query: 'Pikachu'
    },
    {
      name: 'Mewtwo',
      description: 'Powerful psychic legendary',
      price: '$80-300',
      rarity: 'Rare Holo',
      gradient: 'from-purple-500 to-pink-500',
      query: 'Mewtwo'
    },
    {
      name: 'Lugia',
      description: 'Guardian of the seas',
      price: '$60-250',
      rarity: 'Rare Holo',
      gradient: 'from-blue-500 to-cyan-500',
      query: 'Lugia'
    },
    {
      name: 'Rayquaza',
      description: 'Sky high dragon',
      price: '$70-350',
      rarity: 'Rare Holo',
      gradient: 'from-green-500 to-teal-500',
      query: 'Rayquaza'
    },
    {
      name: 'Eevee',
      description: 'The evolution Pokemon',
      price: '$30-150',
      rarity: 'Rare Holo',
      gradient: 'from-brown-500 to-yellow-500',
      query: 'Eevee'
    }
  ];

  return (
    <section className="py-16 bg-gradient-to-b from-white to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-gradient-to-br from-red-500 to-orange-500 rounded-xl">
              <Flame className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900">
              Popular Cards
            </h2>
          </div>
          <p className="text-xl text-gray-600 font-medium">
            Most sought-after Pokemon cards in the market
          </p>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {popularCards.map((card, index) => (
            <motion.button
              key={card.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSearch(card.query)}
              className="group relative bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border-2 border-gray-100 hover:border-primary-200 overflow-hidden"
            >
              {/* Gradient Background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 group-hover:opacity-5 transition-opacity`} />

              {/* Content */}
              <div className="relative p-6">
                {/* Card Name & Icon */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-2xl font-black text-gray-900 mb-1 group-hover:text-primary-600 transition-colors">
                      {card.name}
                    </h3>
                    <p className="text-gray-600 font-medium text-sm">
                      {card.description}
                    </p>
                  </div>
                  <div className="p-2 bg-gray-100 rounded-lg group-hover:bg-primary-100 transition-colors">
                    <Star className="w-5 h-5 text-gray-600 group-hover:text-primary-600 transition-colors" />
                  </div>
                </div>

                {/* Price Range */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-semibold text-gray-700">Market Value</span>
                  </div>
                  <span className="text-lg font-black text-green-600">
                    {card.price}
                  </span>
                </div>

                {/* Rarity Badge */}
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-accent-100 to-pink-100 text-accent-800 rounded-lg text-sm font-bold">
                    <Zap className="w-4 h-4" />
                    {card.rarity}
                  </span>
                  <span className="text-sm font-semibold text-gray-500 group-hover:text-primary-600 transition-colors">
                    Search →
                  </span>
                </div>
              </div>

              {/* Hover Border Effect */}
              <div className="absolute inset-0 border-2 border-primary-500 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            </motion.button>
          ))}
        </div>

        {/* Call to Action */}
        <div className="text-center mt-12">
          <button
            onClick={() => onSearch('')}
            className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-primary-600 to-accent-600 text-white rounded-xl font-bold hover:from-primary-700 hover:to-accent-700 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
          >
            Explore All Cards
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
};
