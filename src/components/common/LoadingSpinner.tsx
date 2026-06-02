import React from 'react';

export const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-emerald-300" />
      <p className="text-sm text-slate-400">Streaming live card market data...</p>
    </div>
  );
};

export const LoadingSkeleton: React.FC = () => {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.05]">
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

export const LoadingGrid: React.FC = () => {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {Array.from({ length: 18 }).map((_, i) => (
        <LoadingSkeleton key={i} />
      ))}
    </div>
  );
};

export const CardSkeleton = LoadingSkeleton;
