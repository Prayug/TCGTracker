import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, onRetry }) => {
  return (
    <div
      className="mx-auto flex max-w-sm flex-col items-center justify-center py-16 text-center"
      role="alert"
      aria-live="assertive"
    >
      <AlertCircle className="mb-3 h-5 w-5 text-loss" aria-hidden="true" />

      <h3 className="text-[15px] font-medium text-ink-primary">Something went wrong</h3>

      <p className="mt-1 text-[13px] text-ink-muted">{message}</p>

      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary mt-5 h-8 px-3 text-[13px]">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
};
