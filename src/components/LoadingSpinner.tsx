import React from 'react';

export const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex justify-center items-center py-12">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-blue-200 border-solid rounded-full animate-spin"></div>
        <div className="w-16 h-16 border-4 border-blue-600 border-solid rounded-full border-t-transparent animate-spin absolute top-0 left-0"></div>
      </div>
    </div>
  );
};