import React from 'react';
import { LayoutGrid, RotateCcw, Search } from 'lucide-react';

interface EmptyStateProps {
  hasSearchQuery: boolean;
  onResetFilters?: () => void;
  onTrySearch?: (query: string) => void;
}

const suggestions = ['Charizard', 'Pikachu', 'Umbreon'];

export const EmptyState: React.FC<EmptyStateProps> = ({
  hasSearchQuery,
  onResetFilters,
  onTrySearch,
}) => {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-default bg-surface-raised px-6 py-16 text-center">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-border-subtle bg-surface-inset">
        {hasSearchQuery ? (
          <Search className="h-6 w-6 text-ink-muted" aria-hidden="true" />
        ) : (
          <LayoutGrid className="h-6 w-6 text-ink-muted" aria-hidden="true" />
        )}
      </div>

      <h3 className="mb-2 text-lg font-semibold text-ink-primary">
        {hasSearchQuery ? 'No cards found' : 'Search to browse'}
      </h3>

      <p className="mb-6 max-w-sm text-sm text-ink-muted">
        {hasSearchQuery
          ? 'Try a different query or clear your filters.'
          : 'Enter a card name above to get started.'}
      </p>

      {hasSearchQuery && onResetFilters ? (
        <div className="flex flex-col items-center gap-4">
          <button type="button" onClick={onResetFilters} className="btn-secondary">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Clear search and filters
          </button>
          <div className="flex flex-wrap justify-center gap-2">
            <span className="self-center text-xs text-ink-muted">or try:</span>
            {suggestions.map((q) => (
              <button
                type="button"
                key={q}
                onClick={() => onTrySearch?.(q)}
                className="rounded-full bg-accent-muted px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/15"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          {suggestions.map((q) => (
            <button
              type="button"
              key={q}
              onClick={() => onTrySearch?.(q)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                onTrySearch
                  ? 'cursor-pointer bg-accent-muted text-accent transition-colors hover:bg-accent/15'
                  : 'bg-surface-hover text-ink-secondary'
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
