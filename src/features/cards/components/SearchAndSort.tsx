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
    <section className="sticky top-[4.75rem] z-20 mb-6 animate-fade-in rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
      <div className="flex flex-col gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search card name, set, or card number..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading}
            className="h-11 w-full rounded-xl border border-white/15 bg-[#0f1624] pl-9 pr-9 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Search cards"
          />
          {isLoading ? (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : inputValue ? (
            <button
              onClick={() => setInputValue('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-300"
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
            className="relative inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200 transition-colors hover:bg-white/[0.1]"
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
            className="h-9 min-w-[180px] rounded-lg border border-white/15 bg-[#0f1624] px-3 text-xs font-semibold uppercase tracking-wider text-slate-200 focus:border-emerald-400 focus:outline-none"
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
            className="h-9 min-w-[180px] rounded-lg border border-white/15 bg-[#0f1624] px-3 text-xs font-semibold uppercase tracking-wider text-slate-200 focus:border-emerald-400 focus:outline-none"
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
                : 'bg-white/[0.06] text-slate-300 hover:bg-white/[0.12]'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {!searchQuery && !isLoading && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-400">
          <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
          Try searching for Charizard, Pikachu, Gengar, or your favorite set.
        </p>
      )}
    </section>
  );
};

export const SearchAndSort = SearchFilters;
