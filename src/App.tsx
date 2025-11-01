import React, { useState } from 'react';
import { Zap, TrendingUp, Vault, Package } from 'lucide-react';
import { PokemonCard } from './types/pokemon';
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

type AppView = 'cards' | 'tracking' | 'vault' | 'packs';

function App() {
  const [selectedCard, setSelectedCard] = useState<PokemonCard | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentView, setCurrentView] = useState<AppView>('cards');

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 relative overflow-hidden">
      {/* Animated background shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000" />
        <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000" />
      </div>

      {/* Header */}
      <header className="relative bg-white/70 backdrop-blur-xl border-b border-white/20 sticky top-0 z-20 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl blur opacity-75 animate-pulse" />
                <div className="relative bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 p-3 rounded-2xl shadow-lg">
                  <Zap className="w-8 h-8 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-3xl font-black bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Pokemon TCG Price Tracker
                </h1>
                <p className="text-gray-600 text-sm font-medium">Track real market prices from TCGCSV.com</p>
              </div>
            </div>
            
            {/* Navigation Tabs */}
            <nav className="flex space-x-2 bg-gray-100/80 backdrop-blur-sm p-1.5 rounded-xl shadow-inner">
              <button
                onClick={() => setCurrentView('cards')}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${
                  currentView === 'cards'
                    ? 'bg-white text-blue-600 shadow-lg scale-105'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Card Explorer
                </div>
              </button>
              <button
                onClick={() => setCurrentView('packs')}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${
                  currentView === 'packs'
                    ? 'bg-white text-blue-600 shadow-lg scale-105'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Pack Shop
                </div>
              </button>
              <button
                onClick={() => setCurrentView('vault')}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${
                  currentView === 'vault'
                    ? 'bg-white text-purple-600 shadow-lg scale-105'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Vault className="w-4 h-4" />
                  My Vault
                </div>
              </button>
              <button
                onClick={() => setCurrentView('tracking')}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${
                  currentView === 'tracking'
                    ? 'bg-white text-blue-600 shadow-lg scale-105'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Price Tracking
                </div>
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'tracking' ? (
          <PriceTrackingDashboard />
        ) : currentView === 'vault' ? (
          <VaultView />
        ) : currentView === 'packs' ? (
          <PackShop />
        ) : (
          <>
            <SearchAndSort
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              sortBy={sortBy}
              onSortChange={setSortBy}
              filterBy={filterBy}
              onFilterChange={setFilterBy}
              isLoading={isLoading}
            />

            {/* Results Header */}
            {searchQuery && !isLoading && !error && (
              <div className="mb-8 bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
                <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <span className="inline-block w-1 h-6 bg-gradient-to-b from-blue-600 to-purple-600 rounded-full" />
                  Search Results
                </h2>
                <p className="text-gray-600 font-medium">
                  Found <span className="font-bold text-transparent bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text">{cards.length}</span> cards
                  {searchQuery && (
                    <>
                      {' '}for "<span className="font-semibold text-gray-900">{searchQuery}</span>"
                    </>
                  )}
                  {filterBy !== 'all' && (
                    <>
                      {' '}• <span className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                        {filterBy}
                      </span>
                    </>
                  )}
                </p>
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
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="relative bg-white/70 backdrop-blur-xl border-t border-white/20 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <p className="text-gray-600 font-medium">
              Card data from{' '}
              <a
                href="https://pokemontcg.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-purple-600 font-semibold transition-colors duration-300 hover:underline"
              >
                Pokemon TCG API
              </a>
              {' '}• Price data from{' '}
              <a
                href="https://tcgcsv.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-purple-600 font-semibold transition-colors duration-300 hover:underline"
              >
                TCGCSV.com
              </a>
            </p>
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