import React, { useState } from 'react';
import { PokemonCard } from './types/pokemon';
import { AppView } from './types/ui';
import { HeroSection } from './components/common/HeroSection';
import { FeaturedCards } from './features/cards/components/FeaturedCards';
import { StatsCounter } from './features/market/components/StatsCounter';
import { QuickCategories } from './features/cards/components/QuickCategories';
import { SearchAndSort } from './features/cards/components/SearchAndSort';
import { CardGrid } from './features/cards/components/CardGrid';
import { InvestmentModal } from './features/market/components/InvestmentModal';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { ErrorMessage } from './components/common/ErrorMessage';
import { EmptyState } from './components/common/EmptyState';
import { PriceTrackingDashboard } from './features/market/components/PriceTrackingDashboard';
import { VaultView } from './features/vault/components/VaultView';
import { PackShop } from './features/packs/components/PackShop';
import { usePokemonCards } from './hooks/usePokemonCards';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';

function App() {
  const [selectedCard, setSelectedCard] = useState<PokemonCard | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentView, setCurrentView] = useState<AppView>('home');

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
      <Header currentView={currentView} onViewChange={setCurrentView} />

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

      <Footer onViewChange={setCurrentView} />

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
