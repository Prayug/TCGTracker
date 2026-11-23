import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Loading, empty and error states. All three sit on the page's own surface
 * (no cards, no illustrations) and keep the space the content will take, so
 * nothing jumps when data arrives.
 */

export function LoadingRows({
  rows = 4,
  label = 'Loading',
  art = false,
  className,
}: {
  rows?: number;
  label?: string;
  /** Show a card-art placeholder at the start of each row. */
  art?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className={cn('divide-y divide-rule', className)}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5">
          {art ? <span className="skeleton h-11 w-8 shrink-0 rounded-[3px]" /> : null}
          <span className="skeleton h-3.5 rounded-sm" style={{ width: `${46 - (i % 3) * 8}%` }} />
          <span className="skeleton ml-auto h-3.5 w-16 rounded-sm" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function LoadingTiles({
  count = 6,
  label = 'Loading cards',
  className,
}: {
  count?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className={cn('grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-5', className)}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <span className="skeleton block aspect-[63/88] w-full rounded-[4.5%/3.2%]" />
          <span className="skeleton mt-2 block h-3 w-3/4 rounded-sm" />
          <span className="skeleton mt-1.5 block h-3 w-1/3 rounded-sm" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('border-y border-rule py-6', className)}>
      <p className="text-[14px] font-medium text-ink-primary">{title}</p>
      {children ? (
        <div className="mt-1 max-w-[60ch] text-[13px] text-ink-secondary">{children}</div>
      ) : null}
      {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'This didn’t load',
  children,
  onRetry,
  className,
}: {
  title?: string;
  children?: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('border-l-2 border-loss py-2 pl-3', className)}>
      <p className="text-[13.5px] font-medium text-ink-primary">{title}</p>
      {children ? (
        <div className="mt-0.5 max-w-[60ch] text-meta text-ink-muted">{children}</div>
      ) : null}
      {onRetry ? (
        <button type="button" onClick={onRetry} className="btn-secondary mt-2 h-8 text-[12.5px]">
          Try again
        </button>
      ) : null}
    </div>
  );
}
