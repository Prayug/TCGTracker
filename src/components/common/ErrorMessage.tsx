import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, onRetry }) => {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center" role="alert" aria-live="assertive">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-loss/30 bg-loss-muted">
        <AlertCircle className="h-7 w-7 text-loss" aria-hidden="true" />
      </div>

      <h3 className="mb-2 text-lg font-semibold text-ink-primary">Something went wrong</h3>

      <p className="mb-6 max-w-sm text-sm text-ink-muted">{message}</p>

      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-primary">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
};
