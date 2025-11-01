import React, { useState, useEffect } from 'react';
import { Search, SortAsc, Filter, Globe } from 'lucide-react';
import { SortOption, FilterOption } from '../types/pokemon';
import { getSortOptions } from '../utils/sorting';

interface SearchAndSortProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  filterBy: FilterOption;
  onFilterChange: (filter: FilterOption) => void;
  language?: string;
  onLanguageChange?: (language: string) => void;
  isLoading?: boolean;
}

export const SearchAndSort: React.FC<SearchAndSortProps> = ({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  filterBy,
  onFilterChange,
  language = 'en',
  onLanguageChange,
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
  
  const languageOptions = [
    { value: 'en', label: '🇺🇸 English' },
    { value: 'ja', label: '🇯🇵 Japanese' },
    { value: 'ko', label: '🇰🇷 Korean' },
    { value: 'zh-TW', label: '🇹🇼 Chinese (Traditional)' },
    { value: 'zh-CN', label: '🇨🇳 Chinese (Simplified)' },
    { value: 'fr', label: '🇫🇷 French' },
    { value: 'de', label: '🇩🇪 German' },
    { value: 'it', label: '🇮🇹 Italian' },
    { value: 'pt', label: '🇧🇷 Portuguese' },
    { value: 'es', label: '🇪🇸 Spanish' },
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
    <div className="relative mb-8">
      {/* Glassmorphism background */}
      <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 p-6 sticky top-20 z-10">
        {/* Decorative gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 rounded-2xl" />
        
        <div className="relative flex flex-col lg:flex-row gap-4">
          {/* Search Input */}
          <div className="flex-1 relative group">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-blue-600 transition-colors duration-300" />
            <input
              type="text"
              placeholder="Search Pokemon cards..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 shadow-sm hover:shadow-md font-medium"
              disabled={isLoading}
            />
            {/* Loading indicator */}
            {isLoading && (
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Language Dropdown */}
          {onLanguageChange && (
            <div className="relative group">
              <Globe className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none group-focus-within:text-blue-600 transition-colors duration-300" />
              <select
                value={language}
                onChange={(e) => onLanguageChange(e.target.value)}
                className="pl-12 pr-10 py-3.5 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[180px] appearance-none cursor-pointer transition-all duration-300 shadow-sm hover:shadow-md font-medium"
                disabled={isLoading}
              >
                {languageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {/* Custom dropdown arrow */}
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          )}

          {/* Filter Dropdown */}
          <div className="relative group">
            <Filter className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none group-focus-within:text-blue-600 transition-colors duration-300" />
            <select
              value={filterBy}
              onChange={(e) => onFilterChange(e.target.value as FilterOption)}
              className="pl-12 pr-10 py-3.5 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[180px] appearance-none cursor-pointer transition-all duration-300 shadow-sm hover:shadow-md font-medium"
              disabled={isLoading}
            >
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {/* Custom dropdown arrow */}
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Sort Dropdown */}
          <div className="relative group">
            <SortAsc className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none group-focus-within:text-blue-600 transition-colors duration-300" />
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className="pl-12 pr-10 py-3.5 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[200px] appearance-none cursor-pointer transition-all duration-300 shadow-sm hover:shadow-md font-medium"
              disabled={isLoading}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {/* Custom dropdown arrow */}
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};