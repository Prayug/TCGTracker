import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, onRetry }) => {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-rose-300/30 bg-rose-500/10">
        <AlertCircle className="w-7 h-7 text-red-500" />
      </div>

      <h3 className="mb-2 text-lg font-semibold text-slate-100">Something went wrong</h3>

      <p className="mb-6 max-w-sm text-sm text-slate-400">{message}</p>

      {onRetry && (
        <button onClick={onRetry} className="btn-primary">
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
      )}
    </div>
  );
};
