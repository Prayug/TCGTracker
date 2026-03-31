import { useState } from 'react';
import { PokemonCard } from './types/pokemon';
import { AppView } from './types/ui';
import { HeroSection } from './components/common/HeroSection';
import { SearchAndSort } from './features/cards/components/SearchAndSort';
import { CardGrid } from './features/cards/components/CardGrid';
import { InvestmentModal } from './features/market/components/InvestmentModal';
import { LoadingGrid } from './components/common/LoadingSpinner';
import { ErrorMessage } from './components/common/ErrorMessage';
import { EmptyState } from './components/common/EmptyState';
import { PriceTrackingDashboard } from './features/market/components/PriceTrackingDashboard';
import { VaultView } from './features/vault/components/VaultView';
import { PackShop } from './features/packs/components/PackShop';
import { CardScanner } from './features/scanner/components/CardScanner';
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
    refetch,
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
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header currentView={currentView} onViewChange={setCurrentView} />

      <main className="flex-1">
        {currentView === 'home' ? (
          <HeroSection onStartSearch={handleHeroSearch} />
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
        ) : currentView === 'scanner' ? (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <CardScanner />
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

            {searchQuery && !isLoading && !error && cards.length > 0 && (
              <div className="flex items-center gap-2 mb-4">
                <p className="text-sm text-slate-600">
                  <span className="font-medium text-slate-900">{cards.length}</span> results for{' '}
                  <span className="font-medium text-slate-900">"{searchQuery}"</span>
                </p>
                {filterBy !== 'all' && (
                  <span className="badge bg-blue-50 text-blue-700">{filterBy}</span>
                )}
              </div>
            )}

            <div className="min-h-96">
              {error ? (
                <ErrorMessage message={error} onRetry={refetch} />
              ) : isLoading ? (
                <LoadingGrid />
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

      <InvestmentModal
        card={selectedCard}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
}

export default App;
