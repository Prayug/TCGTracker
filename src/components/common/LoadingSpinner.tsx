import React from 'react';

export const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
      <p className="text-sm text-slate-500">Loading cards...</p>
    </div>
  );
};

export const CardSkeleton: React.FC = () => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="aspect-[63/88] skeleton" />
      <div className="p-3 space-y-2">
        <div className="h-4 skeleton w-3/4 rounded" />
        <div className="h-3 skeleton w-1/2 rounded" />
        <div className="h-3 skeleton w-2/3 rounded mt-2" />
      </div>
    </div>
  );
};

export const LoadingGrid: React.FC = () => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {Array.from({ length: 18 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
};
