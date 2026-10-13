import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface InlineNoticeProps {
  children: ReactNode;
  tone?: 'error' | 'info';
  className?: string;
}

/**
 * A one-line status message inside a page. Deliberately quiet: a colored dot
 * carries the tone so a failed request doesn't paint the page red.
 */
export function InlineNotice({ children, tone = 'error', className }: InlineNoticeProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-center gap-2.5 rounded-[10px] border border-border-subtle bg-surface-raised px-3.5 py-2.5 text-[13px] text-ink-secondary',
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          tone === 'error' ? 'bg-loss shadow-[0_0_8px_var(--loss)]' : 'bg-foil'
        )}
      />
      <span className="min-w-0">{children}</span>
    </div>
  );
}
