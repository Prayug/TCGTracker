import React from 'react';
import { motion } from 'framer-motion';
import { Search, TrendingUp, Sparkles, ArrowRight, Zap, Target } from 'lucide-react';

interface HeroSectionProps {
  onStartSearch: (query: string) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onStartSearch }) => {
  const [searchValue, setSearchValue] = React.useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      onStartSearch(searchValue);
    }
  };

  const popularSearches = ['Charizard', 'Pikachu', 'Mewtwo', 'Lugia', 'Rayquaza'];

  return (
    <div className="relative min-h-[600px] overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-primary-900 to-accent-900">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1611068813580-c0c21ef1ccc1?q=80&w=2000')] bg-cover bg-center opacity-10 mix-blend-overlay" />
        
        {/* Animated Orbs */}
        <div className="absolute top-20 left-20 w-72 h-72 bg-primary-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob" />
        <div className="absolute top-40 right-20 w-72 h-72 bg-accent-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000" />
        <div className="absolute bottom-20 left-1/2 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000" />
        
        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      {/* Content */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full mb-6"
          >
            <Sparkles className="w-4 h-4 text-yellow-400" />
            <span className="text-white text-sm font-semibold">Live Market Data • Updated Daily</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/20 border border-green-500/30 rounded-full text-green-400 text-xs font-bold">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              LIVE
            </span>
          </motion.div>

          {/* Main Heading */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-5xl md:text-7xl font-black text-white mb-6 leading-tight"
          >
            Your Ultimate
            <br />
            <span className="bg-gradient-to-r from-primary-400 via-accent-400 to-pink-400 bg-clip-text text-transparent">
              Pokemon TCG Hub
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-xl text-gray-300 mb-12 max-w-3xl mx-auto leading-relaxed"
          >
            Track real-time prices, build your collection, open virtual packs, and discover the most valuable Pokemon cards in the market.
          </motion.p>

          {/* Search Bar */}
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            onSubmit={handleSearch}
            className="max-w-3xl mx-auto mb-8"
          >
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary-500 via-accent-500 to-pink-500 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-300" />
              <div className="relative flex items-center bg-white rounded-2xl shadow-2xl overflow-hidden">
                <div className="pl-6 pr-4">
                  <Search className="w-6 h-6 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Search 50,000+ Pokemon cards by name, set, or type..."
                  className="flex-1 py-5 pr-4 bg-transparent text-gray-900 placeholder-gray-500 text-lg font-medium focus:outline-none"
                />
                <button
                  type="submit"
                  className="m-2 px-8 py-3 bg-gradient-to-r from-primary-600 to-accent-600 text-white rounded-xl font-bold hover:from-primary-700 hover:to-accent-700 transition-all duration-300 shadow-lg hover:shadow-xl flex items-center gap-2 group/btn"
                >
                  Search
                  <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </motion.form>

          {/* Popular Searches */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="flex flex-wrap items-center justify-center gap-3"
          >
            <span className="text-gray-400 text-sm font-medium">Popular:</span>
            {popularSearches.map((search) => (
              <button
                key={search}
                onClick={() => onStartSearch(search)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 backdrop-blur-sm border border-white/10 hover:border-white/20 rounded-lg text-white text-sm font-semibold transition-all duration-300 hover:scale-105"
              >
                {search}
              </button>
            ))}
          </motion.div>
        </motion.div>

        {/* Feature Cards */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20"
        >
          <div className="group relative p-6 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl hover:bg-white/10 hover:border-white/20 transition-all duration-300">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-500 to-accent-500 rounded-2xl opacity-0 group-hover:opacity-20 blur transition-opacity" />
            <div className="relative">
              <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-accent-500 rounded-xl flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-white text-xl font-bold mb-2">Live Price Tracking</h3>
              <p className="text-gray-400 leading-relaxed">
                Real-time market prices from TCGPlayer updated daily. Never miss a deal.
              </p>
            </div>
          </div>

          <div className="group relative p-6 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl hover:bg-white/10 hover:border-white/20 transition-all duration-300">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-accent-500 to-pink-500 rounded-2xl opacity-0 group-hover:opacity-20 blur transition-opacity" />
            <div className="relative">
              <div className="w-12 h-12 bg-gradient-to-br from-accent-500 to-pink-500 rounded-xl flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-white text-xl font-bold mb-2">Open Virtual Packs</h3>
              <p className="text-gray-400 leading-relaxed">
                Experience the thrill of opening packs with real card probabilities.
              </p>
            </div>
          </div>

          <div className="group relative p-6 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl hover:bg-white/10 hover:border-white/20 transition-all duration-300">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-pink-500 to-rose-500 rounded-2xl opacity-0 group-hover:opacity-20 blur transition-opacity" />
            <div className="relative">
              <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-rose-500 rounded-xl flex items-center justify-center mb-4">
                <Target className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-white text-xl font-bold mb-2">Collection Manager</h3>
              <p className="text-gray-400 leading-relaxed">
                Track your collection value and profit/loss in real-time.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

