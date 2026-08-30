import React from 'react';
import { RotateCcw, Search } from 'lucide-react';

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
    <div className="rounded-lg border border-dashed border-border-default bg-surface-raised px-5 py-8">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full border border-border-subtle bg-surface-inset">
        <Search className="h-4 w-4 text-ink-muted" aria-hidden="true" />
      </div>

      <h3 className="mb-1 text-sm font-semibold text-ink-primary">
        {hasSearchQuery ? 'No cards found' : 'Search to browse'}
      </h3>

      <p className="mb-4 max-w-sm text-sm text-ink-muted">
        {hasSearchQuery
          ? 'Try a different query or clear your filters.'
          : 'Enter a card name above to get started.'}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {hasSearchQuery && onResetFilters ? (
          <button type="button" onClick={onResetFilters} className="btn-secondary h-8 text-xs">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Clear search and filters
          </button>
        ) : null}
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
  );
};
