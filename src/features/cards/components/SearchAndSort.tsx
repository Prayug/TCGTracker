import React, { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { SortOption, FilterOption } from '../../../types/pokemon';
import { getSortOptions } from '../../../utils/sorting';

interface SearchAndSortProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  filterBy: FilterOption;
  onFilterChange: (filter: FilterOption) => void;
  isLoading?: boolean;
}

const FILTER_OPTIONS: { value: FilterOption; label: string }[] = [
  { value: 'all', label: 'All Cards' },
  { value: 'undervalued', label: 'Undervalued' },
  { value: 'overvalued', label: 'Overvalued' },
  { value: 'low-pop', label: 'Low Population' },
  { value: 'high-return', label: 'High PSA Returns' },
  { value: 'bullish', label: 'Bullish Trend' },
];

export const SearchAndSort: React.FC<SearchAndSortProps> = ({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  filterBy,
  onFilterChange,
  isLoading = false,
}) => {
  const [inputValue, setInputValue] = useState(searchQuery);
  const sortOptions = getSortOptions();

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
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search input */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search Pokémon cards..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading}
            className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                       disabled:bg-slate-50 disabled:cursor-not-allowed transition-colors"
          />
          {isLoading ? (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : inputValue ? (
            <button
              onClick={() => setInputValue('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>

        {/* Filter */}
        <select
          value={filterBy}
          onChange={(e) => onFilterChange(e.target.value as FilterOption)}
          disabled={isLoading}
          className="px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                     disabled:bg-slate-50 disabled:cursor-not-allowed cursor-pointer transition-colors
                     text-slate-700 min-w-[150px]"
        >
          {FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          disabled={isLoading}
          className="px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                     disabled:bg-slate-50 disabled:cursor-not-allowed cursor-pointer transition-colors
                     text-slate-700 min-w-[150px]"
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {!searchQuery && !isLoading && (
        <p className="mt-3 text-xs text-slate-400">
          Try searching for <span className="text-slate-600 font-medium">Charizard</span>,{' '}
          <span className="text-slate-600 font-medium">Pikachu</span>, or any card name.
        </p>
      )}
    </div>
  );
};
