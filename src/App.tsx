import React, { useState } from 'react';
import { Zap, TrendingUp, Vault, Package, Menu, X } from 'lucide-react';
import { PokemonCard } from './types/pokemon';
import { HeroSection } from './components/HeroSection';
import { FeaturedCards } from './components/FeaturedCards';
import { StatsCounter } from './components/StatsCounter';
import { QuickCategories } from './components/QuickCategories';
import { SearchAndSort } from './components/SearchAndSort';
import { CardGrid } from './components/CardGrid';
import { InvestmentModal } from './components/InvestmentModal';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ErrorMessage } from './components/ErrorMessage';
import { EmptyState } from './components/EmptyState';
import { PriceTrackingDashboard } from './components/PriceTrackingDashboard';
import { VaultView } from './components/VaultView';
import { PackShop } from './components/PackShop';
import { usePokemonCards } from './hooks/usePokemonCards';

type AppView = 'home' | 'cards' | 'tracking' | 'vault' | 'packs';

function App() {
  const [selectedCard, setSelectedCard] = useState<PokemonCard | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const {
    cards,
    isLoading,
    error,
    searchQuery,
    sortBy,
    filterBy,
    setSearchQuery,
    setSortBy,
    setFilterBy,
    refetch
  } = usePokemonCards();

  const handleCardClick = (card: PokemonCard) => {
    setSelectedCard(card);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedCard(null);
  };

  const handleHeroSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentView('cards');
  };

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Professional Navigation */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <button
              onClick={() => setCurrentView('home')}
              className="flex items-center space-x-3 group"
            >
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-primary-600 to-accent-600 rounded-xl blur opacity-30 group-hover:opacity-50 transition duration-300" />
                <div className="relative bg-gradient-to-br from-primary-600 to-accent-600 p-2.5 rounded-xl shadow-lg">
                  <Zap className="w-7 h-7 text-white" />
                </div>
              </div>
              <div className="hidden sm:block">
                <h1 className="text-2xl font-black text-gray-900">
                  TCG<span className="text-primary-600">Tracker</span>
                </h1>
                <p className="text-xs text-gray-500 font-semibold -mt-1">Pro Market Tools</p>
              </div>
            </button>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center space-x-1">
              <button
                onClick={() => setCurrentView('home')}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
                  currentView === 'home'
                    ? 'text-primary-600 bg-primary-50'
                    : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Home
              </button>
              <button
                onClick={() => setCurrentView('cards')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
                  currentView === 'cards'
                    ? 'text-primary-600 bg-primary-50'
                    : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Zap className="w-4 h-4" />
                Browse Cards
              </button>
              <button
                onClick={() => setCurrentView('packs')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
                  currentView === 'packs'
                    ? 'text-primary-600 bg-primary-50'
                    : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Package className="w-4 h-4" />
                Pack Opening
              </button>
              <button
                onClick={() => setCurrentView('vault')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
                  currentView === 'vault'
                    ? 'text-primary-600 bg-primary-50'
                    : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Vault className="w-4 h-4" />
                My Collection
              </button>
              <button
                onClick={() => setCurrentView('tracking')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
                  currentView === 'tracking'
                    ? 'text-primary-600 bg-primary-50'
                    : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                Price Tracker
              </button>
            </nav>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="lg:hidden py-4 border-t border-gray-200">
              <nav className="flex flex-col space-y-2">
                <button
                  onClick={() => { setCurrentView('home'); setMobileMenuOpen(false); }}
                  className={`px-4 py-3 rounded-lg font-semibold text-left ${
                    currentView === 'home' ? 'text-primary-600 bg-primary-50' : 'text-gray-700'
                  }`}
                >
                  Home
                </button>
                <button
                  onClick={() => { setCurrentView('cards'); setMobileMenuOpen(false); }}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg font-semibold text-left ${
                    currentView === 'cards' ? 'text-primary-600 bg-primary-50' : 'text-gray-700'
                  }`}
                >
                  <Zap className="w-4 h-4" />
                  Browse Cards
                </button>
                <button
                  onClick={() => { setCurrentView('packs'); setMobileMenuOpen(false); }}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg font-semibold text-left ${
                    currentView === 'packs' ? 'text-primary-600 bg-primary-50' : 'text-gray-700'
                  }`}
                >
                  <Package className="w-4 h-4" />
                  Pack Opening
                </button>
                <button
                  onClick={() => { setCurrentView('vault'); setMobileMenuOpen(false); }}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg font-semibold text-left ${
                    currentView === 'vault' ? 'text-primary-600 bg-primary-50' : 'text-gray-700'
                  }`}
                >
                  <Vault className="w-4 h-4" />
                  My Collection
                </button>
                <button
                  onClick={() => { setCurrentView('tracking'); setMobileMenuOpen(false); }}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg font-semibold text-left ${
                    currentView === 'tracking' ? 'text-primary-600 bg-primary-50' : 'text-gray-700'
                  }`}
                >
                  <TrendingUp className="w-4 h-4" />
                  Price Tracker
                </button>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="relative">
        {currentView === 'home' ? (
          <>
            <HeroSection onStartSearch={handleHeroSearch} />
            <StatsCounter />
            <FeaturedCards onCardClick={handleCardClick} />
            <QuickCategories onCategoryClick={handleHeroSearch} />
          </>
        ) : currentView === 'tracking' ? (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <PriceTrackingDashboard />
          </div>
        ) : currentView === 'vault' ? (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <VaultView />
          </div>
        ) : currentView === 'packs' ? (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <PackShop />
          </div>
        ) : (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <SearchAndSort
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              sortBy={sortBy}
              onSortChange={setSortBy}
              filterBy={filterBy}
              onFilterChange={setFilterBy}
              isLoading={isLoading}
            />

            {/* Enhanced Results Header */}
            {searchQuery && !isLoading && !error && (
              <div className="mb-8 glass rounded-2xl p-6 shadow-xl border animate-slide-up">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-gray-900 mb-3 flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-1.5 h-8 bg-gradient-to-b from-primary-600 to-accent-600 rounded-full" />
                        <span>Search Results</span>
                      </div>
                      <span className="inline-flex items-center px-4 py-1.5 bg-gradient-to-r from-primary-600 to-accent-600 text-white rounded-full text-base font-bold shadow-lg">
                        {cards.length}
                      </span>
                    </h2>
                    <p className="text-gray-600 font-medium text-base">
                      {searchQuery && (
                        <>
                          Showing results for <span className="font-bold text-gray-900 px-2 py-1 bg-gray-100 rounded">"{searchQuery}"</span>
                        </>
                      )}
                      {filterBy !== 'all' && (
                        <>
                          {' '}• <span className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-primary-100 to-accent-100 text-primary-700 rounded-full text-sm font-bold">
                            {filterBy}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Content Area */}
            <div className="min-h-[400px]">
              {error ? (
                <ErrorMessage message={error} onRetry={refetch} />
              ) : isLoading ? (
                <LoadingSpinner />
              ) : cards.length > 0 ? (
                <CardGrid cards={cards} onCardClick={handleCardClick} />
              ) : (
                <EmptyState hasSearchQuery={!!searchQuery} />
              )}
            </div>
          </div>
        )}
      </main>

      {/* Professional Footer */}
      <footer className="relative bg-gray-900 text-white mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-gradient-to-br from-primary-600 to-accent-600 p-2.5 rounded-xl">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-black">TCGTracker</h3>
                  <p className="text-xs text-gray-400">Pro Market Tools</p>
                </div>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed mb-4">
                Your ultimate Pokemon TCG companion. Track prices, manage your collection, and discover the most valuable cards in real-time.
              </p>
              <div className="flex items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 font-semibold">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                  LIVE DATA
                </span>
                <span className="text-gray-500">Updated Daily</span>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-bold text-white mb-4">Quick Links</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <button onClick={() => setCurrentView('cards')} className="text-gray-400 hover:text-white transition-colors">
                    Browse Cards
                  </button>
                </li>
                <li>
                  <button onClick={() => setCurrentView('packs')} className="text-gray-400 hover:text-white transition-colors">
                    Pack Opening
                  </button>
                </li>
                <li>
                  <button onClick={() => setCurrentView('vault')} className="text-gray-400 hover:text-white transition-colors">
                    My Collection
                  </button>
                </li>
                <li>
                  <button onClick={() => setCurrentView('tracking')} className="text-gray-400 hover:text-white transition-colors">
                    Price Tracker
                  </button>
                </li>
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="font-bold text-white mb-4">Data Sources</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href="https://pokemontcg.io/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    Pokemon TCG API
                  </a>
                </li>
                <li>
                  <a
                    href="https://tcgcsv.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    TCGCSV.com
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.tcgplayer.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    TCGPlayer
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="pt-8 border-t border-gray-800">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-400">
              <p>© 2024 TCGTracker. All rights reserved. Built with ❤️ for collectors.</p>
              <div className="flex items-center gap-6">
                <span>52,000+ Cards Tracked</span>
                <span>•</span>
                <span>15,000+ Active Users</span>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Modal */}
      <InvestmentModal
        card={selectedCard}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
}

export default App;