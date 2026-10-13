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
  <div className="flex flex-col items-center justify-center rounded-xl border border-border-subtle px-6 py-14 text-center">
    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised shadow-[inset_0_0_0_1px_var(--border-default)]">
      <Icon className="h-[18px] w-[18px] text-ink-secondary" aria-hidden="true" />
    </div>
    <h3 className="text-[15px] font-medium text-ink-primary">{title}</h3>
    <p className="mt-1 max-w-sm text-[13px] text-ink-muted">{message}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>
);
