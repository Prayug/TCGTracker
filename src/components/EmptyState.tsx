import React from 'react';
import { Search } from 'lucide-react';

interface EmptyStateProps {
  hasSearchQuery: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ hasSearchQuery }) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Search className="w-16 h-16 text-gray-400 mb-4" />
      <h3 className="text-xl font-semibold text-gray-900 mb-2">
        {hasSearchQuery ? 'No cards found' : 'Start searching'}
      </h3>
      <p className="text-gray-600 max-w-md">
        {hasSearchQuery 
          ? 'Try adjusting your search terms or filters to find what you\'re looking for.'
          : 'Enter a Pokemon name in the search box above to discover amazing cards!'
        }
      </p>
    </div>
  );
};