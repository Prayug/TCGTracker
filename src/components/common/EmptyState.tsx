import React from 'react';
import { LayoutGrid, RotateCcw, Search } from 'lucide-react';

interface EmptyStateProps {
  hasSearchQuery: boolean;
  onResetFilters?: () => void;
  onTrySearch?: (query: string) => void;
}

const suggestions = ['Charizard', 'Pikachu', 'Umbreon'];

export const EmptyState: React.FC<EmptyStateProps> = ({ hasSearchQuery, onResetFilters, onTrySearch }) => {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/[0.04] px-6 py-16 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06]">
        {hasSearchQuery ? (
          <Search className="h-7 w-7 text-slate-400" />
        ) : (
          <LayoutGrid className="h-7 w-7 text-slate-400" />
        )}
      </div>

      <h3 className="mb-2 text-lg font-semibold text-white">
        {hasSearchQuery ? 'No cards found' : 'Start searching'}
      </h3>

      <p className="mb-6 max-w-sm text-sm text-slate-400">
        {hasSearchQuery
          ? 'No cards match this query and filter combination. Try broadening your search.'
          : 'Use the search bar above to begin browsing cards across sets and rarities.'}
      </p>

      {hasSearchQuery && onResetFilters ? (
        <button
          onClick={onResetFilters}
          className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/[0.06] px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.1]"
        >
          <RotateCcw className="h-4 w-4" />
          Clear search and filters
        </button>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          {suggestions.map((q) => (
            <button
              type="button"
              key={q}
              onClick={() => onTrySearch?.(q)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                onTrySearch
                  ? 'cursor-pointer bg-emerald-400/15 text-emerald-300 transition-colors hover:bg-emerald-400/25'
                  : 'bg-white/[0.06] text-slate-300'
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
