import React from 'react';
import { Search, TrendingUp, BookOpen, Camera } from 'lucide-react';

interface HeroSectionProps {
  onStartSearch: (query: string) => void;
}

const features = [
  {
    icon: <TrendingUp className="w-5 h-5 text-blue-600" />,
    title: 'Real-Time Prices',
    description: 'Market prices from TCGPlayer updated daily across all sets.',
  },
  {
    icon: <BookOpen className="w-5 h-5 text-blue-600" />,
    title: 'Collection Manager',
    description: 'Track your collection value and profit/loss over time.',
  },
  {
    icon: <Camera className="w-5 h-5 text-blue-600" />,
    title: 'Card Scanner',
    description: 'Identify any Pokémon card instantly using your camera or a photo.',
  },
];

const quickSearches = ['Charizard', 'Pikachu', 'Mewtwo', 'Lugia', 'Rayquaza'];

export const HeroSection: React.FC<HeroSectionProps> = ({ onStartSearch }) => {
  const [searchValue, setSearchValue] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      onStartSearch(searchValue.trim());
    }
  };

  return (
    <div className="bg-slate-900">
      {/* Hero content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 tracking-tight">
          Pokémon TCG Market Tracker
        </h1>
        <p className="text-slate-400 text-lg mb-10 max-w-xl mx-auto">
          Search 50,000+ cards, track prices, manage your collection, and identify cards with your camera.
        </p>

        {/* Search */}
        <form onSubmit={handleSubmit} className="mb-6">
          <div className="flex items-center gap-2 bg-white rounded-lg p-1 shadow-lg max-w-xl mx-auto">
            <Search className="w-5 h-5 text-slate-400 ml-3 flex-shrink-0" />
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search by card name, set, or type..."
              className="flex-1 py-2 px-2 text-slate-900 placeholder:text-slate-400 text-sm bg-transparent focus:outline-none"
            />
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors flex-shrink-0"
            >
              Search
            </button>
          </div>
        </form>

        {/* Quick searches */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-slate-500 text-sm">Quick:</span>
          {quickSearches.map((q) => (
            <button
              key={q}
              onClick={() => onStartSearch(q)}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white text-sm rounded-md transition-colors border border-white/10 hover:border-white/20"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Feature strip */}
      <div className="border-t border-slate-800 bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
            {features.map((f) => (
              <div key={f.title} className="flex items-start gap-4 p-6">
                <div className="w-9 h-9 bg-blue-600/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  {f.icon}
                </div>
                <div>
                  <p className="font-semibold text-white text-sm mb-1">{f.title}</p>
                  <p className="text-slate-400 text-sm leading-relaxed">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
