import React, { useState } from 'react';
import { Zap } from 'lucide-react';
import { PokemonCard } from './types/pokemon';
import { SearchAndSort } from './components/SearchAndSort';
import { CardGrid } from './components/CardGrid';
import { CardModal } from './components/CardModal';
import { InvestmentModal } from './components/InvestmentModal';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ErrorMessage } from './components/ErrorMessage';
import { EmptyState } from './components/EmptyState';
import { usePokemonCards } from './hooks/usePokemonCards';

function App() {
  const [selectedCard, setSelectedCard] = useState<PokemonCard | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'basic' | 'investment'>('basic');

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
    setModalType(card.investmentData ? 'investment' : 'basic');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedCard(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-center">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-2 rounded-xl">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Pokemon TCG Investment Tracker
                </h1>
                <p className="text-gray-600 text-sm">Discover undervalued cards with PSA population data</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Investment Opportunities
            </h2>
            <p className="text-gray-600">
              Found <span className="font-semibold text-blue-600">{cards.length}</span> cards
              {searchQuery && (
                <>
                  {' '}for "<span className="font-semibold">{searchQuery}</span>"
                </>
              )}
              {filterBy !== 'all' && (
                <>
                  {' '}• Filtered by <span className="font-semibold">{filterBy}</span>
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
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <p className="text-gray-600">
              Data provided by{' '}
              <a
                href="https://pokemontcg.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Pokemon TCG API
              </a>
              {' '}• PSA population data simulated for demonstration
            </p>
          </div>
        </div>
      </footer>

      {/* Modals */}
      {modalType === 'investment' ? (
        <InvestmentModal
          card={selectedCard}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
        />
      ) : (
        <CardModal
          card={selectedCard}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}

export default App;