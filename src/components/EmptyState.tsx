import React from 'react';
import { Search, Sparkles } from 'lucide-react';

interface EmptyStateProps {
  hasSearchQuery: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ hasSearchQuery }) => {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-scale-in">
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-600 to-accent-600 rounded-full blur-xl opacity-20 animate-pulse" />
        <div className="relative inline-flex items-center justify-center w-28 h-28 bg-gradient-to-br from-primary-100 to-accent-100 rounded-full">
          {hasSearchQuery ? (
            <Search className="w-14 h-14 text-primary-600 animate-bounce" />
          ) : (
            <Sparkles className="w-14 h-14 text-primary-600 animate-pulse" />
          )}
        </div>
      </div>
      
      <h3 className="text-3xl font-black gradient-text mb-4">
        {hasSearchQuery ? 'No Cards Found' : 'Start Your Search'}
      </h3>
      
      <p className="text-gray-600 max-w-md text-lg font-medium mb-8">
        {hasSearchQuery 
          ? 'Try adjusting your search terms or filters to find what you\'re looking for.'
          : 'Enter a Pokemon name in the search box above to discover amazing cards!'
        }
      </p>
      
      {!hasSearchQuery && (
        <div className="flex flex-wrap gap-3 justify-center">
          <span className="px-4 py-2 bg-gradient-to-r from-primary-100 to-accent-100 text-primary-700 rounded-full text-sm font-bold border border-primary-200 shadow-sm">
            Try: Charizard
          </span>
          <span className="px-4 py-2 bg-gradient-to-r from-primary-100 to-accent-100 text-primary-700 rounded-full text-sm font-bold border border-primary-200 shadow-sm">
            Try: Pikachu
          </span>
          <span className="px-4 py-2 bg-gradient-to-r from-primary-100 to-accent-100 text-primary-700 rounded-full text-sm font-bold border border-primary-200 shadow-sm">
            Try: Mewtwo
          </span>
        </div>
      )}
    </div>
  );
};