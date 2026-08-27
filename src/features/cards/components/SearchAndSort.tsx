import React, { useState, useEffect } from 'react';
import { Filter, Search, X } from 'lucide-react';
import { SortOption, FilterOption } from '../../../types/pokemon';
import { OnePieceSortOption } from '../../../types/onepiece';
import { ViewModeToggle, type ViewMode } from '../../../components/common/ViewModeToggle';

interface SearchAndSortProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: SortOption | OnePieceSortOption;
  onSortChange: (sort: SortOption | OnePieceSortOption) => void;
  filterBy: FilterOption;
  onFilterChange: (filter: FilterOption) => void;
  isLoading?: boolean;
  onOpenAdvancedFilters?: () => void;
  filtersOpen?: boolean;
  activeFilterCount?: number;
  isOnePiece?: boolean;
  resultCount?: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  cardLanguage?: 'en' | 'ja';
  onCardLanguageChange?: (language: 'en' | 'ja') => void;
}

const FILTER_CHIPS: { value: FilterOption; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'undervalued', label: 'Undervalued' },
  { value: 'low-pop', label: 'Low Pop' },
  { value: 'high-return', label: 'High Return' },
  { value: 'bullish', label: 'Bullish' },
];

const SORT_LABELS: Record<string, string> = {
  'price-high': 'Price: High',
  'price-low': 'Price: Low',
  'name-asc': 'Name A–Z',
  'name-desc': 'Name Z–A',
  'set-asc': 'Set A–Z',
  'set-desc': 'Set Z–A',
  'date-new': 'Newest Set',
  'date-old': 'Oldest Set',
  rarity: 'Rarity',
};

export const SearchFilters: React.FC<SearchAndSortProps> = ({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  filterBy,
  onFilterChange,
  isLoading = false,
  onOpenAdvancedFilters,
  filtersOpen = false,
  activeFilterCount = 0,
  isOnePiece = false,
  resultCount,
  viewMode,
  onViewModeChange,
  cardLanguage = 'en',
  onCardLanguageChange,
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
    <section className="sticky top-14 z-30 w-full min-w-0 max-w-full animate-fade-in bg-surface-base/90 py-2 backdrop-blur-md">
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="text"
            placeholder="Search cards..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading}
            className="h-9 w-full rounded-lg bg-surface-raised pl-9 pr-9 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Search cards"
          />
          {isLoading ? (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-ink-muted border-t-transparent" />
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

        <div className="flex flex-wrap items-center gap-2">
          {!isOnePiece && onCardLanguageChange && (
            <div
              className="inline-flex h-8 overflow-hidden rounded-lg bg-surface-raised p-0.5"
              role="group"
              aria-label="Card language"
            >
              {(['en', 'ja'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => onCardLanguageChange(lang)}
                  aria-pressed={cardLanguage === lang}
                  className={`rounded-md px-2.5 text-xs font-medium transition-colors ${
                    cardLanguage === lang
                      ? 'bg-accent/15 text-accent'
                      : 'text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  {lang === 'en' ? 'EN' : 'JP'}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={onOpenAdvancedFilters}
            aria-pressed={filtersOpen}
            className={`relative inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors ${
              filtersOpen
                ? 'bg-accent/15 text-accent'
                : 'bg-surface-raised text-ink-secondary hover:bg-surface-hover'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-gain-muted px-1 text-[10px] font-bold text-gain">
                {activeFilterCount}
              </span>
            )}
          </button>
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortOption | OnePieceSortOption)}
            disabled={isLoading}
            className="h-8 min-w-0 rounded-lg bg-surface-raised px-2.5 text-xs font-medium text-ink-secondary focus:outline-none sm:min-w-[8.5rem]"
            aria-label="Sort cards"
          >
            <option value="price-high">{SORT_LABELS['price-high']}</option>
            <option value="price-low">{SORT_LABELS['price-low']}</option>
            <option value="name-asc">{SORT_LABELS['name-asc']}</option>
            <option value="name-desc">{SORT_LABELS['name-desc']}</option>
            {isOnePiece && (
              <>
                <option value="set-asc">{SORT_LABELS['set-asc']}</option>
                <option value="set-desc">{SORT_LABELS['set-desc']}</option>
              </>
            )}
            <option value="date-new">{SORT_LABELS['date-new']}</option>
            <option value="date-old">{SORT_LABELS['date-old']}</option>
            <option value="rarity">{SORT_LABELS.rarity}</option>
          </select>
          {typeof resultCount === 'number' && !isLoading && (
            <p className="text-xs tabular-nums text-ink-muted">
              {resultCount.toLocaleString()} {resultCount === 1 ? 'result' : 'results'}
            </p>
          )}
          <div className="ml-auto">
            <ViewModeToggle viewMode={viewMode} onChange={onViewModeChange} compact />
          </div>
        </div>
      </div>

      {!isOnePiece && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.value}
              onClick={() => onFilterChange(chip.value)}
              disabled={isLoading}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                filterBy === chip.value
                  ? 'bg-gain-muted text-gain'
                  : 'text-ink-secondary hover:bg-surface-hover'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

export const SearchAndSort = SearchFilters;
