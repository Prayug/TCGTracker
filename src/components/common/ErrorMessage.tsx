import React from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, onRetry }) => {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-scale-in">
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-red-500 rounded-full blur-xl opacity-20 animate-pulse" />
        <div className="relative inline-flex items-center justify-center w-28 h-28 bg-gradient-to-br from-red-100 to-rose-100 rounded-full">
          <AlertCircle className="w-14 h-14 text-red-600 animate-bounce" />
        </div>
      </div>
      
      <h3 className="text-3xl font-black text-gray-900 mb-4">
        Oops! Something went wrong
      </h3>
      
      <p className="text-gray-600 mb-8 max-w-md text-lg font-medium px-4">
        {message}
      </p>
      
      {onRetry && (
        <button
          onClick={onRetry}
          className="group flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-primary-600 to-accent-600 text-white rounded-xl hover:from-primary-700 hover:to-accent-700 transition-all duration-300 shadow-lg hover:shadow-xl font-bold text-lg hover:scale-105 active:scale-95"
        >
          <RefreshCcw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
          Try Again
        </button>
      )}
    </div>
  );
};