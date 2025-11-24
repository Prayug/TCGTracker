import React from 'react';
import { motion } from 'framer-motion';
import { Flame, Star, TrendingUp, Zap, Target, Sparkles, Crown, Award } from 'lucide-react';

interface QuickCategoriesProps {
  onCategoryClick: (category: string) => void;
}

export const QuickCategories: React.FC<QuickCategoriesProps> = ({ onCategoryClick }) => {
  const categories = [
    {
      icon: <Flame className="w-6 h-6" />,
      title: 'Most Valuable',
      description: 'Cards worth $100+',
      gradient: 'from-orange-500 to-red-500',
      query: 'Charizard'
    },
    {
      icon: <Star className="w-6 h-6" />,
      title: 'Rare Holos',
      description: 'Holographic cards',
      gradient: 'from-purple-500 to-pink-500',
      query: 'rare holo'
    },
    {
      icon: <TrendingUp className="w-6 h-6" />,
      title: 'Trending Now',
      description: 'Hot in the market',
      gradient: 'from-green-500 to-emerald-500',
      query: 'Pikachu'
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: 'First Edition',
      description: 'Limited releases',
      gradient: 'from-yellow-500 to-orange-500',
      query: 'first edition'
    },
    {
      icon: <Crown className="w-6 h-6" />,
      title: 'Legendary',
      description: 'Legendary Pokemon',
      gradient: 'from-blue-500 to-primary-600',
      query: 'Mewtwo'
    },
    {
      icon: <Award className="w-6 h-6" />,
      title: 'Vintage',
      description: 'Classic sets',
      gradient: 'from-indigo-500 to-accent-600',
      query: 'Base Set'
    },
    {
      icon: <Target className="w-6 h-6" />,
      title: 'Modern',
      description: 'Latest releases',
      gradient: 'from-cyan-500 to-blue-500',
      query: 'Scarlet Violet'
    },
    {
      icon: <Sparkles className="w-6 h-6" />,
      title: 'Full Art',
      description: 'Premium cards',
      gradient: 'from-pink-500 to-rose-500',
      query: 'full art'
    }
  ];

  return (
    <section className="py-20 bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-4">
            Explore Collections
          </h2>
          <p className="text-xl text-gray-600 font-medium">
            Discover cards by category and rarity
          </p>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {categories.map((category, index) => (
            <motion.button
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onCategoryClick(category.query)}
              className="group relative bg-white rounded-2xl p-6 shadow-md hover:shadow-xl transition-all duration-300 border-2 border-gray-100 hover:border-primary-200 text-left"
            >
              {/* Gradient Background on Hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${category.gradient} rounded-2xl opacity-0 group-hover:opacity-5 transition-opacity`} />
              
              {/* Content */}
              <div className="relative">
                <div className={`w-12 h-12 bg-gradient-to-br ${category.gradient} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                  <div className="text-white">
                    {category.icon}
                  </div>
                </div>
                
                <h3 className="font-black text-gray-900 text-lg mb-1 group-hover:text-primary-600 transition-colors">
                  {category.title}
                </h3>
                
                <p className="text-sm text-gray-600 font-medium">
                  {category.description}
                </p>
              </div>

              {/* Hover Arrow */}
              <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
};

