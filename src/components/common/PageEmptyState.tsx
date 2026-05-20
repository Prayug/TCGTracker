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
  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-12 text-center">
    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-white/[0.06]">
      <Icon className="h-7 w-7 text-slate-400" aria-hidden="true" />
    </div>
    <h3 className="text-base font-semibold text-white">{title}</h3>
    <p className="mt-2 max-w-sm text-sm text-slate-400">{message}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>
);
