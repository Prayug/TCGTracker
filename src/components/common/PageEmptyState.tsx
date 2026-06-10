import React from 'react';
import { LucideIcon } from 'lucide-react';

interface PageEmptyStateProps {
  icon: LucideIcon;
  title: string;
  message: string;
  action?: React.ReactNode;
}

export const PageEmptyState: React.FC<PageEmptyStateProps> = ({
  icon: Icon,
  title,
  message,
  action,
}) => (
  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-default bg-surface-inset px-6 py-12 text-center">
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-surface-hover">
      <Icon className="h-6 w-6 text-ink-muted" aria-hidden="true" />
    </div>
    <h3 className="text-base font-semibold text-ink-primary">{title}</h3>
    <p className="mt-2 max-w-sm text-sm text-ink-muted">{message}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>
);
