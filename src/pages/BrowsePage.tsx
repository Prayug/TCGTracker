import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { PokemonCard } from '../types/pokemon';
import { SearchFilters } from '../features/cards/components/SearchAndSort';
import { CardGrid, CardViewMode, ViewModeToggle } from '../features/cards/components/CardGrid';
import { countActiveMarketplaceFilters } from '../utils/marketplaceFilters';
import { FilterSidebar, MarketplaceFilters } from '../features/cards/components/FilterSidebar';
import { LoadingGrid } from '../components/common/LoadingSpinner';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { EmptyState } from '../components/common/EmptyState';
import { useCards, isPokemonCard, isOnePieceCard, getCardPrice } from '../hooks/useCards';
import { useGame } from '../contexts/GameContext';
import { useCardModal } from '../contexts/CardModalContext';
import { PageHeader, PageShell } from '../components/layout/PageShell';
import { markOnboardingStep } from '../components/common/OnboardingChecklist';
import { cn } from '@/lib/utils';

const DEFAULT_FILTERS: MarketplaceFilters = {
  setName: 'all',
  rarity: 'all',
  priceRange: 'all',
  cardType: 'all',
};

export function BrowsePage() {
  const navigate = useNavigate();
  const { isPokemon, isOnePiece } = useGame();
  const { openCard } = useCardModal();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') ?? '';

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [cardViewMode, setCardViewMode] = useState<CardViewMode>('grid');
  const [marketplaceFilters, setMarketplaceFilters] = useState<MarketplaceFilters>(DEFAULT_FILTERS);

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
  } = useCards();

  useEffect(() => {
    setSearchQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    if (searchQuery.trim() && cards.length > 0 && !isLoading) {
      markOnboardingStep('browse');
    }
  }, [searchQuery, cards.length, isLoading]);

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (query) params.set('q', query);
        else params.delete('q');
        return params;
      },
      { replace: true, preventScrollReset: true }
    );
  };

  const handleResetBrowseState = () => {
    handleSearchChange('');
    setFilterBy('all');
    setMarketplaceFilters(DEFAULT_FILTERS);
  };

  const handleAddToCollection = () => {
    navigate('/vault');
  };

  const cardSetOptions = Array.from(new Set(cards.map((card) => card.set.name))).sort();
  const rarityOptions = Array.from(
    new Set(cards.map((card) => card.rarity).filter(Boolean) as string[])
  ).sort();

  const typeOptions = Array.from(
    new Set(
      cards.flatMap((card) => {
        if (isPokemonCard(card)) {
          return card.types && card.types.length > 0 ? card.types : [];
        }
        if (isOnePieceCard(card)) {
          return card.cardColor ? [card.cardColor] : [];
        }
        return [];
      })
    )
  ).sort();

  const cardsWithMarketplaceFilters = cards.filter((card) => {
    if (marketplaceFilters.setName !== 'all' && card.set.name !== marketplaceFilters.setName) {
      return false;
    }
    if (marketplaceFilters.rarity !== 'all' && (card.rarity || '') !== marketplaceFilters.rarity) {
      return false;
    }
    if (marketplaceFilters.cardType !== 'all') {
      if (isPokemonCard(card)) {
        if (!(card.types || []).some((type) => type === marketplaceFilters.cardType)) return false;
      } else if (isOnePieceCard(card)) {
        if (card.cardColor !== marketplaceFilters.cardType) return false;
      }
    }
    if (marketplaceFilters.priceRange !== 'all') {
      const price = getCardPrice(card);
      if (marketplaceFilters.priceRange === '0-10' && !(price >= 0 && price < 10)) return false;
      if (marketplaceFilters.priceRange === '10-50' && !(price >= 10 && price < 50)) return false;
      if (marketplaceFilters.priceRange === '50-150' && !(price >= 50 && price < 150)) return false;
      if (marketplaceFilters.priceRange === '150+' && !(price >= 150)) return false;
    }
    return true;
  });

  const facetChips: { key: keyof MarketplaceFilters; label: string }[] = [];
  if (marketplaceFilters.setName !== 'all') facetChips.push({ key: 'setName', label: marketplaceFilters.setName });
  if (marketplaceFilters.rarity !== 'all') facetChips.push({ key: 'rarity', label: marketplaceFilters.rarity });
  if (marketplaceFilters.cardType !== 'all') facetChips.push({ key: 'cardType', label: marketplaceFilters.cardType });
  if (marketplaceFilters.priceRange !== 'all')
    facetChips.push({ key: 'priceRange', label: `$${marketplaceFilters.priceRange}` });

  const gameLabel = isPokemon ? 'Pokemon' : 'One Piece';

  return (
    <PageShell>
      <PageHeader
        eyebrow="Marketplace"
        title={`Browse ${gameLabel} cards`}
        description="Filter by set, rarity, and price — then open any card for market detail."
      />

      <SearchFilters
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        sortBy={sortBy}
        onSortChange={setSortBy}
        filterBy={filterBy}
        onFilterChange={setFilterBy}
        isLoading={isLoading}
        onOpenAdvancedFilters={() => setMobileFiltersOpen(true)}
        activeFilterCount={countActiveMarketplaceFilters(marketplaceFilters)}
        isOnePiece={isOnePiece}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ViewModeToggle viewMode={cardViewMode} onChange={setCardViewMode} />
      </div>

      {(searchQuery || facetChips.length > 0) && !isLoading && !error && cardsWithMarketplaceFilters.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2" aria-live="polite">
          <p className="text-sm font-semibold text-ink-secondary">
            <span className="font-mono font-bold tabular-nums text-accent">{cardsWithMarketplaceFilters.length}</span>{' '}
            {cardsWithMarketplaceFilters.length === 1 ? 'result' : 'results'}
            {searchQuery && (
              <>
                {' '}for <span className="font-bold text-ink-primary">"{searchQuery}"</span>
              </>
            )}
          </p>
          {filterBy !== 'all' && (
            <span className="badge-gain border px-2.5 py-1 text-xs font-bold uppercase tracking-wider">{filterBy}</span>
          )}
          {facetChips.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMarketplaceFilters({ ...marketplaceFilters, [key]: 'all' })}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-accent bg-accent-muted px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-accent transition-all hover:bg-accent/20"
            >
              {label}
              <span aria-hidden="true" className="ml-1 text-accent">
                ×
              </span>
              <span className="sr-only">Remove {label} filter</span>
            </button>
          ))}
          {facetChips.length > 0 && (
            <button
              type="button"
              onClick={handleResetBrowseState}
              className="cursor-pointer rounded-lg border border-border-default bg-surface-raised px-3 py-1 text-xs font-bold uppercase tracking-wider text-ink-muted transition-all hover:border-accent hover:text-accent"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      <div className="grid min-h-96 min-w-0 gap-5 lg:grid-cols-[minmax(0,270px)_minmax(0,1fr)]">
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
          isOnePiece={isOnePiece}
        />

        <section
          className={cn(
            'min-w-0 rounded-2xl border border-border-subtle bg-surface-raised/40 p-3 sm:p-4',
            cardsWithMarketplaceFilters.length === 0 && !isLoading && 'flex items-center justify-center'
          )}
        >
          {error ? (
            <ErrorMessage message={error} onRetry={refetch} />
          ) : isLoading ? (
            <LoadingGrid />
          ) : cardsWithMarketplaceFilters.length > 0 ? (
            <CardGrid
              cards={cardsWithMarketplaceFilters as PokemonCard[]}
              viewMode={cardViewMode}
              onCardClick={(card) => openCard(card as PokemonCard)}
              onAddToCollection={handleAddToCollection}
              onViewPriceHistory={(card) => openCard(card as PokemonCard)}
            />
          ) : (
            <EmptyState
              hasSearchQuery={!!searchQuery || filterBy !== 'all'}
              onResetFilters={handleResetBrowseState}
              onTrySearch={handleSearchChange}
            />
          )}
        </section>
      </div>
    </PageShell>
  );
}
