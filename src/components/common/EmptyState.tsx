import React from 'react';
import { Search, LayoutGrid } from 'lucide-react';

interface EmptyStateProps {
  hasSearchQuery: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ hasSearchQuery }) => {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 bg-slate-100 rounded-xl flex items-center justify-center mb-5">
        {hasSearchQuery ? (
          <Search className="w-7 h-7 text-slate-400" />
        ) : (
          <LayoutGrid className="w-7 h-7 text-slate-400" />
        )}
      </div>

      <h3 className="text-lg font-semibold text-slate-900 mb-2">
        {hasSearchQuery ? 'No cards found' : 'Start searching'}
      </h3>

      <p className="text-sm text-slate-500 max-w-sm mb-6">
        {hasSearchQuery
          ? 'Try different search terms or remove the active filter.'
          : 'Type a Pokémon name in the search box above to find cards.'}
      </p>

      {!hasSearchQuery && (
        <div className="flex flex-wrap gap-2 justify-center">
          {['Charizard', 'Pikachu', 'Mewtwo'].map((q) => (
            <span
              key={q}
              className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium"
            >
              {q}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
