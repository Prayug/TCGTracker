import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageShellProps {
  children: ReactNode;
  className?: string;
  /** Data-dense page: up to 1680px. */
  wide?: boolean;
  /** No max width at all. */
  fluid?: boolean;
  /** Skip horizontal padding (full-bleed compositions). */
  flush?: boolean;
  /** @deprecated kept for call-site compatibility; there is no enter animation. */
  plain?: boolean;
  /** @deprecated ambient glows were removed in the Collector's Exchange redesign. */
  atmosphere?: 'default' | 'subtle';
}

/**
 * Page frame. No entrance animation and no ambient glow: navigation should
 * feel immediate. Width is chosen by task density, not decoration.
 */
export function PageShell({ children, className, wide, fluid, flush }: PageShellProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full',
        !flush && 'px-4 pb-10 pt-5 sm:px-6 sm:pt-7 lg:px-8',
        !fluid && (wide ? 'max-w-[1680px]' : 'max-w-[1280px]'),
        'space-y-8',
        className
      )}
    >
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Inline metadata displayed beside the title baseline (counts, freshness). */
  meta?: ReactNode;
  className?: string;
}

/**
 * Contextual page header: editorial title, one line of purpose, actions on
 * the right, closed by a strong rule. Not a hero.
 */
export function PageHeader({ title, description, actions, meta, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-b border-rule-strong pb-4 sm:flex-row sm:items-end sm:justify-between',
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-display text-h1 text-ink-primary">{title}</h1>
          {meta ? <span className="text-meta text-ink-muted">{meta}</span> : null}
        </div>
        {description ? (
          <p className="max-w-[68ch] text-[13.5px] text-ink-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

interface StatBlockProps {
  label: string;
  value: ReactNode;
  hint?: string;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

/** A figure on a hairline, not in a box. Use in rows separated by dividers. */
export function StatBlock({ label, value, hint, trend, className }: StatBlockProps) {
  return (
    <div className={cn('min-w-0 space-y-1 border-t border-rule pt-2.5', className)}>
      <p className="text-meta text-ink-muted">{label}</p>
      <p
        className={cn(
          'font-mono text-[22px] font-medium tabular-nums tracking-[-0.02em]',
          trend === 'up' && 'text-gain',
          trend === 'down' && 'text-loss',
          (!trend || trend === 'neutral') && 'text-ink-primary'
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-meta text-ink-muted">{hint}</p> : null}
    </div>
  );
}

interface FilterBarProps {
  children: ReactNode;
  className?: string;
}

export function FilterBar({ children, className }: FilterBarProps) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>;
}

interface FilterChipProps {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

/** Filter token. The one place a pill shape is used. */
export function FilterChip({ active, children, onClick, className }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-8 cursor-pointer rounded-full border px-3 text-[13px] font-medium transition-colors duration-100',
        active
          ? 'border-ink-primary bg-ink-primary text-surface-base'
          : 'border-border-strong text-ink-secondary hover:border-ink-muted hover:text-ink-primary',
        className
      )}
    >
      {children}
    </button>
  );
}
