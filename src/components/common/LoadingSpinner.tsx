import React from 'react';
import { Zap } from 'lucide-react';

export const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex flex-col justify-center items-center py-20 space-y-8">
      {/* Main Spinner with enhanced animations */}
      <div className="relative">
        {/* Outer rotating ring */}
        <div className="w-20 h-20 border-4 border-primary-200 border-solid rounded-full animate-spin"></div>
        
        {/* Inner rotating ring with gradient */}
        <div className="w-20 h-20 border-4 border-transparent border-t-primary-600 border-r-accent-600 border-solid rounded-full animate-spin absolute top-0 left-0"></div>
        
        {/* Pulsing center icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary-600 to-accent-600 rounded-full blur opacity-50 animate-pulse" />
            <div className="relative bg-gradient-to-br from-primary-600 to-accent-600 p-2.5 rounded-full">
              <Zap className="w-5 h-5 text-white animate-pulse" />
            </div>
          </div>
        </div>
        
        {/* Orbiting dots */}
        <div className="absolute inset-0 animate-spin" style={{ animationDuration: '2s' }}>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-gradient-to-r from-primary-600 to-accent-600 rounded-full" />
        </div>
        <div className="absolute inset-0 animate-spin" style={{ animationDuration: '2.5s' }}>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-gradient-to-r from-accent-600 to-pink-600 rounded-full" />
        </div>
      </div>
      
      {/* Loading text with animation */}
      <div className="text-center space-y-3">
        <p className="text-lg font-bold gradient-text animate-pulse">
          Fetching Cards in Parallel...
        </p>
        <p className="text-sm text-gray-600 font-medium">
          Loading up to 1,500 cards at lightning speed ⚡
        </p>
        <div className="flex items-center justify-center space-x-2">
          <div className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-accent-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-pink-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
};

// Skeleton Card Loader for grid
export const CardSkeleton: React.FC = () => {
  return (
    <div className="bg-white rounded-2xl shadow-card overflow-hidden border-2 border-gray-100 animate-pulse">
      <div className="bg-gradient-to-br from-gray-200 to-gray-300 aspect-[63/88] skeleton" />
      <div className="p-5 space-y-3">
        <div className="space-y-2">
          <div className="h-5 bg-gray-200 rounded skeleton w-3/4" />
          <div className="h-4 bg-gray-200 rounded skeleton w-1/2" />
        </div>
        <div className="flex gap-2">
          <div className="h-7 bg-gray-200 rounded-full skeleton w-20" />
          <div className="h-7 bg-gray-200 rounded-full skeleton w-16" />
        </div>
      </div>
    </div>
  );
};

// Grid Skeleton Loader
export const LoadingGrid: React.FC = () => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
      {Array.from({ length: 12 }).map((_, index) => (
        <CardSkeleton key={index} />
      ))}
    </div>
  );
};