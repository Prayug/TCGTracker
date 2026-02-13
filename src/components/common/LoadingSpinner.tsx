import React from 'react';

export const LoadingSpinner: React.FC = () => {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 py-20"
      role="status"
      aria-live="polite"
    >
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-border-subtle border-t-accent" aria-hidden="true" />
      <p className="text-sm text-ink-muted">Loading&hellip;</p>
    </div>
  );
};

export const LoadingSkeleton: React.FC = () => {
  return (
    <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-raised shadow-card" aria-hidden="true">
      <div className="skeleton aspect-[63/88]" />
      <div className="space-y-2 p-3.5">
        <div className="skeleton h-4 w-4/5 rounded" />
        <div className="skeleton h-3 w-2/3 rounded" />
        <div className="mt-2 flex items-center justify-between">
          <div className="skeleton h-5 w-14 rounded-full" />
          <div className="skeleton h-4 w-10 rounded" />
        </div>
        <div className="skeleton mt-2 h-4 w-1/2 rounded" />
      </div>
    </div>
  );
};

export const ListRowSkeleton: React.FC = () => {
  return (
    <div
      className="flex items-center gap-4 rounded-xl border border-border-subtle bg-surface-raised p-3 shadow-subtle"
      aria-hidden="true"
    >
      <div className="skeleton h-16 w-11 rounded" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-4 w-1/3 rounded" />
        <div className="skeleton h-3 w-1/4 rounded" />
      </div>
      <div className="skeleton h-5 w-16 rounded" />
    </div>
  );
};

export const HeaderSkeleton: React.FC = () => {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="skeleton h-3 w-24 rounded" />
      <div className="skeleton h-8 w-64 rounded" />
      <div className="skeleton h-4 w-96 max-w-full rounded" />
    </div>
  );
};

export const LoadingGrid: React.FC<{ count?: number }> = ({ count = 18 }) => {
  return (
    <div className="stagger-children grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <LoadingSkeleton key={i} />
      ))}
    </div>
  );
};

export const CardSkeleton = LoadingSkeleton;
