import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, onRetry }) => {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 bg-red-50 border border-red-100 rounded-xl flex items-center justify-center mb-5">
        <AlertCircle className="w-7 h-7 text-red-500" />
      </div>

      <h3 className="text-lg font-semibold text-slate-900 mb-2">Something went wrong</h3>

      <p className="text-sm text-slate-500 max-w-sm mb-6">{message}</p>

      {onRetry && (
        <button onClick={onRetry} className="btn-primary">
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
      )}
    </div>
  );
};
