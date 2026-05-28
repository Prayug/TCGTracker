import { useState } from 'react';
import { PokemonCard } from './types/pokemon';
import { AppView } from './types/ui';
import { HeroSection } from './components/common/HeroSection';
import { SearchFilters } from './features/cards/components/SearchAndSort';
import { CardGrid, CardViewMode, ViewModeToggle } from './features/cards/components/CardGrid';
import { countActiveMarketplaceFilters } from './utils/marketplaceFilters';
import { SectionLabel } from './components/common/SectionLabel';
import { FilterSidebar, MarketplaceFilters } from './features/cards/components/FilterSidebar';
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
import { pokemonApi } from './services/pokemonApi';

function App() {
  const pageContainerClass = 'mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8';
  const [selectedCard, setSelectedCard] = useState<PokemonCard | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [cardViewMode, setCardViewMode] = useState<CardViewMode>('grid');
  const [marketplaceFilters, setMarketplaceFilters] = useState<MarketplaceFilters>({
    setName: 'all',
    rarity: 'all',
    priceRange: 'all',
    cardType: 'all',
  });

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

  const handleResetBrowseState = () => {
    setSearchQuery('');
    setFilterBy('all');
    setMarketplaceFilters({
      setName: 'all',
      rarity: 'all',
      priceRange: 'all',
      cardType: 'all',
    });
  };

  const handleAddToCollection = (card: PokemonCard) => {
    setSelectedCard(card);
    setCurrentView('vault');
  };

  const handleViewPriceHistory = (card: PokemonCard) => {
    handleCardClick(card);
  };

  const cardSetOptions = Array.from(new Set(cards.map((card) => card.set.name))).sort();
  const rarityOptions = Array.from(new Set(cards.map((card) => card.rarity).filter(Boolean) as string[])).sort();
  const typeOptions = Array.from(
    new Set(cards.flatMap((card) => (card.types && card.types.length > 0 ? card.types : [])))
  ).sort();

  const cardsWithMarketplaceFilters = cards.filter((card) => {
    if (marketplaceFilters.setName !== 'all' && card.set.name !== marketplaceFilters.setName) {
      return false;
    }

    if (marketplaceFilters.rarity !== 'all' && (card.rarity || '') !== marketplaceFilters.rarity) {
      return false;
    }

    if (
      marketplaceFilters.cardType !== 'all' &&
      !(card.types || []).some((type) => type === marketplaceFilters.cardType)
    ) {
      return false;
    }

    if (marketplaceFilters.priceRange !== 'all') {
      const price = card.marketPrice ?? pokemonApi.extractCardPrice(card);
      if (marketplaceFilters.priceRange === '0-10' && !(price >= 0 && price < 10)) return false;
      if (marketplaceFilters.priceRange === '10-50' && !(price >= 10 && price < 50)) return false;
      if (marketplaceFilters.priceRange === '50-150' && !(price >= 50 && price < 150)) return false;
      if (marketplaceFilters.priceRange === '150+' && !(price >= 150)) return false;
    }

    return true;
  });

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0f17] text-slate-100">
      <Header currentView={currentView} onViewChange={setCurrentView} />

      <main className="flex-1">
        {currentView === 'home' ? (
          <HeroSection onStartSearch={handleHeroSearch} onViewChange={setCurrentView} />
        ) : currentView === 'tracking' ? (
          <div className={pageContainerClass}>
            <PriceTrackingDashboard />
          </div>
        ) : currentView === 'vault' ? (
          <div className={pageContainerClass}>
            <VaultView />
          </div>
        ) : currentView === 'packs' ? (
          <div className={pageContainerClass}>
            <PackShop />
          </div>
        ) : currentView === 'scanner' ? (
          <div className={pageContainerClass}>
            <CardScanner />
          </div>
        ) : (
          <div className={pageContainerClass}>
            <section className="mb-6 rounded-xl border border-white/10 bg-[linear-gradient(120deg,#161525,#0f1828_42%,#1f1533)] p-4 text-white">
              <SectionLabel className="text-violet-300/90">Marketplace</SectionLabel>
              <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">Browse Pokemon Cards</h1>
                  <p className="mt-1 text-sm text-slate-300">
                    Analyze cards with marketplace filters, pricing surfaces, and collection actions.
                  </p>
                </div>
              </div>
            </section>

            <SearchFilters
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              sortBy={sortBy}
              onSortChange={setSortBy}
              filterBy={filterBy}
              onFilterChange={setFilterBy}
              isLoading={isLoading}
              onOpenAdvancedFilters={() => setMobileFiltersOpen(true)}
              activeFilterCount={countActiveMarketplaceFilters(marketplaceFilters)}
            />

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <ViewModeToggle viewMode={cardViewMode} onChange={setCardViewMode} />
            </div>

            {searchQuery && !isLoading && !error && cardsWithMarketplaceFilters.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <p className="text-sm text-slate-300">
                  <span className="font-medium text-white">{cardsWithMarketplaceFilters.length}</span> results for{' '}
                  <span className="font-medium text-white">"{searchQuery}"</span>
                </p>
                {filterBy !== 'all' && (
                  <span className="badge rounded-full bg-emerald-500/20 px-2.5 py-1 text-emerald-300">{filterBy}</span>
                )}
              </div>
            )}

            <div className="grid min-h-96 gap-5 lg:grid-cols-[270px_1fr]">
              <FilterSidebar
                filters={marketplaceFilters}
                onFiltersChange={setMarketplaceFilters}
                sortBy={sortBy}
                onSortChange={setSortBy}
                setOptions={cardSetOptions}
                rarityOptions={rarityOptions}
                typeOptions={typeOptions}
                onReset={handleResetBrowseState}
                isMobileOpen={mobileFiltersOpen}
                onCloseMobile={() => setMobileFiltersOpen(false)}
              />

              <section>
              {error ? (
                <ErrorMessage message={error} onRetry={refetch} />
              ) : isLoading ? (
                <LoadingGrid />
              ) : cardsWithMarketplaceFilters.length > 0 ? (
                  <CardGrid
                    cards={cardsWithMarketplaceFilters}
                    viewMode={cardViewMode}
                    onCardClick={handleCardClick}
                    onAddToCollection={handleAddToCollection}
                    onViewPriceHistory={handleViewPriceHistory}
                  />
              ) : (
                <EmptyState
                    hasSearchQuery={!!searchQuery || filterBy !== 'all'}
                  onResetFilters={handleResetBrowseState}
                  onTrySearch={handleHeroSearch}
                />
              )}
              </section>
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
