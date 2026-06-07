import React, { useState, useEffect } from 'react';
import { Filter, Search, Sparkles, X } from 'lucide-react';
import { SortOption, FilterOption } from '../../../types/pokemon';

interface SearchAndSortProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  filterBy: FilterOption;
  onFilterChange: (filter: FilterOption) => void;
  isLoading?: boolean;
  onOpenAdvancedFilters?: () => void;
  activeFilterCount?: number;
}

const FILTER_OPTIONS: { value: FilterOption; label: string }[] = [
  { value: 'all', label: 'All Cards' },
  { value: 'undervalued', label: 'Undervalued' },
  { value: 'overvalued', label: 'Overvalued' },
  { value: 'low-pop', label: 'Low Population' },
  { value: 'high-return', label: 'High PSA Returns' },
  { value: 'bullish', label: 'Bullish Trend' },
];

const FILTER_CHIPS: { value: FilterOption; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'undervalued', label: 'Undervalued' },
  { value: 'low-pop', label: 'Low Population' },
  { value: 'high-return', label: 'High Return' },
  { value: 'bullish', label: 'Bullish' },
];

export const SearchFilters: React.FC<SearchAndSortProps> = ({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  filterBy,
  onFilterChange,
  isLoading = false,
  onOpenAdvancedFilters,
  activeFilterCount = 0,
}) => {
  const [inputValue, setInputValue] = useState(searchQuery);

  useEffect(() => {
    setInputValue(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue !== searchQuery) {
        onSearchChange(inputValue);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [inputValue, searchQuery, onSearchChange]);

  return (
    <section className="sticky top-[4.75rem] z-20 mb-6 w-full min-w-0 max-w-full animate-fade-in rounded-xl border border-border-default bg-surface-raised/95 p-4 shadow-sm ">
      <div className="flex flex-col gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="text"
            placeholder="Search card name, set, or card number..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading}
            className="h-11 w-full rounded-lg border border-border-default bg-surface-inset pl-9 pr-9 text-sm text-ink-primary placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Search cards"
          />
          {isLoading ? (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : inputValue ? (
            <button
              onClick={() => setInputValue('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted transition-colors hover:text-ink-secondary"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenAdvancedFilters}
            className="relative inline-flex items-center gap-2 rounded-lg border border-border-default bg-surface-inset px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-secondary transition-colors hover:bg-surface-hover"
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-emerald-500/25 px-1 text-[10px] font-bold text-emerald-300">
                {activeFilterCount}
              </span>
            )}
          </button>
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            disabled={isLoading}
            className="h-9 min-w-0 flex-1 rounded-lg border border-border-default bg-surface-inset px-3 text-xs font-semibold uppercase tracking-wider text-ink-secondary focus:border-accent focus:outline-none sm:min-w-[140px] sm:flex-none lg:min-w-[160px]"
          >
            <option value="price-high">Sort: Price High</option>
            <option value="price-low">Sort: Price Low</option>
            <option value="name-asc">Sort: Name A-Z</option>
            <option value="name-desc">Sort: Name Z-A</option>
            <option value="date-new">Sort: Newest Set</option>
            <option value="date-old">Sort: Oldest Set</option>
            <option value="rarity">Sort: Rarity</option>
          </select>
          <select
            value={filterBy}
            onChange={(e) => onFilterChange(e.target.value as FilterOption)}
            disabled={isLoading}
            className="h-9 min-w-0 flex-1 rounded-lg border border-border-default bg-surface-inset px-3 text-xs font-semibold uppercase tracking-wider text-ink-secondary focus:border-accent focus:outline-none sm:min-w-[140px] sm:flex-none lg:min-w-[160px]"
          >
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip.value}
            onClick={() => onFilterChange(chip.value)}
            disabled={isLoading}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filterBy === chip.value
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-surface-hover text-ink-secondary hover:bg-surface-hover'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {!searchQuery && !isLoading && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-ink-muted">
          <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
          Try searching for Charizard, Pikachu, Gengar, or your favorite set.
        </p>
      )}
    </section>
  );
};

export const SearchAndSort = SearchFilters;
