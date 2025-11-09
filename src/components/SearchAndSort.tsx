import React, { useState, useEffect } from 'react';
import { Search, SortAsc, Filter } from 'lucide-react';
import { SortOption, FilterOption } from '../types/pokemon';
import { getSortOptions } from '../utils/sorting';

interface SearchAndSortProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  filterBy: FilterOption;
  onFilterChange: (filter: FilterOption) => void;
  isLoading?: boolean;
}

export const SearchAndSort: React.FC<SearchAndSortProps> = ({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  filterBy,
  onFilterChange,
  isLoading = false
}) => {
  const [inputValue, setInputValue] = useState(searchQuery);
  const sortOptions = getSortOptions();
  
  const filterOptions = [
    { value: 'all' as FilterOption, label: 'All Cards' },
    { value: 'undervalued' as FilterOption, label: '💎 Undervalued' },
    { value: 'overvalued' as FilterOption, label: '⚠️ Overvalued' },
    { value: 'low-pop' as FilterOption, label: '🏆 Low Population' },
    { value: 'high-return' as FilterOption, label: '📈 High PSA Returns' },
    { value: 'bullish' as FilterOption, label: '🚀 Bullish Trend' },
  ];

  useEffect(() => {
    setInputValue(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue !== searchQuery) {
        onSearchChange(inputValue);
      }
    }, 500); // Debounce search input

    return () => clearTimeout(timer);
  }, [inputValue, searchQuery, onSearchChange]);

  return (
    <div className="relative mb-8 animate-slide-down">
      {/* Enhanced Glassmorphism background */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 lg:p-8">
        {/* Decorative gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-primary-500/5 via-accent-500/5 to-pink-500/5 rounded-2xl pointer-events-none" />
        
        {/* Animated accent line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-600 via-accent-600 to-pink-600 rounded-t-2xl" />
        
        <div className="relative flex flex-col lg:flex-row gap-4">
          {/* Enhanced Search Input */}
          <div className="flex-1 relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-primary-600 to-accent-600 rounded-xl opacity-0 group-focus-within:opacity-20 blur transition-opacity duration-300" />
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-primary-600 transition-all duration-300 group-focus-within:scale-110 z-10" />
            <input
              type="text"
              placeholder="Search Pokemon cards by name, type, or set..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="relative w-full pl-12 pr-12 py-4 bg-white/90 backdrop-blur-sm border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-300 shadow-sm hover:shadow-lg font-medium text-base placeholder:text-gray-400 group-focus-within:bg-white"
              disabled={isLoading}
            />
            {/* Enhanced Loading indicator */}
            {isLoading && (
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10">
                <div className="relative">
                  <div className="w-5 h-5 border-2 border-primary-200 border-solid rounded-full animate-spin" />
                  <div className="w-5 h-5 border-2 border-transparent border-t-primary-600 border-solid rounded-full animate-spin absolute top-0 left-0" />
                </div>
              </div>
            )}
            {/* Clear button when there's input */}
            {!isLoading && inputValue && (
              <button
                onClick={() => setInputValue('')}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors z-10 bg-gray-100 hover:bg-gray-200 rounded-full p-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Enhanced Filter Dropdown */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-primary-600 to-accent-600 rounded-xl opacity-0 group-focus-within:opacity-20 blur transition-opacity duration-300" />
            <Filter className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none group-focus-within:text-primary-600 transition-all duration-300 group-focus-within:scale-110 z-10" />
            <select
              value={filterBy}
              onChange={(e) => onFilterChange(e.target.value as FilterOption)}
              className="relative pl-12 pr-10 py-4 bg-white/90 backdrop-blur-sm border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 min-w-[200px] appearance-none cursor-pointer transition-all duration-300 shadow-sm hover:shadow-lg font-semibold text-base group-focus-within:bg-white"
              disabled={isLoading}
            >
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {/* Enhanced dropdown arrow */}
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none group-focus-within:rotate-180 transition-transform duration-300 z-10">
              <svg className="w-5 h-5 text-gray-500 group-focus-within:text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Enhanced Sort Dropdown */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-primary-600 to-accent-600 rounded-xl opacity-0 group-focus-within:opacity-20 blur transition-opacity duration-300" />
            <SortAsc className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none group-focus-within:text-primary-600 transition-all duration-300 group-focus-within:scale-110 z-10" />
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className="relative pl-12 pr-10 py-4 bg-white/90 backdrop-blur-sm border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 min-w-[200px] appearance-none cursor-pointer transition-all duration-300 shadow-sm hover:shadow-lg font-semibold text-base group-focus-within:bg-white"
              disabled={isLoading}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {/* Enhanced dropdown arrow */}
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none group-focus-within:rotate-180 transition-transform duration-300 z-10">
              <svg className="w-5 h-5 text-gray-500 group-focus-within:text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
        
        {/* Search tips */}
        {!searchQuery && !isLoading && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 bg-primary-100 text-primary-600 rounded-full text-[10px] font-bold">💡</span>
              <span>Try searching for <span className="font-semibold text-gray-700">Charizard</span>, <span className="font-semibold text-gray-700">Pikachu</span>, or any card name!</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};