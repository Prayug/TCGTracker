import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { PokemonCard } from '../types/pokemon';
import { SearchFilters, SearchInput } from '../features/cards/components/SearchAndSort';
import { CardGrid, CardViewMode } from '../features/cards/components/CardGrid';
import { BrowseDiscovery } from '../features/cards/components/BrowseDiscovery';
import { countActiveMarketplaceFilters } from '../utils/marketplaceFilters';
import { FilterSidebar, MarketplaceFilters } from '../features/cards/components/FilterSidebar';
import { LoadingGrid } from '../components/common/LoadingSpinner';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { EmptyState } from '../components/common/EmptyState';
import { useCards, isPokemonCard, isOnePieceCard, getCardPrice } from '../hooks/useCards';
import { useGame } from '../contexts/GameContext';
import { useCardModal } from '../contexts/CardModalContext';
import { PageShell } from '../components/layout/PageShell';
import { markOnboardingStep } from '../components/common/OnboardingChecklist';
import { cn } from '@/lib/utils';
import { queryContainsCjk } from '../utils/scriptDetection';

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
  const urlLang = searchParams.get('lang');

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cardViewMode, setCardViewMode] = useState<CardViewMode>('grid');
  const [marketplaceFilters, setMarketplaceFilters] = useState<MarketplaceFilters>(DEFAULT_FILTERS);

  const {
    cards,
    isLoading,
    error,
    searchQuery,
    sortBy,
    filterBy,
    cardLanguage,
    setSearchQuery,
    setSortBy,
    setFilterBy,
    setCardLanguage,
    refetch,
  } = useCards();

  useEffect(() => {
    setSearchQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    if (urlLang === 'ja' || urlLang === 'en') {
      setCardLanguage(urlLang);
    }
  }, [urlLang, setCardLanguage]);

  useEffect(() => {
    if (searchQuery.trim() && cards.length > 0 && !isLoading) {
      markOnboardingStep('browse');
    }
  }, [searchQuery, cards.length, isLoading]);

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    if (queryContainsCjk(query)) {
      setCardLanguage('ja');
    }
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (query) params.set('q', query);
        else params.delete('q');
        if (queryContainsCjk(query)) params.set('lang', 'ja');
        return params;
      },
      { replace: true, preventScrollReset: true }
    );
  };

  const handleCardLanguageChange = (language: 'en' | 'ja') => {
    setCardLanguage(language);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (language === 'ja') params.set('lang', 'ja');
        else params.delete('lang');
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
  if (marketplaceFilters.setName !== 'all')
    facetChips.push({ key: 'setName', label: marketplaceFilters.setName });
  if (marketplaceFilters.rarity !== 'all')
    facetChips.push({ key: 'rarity', label: marketplaceFilters.rarity });
  if (marketplaceFilters.cardType !== 'all')
    facetChips.push({ key: 'cardType', label: marketplaceFilters.cardType });
  if (marketplaceFilters.priceRange !== 'all')
    facetChips.push({ key: 'priceRange', label: `$${marketplaceFilters.priceRange}` });

  const gameLabel = isPokemon ? 'Pokemon' : 'One Piece';
  const hasQuery = !!searchQuery.trim() || filterBy !== 'all';
  const showDiscovery = !hasQuery && !isLoading && !error;
  const backdropThumbs = cards.slice(0, 14);

  return (
    <PageShell className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl border border-border-subtle bg-surface-raised">
        {backdropThumbs.length > 0 && (
          <div aria-hidden className="marquee-container absolute inset-0 opacity-[0.16]">
            <div className="marquee-content h-full" style={{ animationDuration: '45s' }}>
              {[...backdropThumbs, ...backdropThumbs].map((card, i) => (
                <img
                  key={`${card.id}-${i}`}
                  src={card.images.small}
                  alt=""
                  loading="lazy"
                  className="h-48 w-auto shrink-0 rounded-xl object-cover"
                />
              ))}
            </div>
          </div>
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-surface-raised/50 via-surface-raised/85 to-surface-raised"
        />

        <div className="relative z-10 mx-auto max-w-2xl px-6 py-10 text-center sm:px-10 sm:py-14">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-ink-muted">
            {gameLabel} catalog
          </p>
          <h1 className="mt-2 font-display text-[clamp(1.75rem,4vw,3rem)] font-bold tracking-tight text-ink-primary">
            Browse {gameLabel} cards
          </h1>
          <p className="mt-2 text-sm text-ink-secondary sm:text-base">
            Filter by set, rarity, and price across every printed card.
          </p>
          <div className="mt-6">
            <SearchInput
              value={searchQuery}
              onChange={handleSearchChange}
              isLoading={isLoading}
              size="lg"
              placeholder={`Search ${gameLabel} cards…`}
            />
          </div>
        </div>
      </section>

      <SearchFilters
        sortBy={sortBy}
        onSortChange={setSortBy}
        filterBy={filterBy}
        onFilterChange={setFilterBy}
        isLoading={isLoading}
        onOpenAdvancedFilters={() => setFiltersOpen((open) => !open)}
        filtersOpen={filtersOpen}
        activeFilterCount={countActiveMarketplaceFilters(marketplaceFilters)}
        isOnePiece={isOnePiece}
        resultCount={
          !error && hasQuery && cardsWithMarketplaceFilters.length > 0
            ? cardsWithMarketplaceFilters.length
            : undefined
        }
        viewMode={cardViewMode}
        onViewModeChange={setCardViewMode}
        cardLanguage={cardLanguage}
        onCardLanguageChange={isPokemon ? handleCardLanguageChange : undefined}
      />

      {facetChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {facetChips.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMarketplaceFilters({ ...marketplaceFilters, [key]: 'all' })}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-surface-raised px-2.5 py-1 text-xs text-ink-secondary hover:text-ink-primary"
            >
              {label}
              <span aria-hidden="true">×</span>
              <span className="sr-only">Remove {label} filter</span>
            </button>
          ))}
          <button
            type="button"
            onClick={handleResetBrowseState}
            className="cursor-pointer px-2 py-1 text-xs text-ink-muted hover:text-ink-secondary"
          >
            Clear all
          </button>
        </div>
      )}

      <div
        className={cn(
          'grid min-w-0 gap-5',
          filtersOpen && 'lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]'
        )}
      >
        <FilterSidebar
          filters={marketplaceFilters}
          onFiltersChange={setMarketplaceFilters}
          setOptions={cardSetOptions}
          rarityOptions={rarityOptions}
          typeOptions={typeOptions}
          onReset={() => setMarketplaceFilters(DEFAULT_FILTERS)}
          isOpen={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          isOnePiece={isOnePiece}
        />

        <section className="min-w-0">
          {error ? (
            <ErrorMessage message={error} onRetry={refetch} />
          ) : isLoading ? (
            <LoadingGrid />
          ) : showDiscovery ? (
            <BrowseDiscovery isOnePiece={isOnePiece} onTrySearch={handleSearchChange} />
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
              hasSearchQuery={hasQuery}
              onResetFilters={handleResetBrowseState}
              onTrySearch={handleSearchChange}
            />
          )}
        </section>
      </div>
    </PageShell>
  );
}
