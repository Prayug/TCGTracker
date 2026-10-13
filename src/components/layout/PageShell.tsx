import { ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/hooks/useMotionPreferences';

interface PageShellProps {
  children: ReactNode;
  className?: string;
  /** Wider shell for dense dashboards */
  wide?: boolean;
  /** Use full main-column width (no max-width cap) — for dense grids */
  fluid?: boolean;
  /** Skip horizontal padding (hero full-bleed) */
  flush?: boolean;
  /** Skip the zoom-in stage enter (rare) */
  plain?: boolean;
  /** Soften the ambient glow (portfolio / dense tables) */
  atmosphere?: 'default' | 'subtle';
}

export function PageShell({
  children,
  className,
  wide,
  fluid,
  flush,
  plain,
  atmosphere = 'default',
}: PageShellProps) {
  const reduced = usePrefersReducedMotion();
  const glow =
    atmosphere === 'subtle'
      ? 'bg-[radial-gradient(ellipse_at_50%_0%,rgba(110,231,183,0.02),transparent_42%)]'
      : 'bg-[radial-gradient(ellipse_at_50%_0%,rgba(110,231,183,0.035),transparent_46%)]';

  return (
    <div className="relative isolate min-h-[calc(100dvh-3.5rem)]">
      <div aria-hidden className={`pointer-events-none absolute inset-0 -z-10 ${glow}`} />

      <motion.div
        // Route changes happen dozens of times a session, so the enter is a
        // short fade with a few pixels of lift, not a zoom.
        initial={plain || reduced ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
        className={cn(
          'mx-auto w-full',
          !flush && 'px-4 py-6 sm:px-6 sm:py-8 lg:px-8',
          !flush && !fluid && (wide ? 'max-w-7xl' : 'max-w-6xl'),
          fluid && 'max-w-none',
          'space-y-8',
          className
        )}
      >
        {children}
      </motion.div>
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
  className?: string;
}

export function PageHeader({ title, description, actions, eyebrow, className }: PageHeaderProps) {
  return (
    <div
      className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}
    >
      <div className="min-w-0 space-y-2">
        {eyebrow ? (
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-h1 text-ink-primary">{title}</h1>
        {description ? <p className="max-w-2xl text-sm text-ink-secondary">{description}</p> : null}
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

export function StatBlock({ label, value, hint, trend, className }: StatBlockProps) {
  return (
    <div className={cn('card-chrome space-y-1.5', className)}>
      <p className="text-xs text-ink-muted">{label}</p>
      <p
        className={cn(
          'font-mono text-2xl font-medium tabular-nums tracking-[-0.03em]',
          trend === 'up' && 'text-gain',
          trend === 'down' && 'text-loss',
          !trend && 'text-ink-primary'
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
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

export function FilterChip({ active, children, onClick, className }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-8 cursor-pointer rounded-full px-3 text-[13px] font-medium',
        'transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.97]',
        active
          ? 'bg-ink-primary text-surface-base'
          : 'text-ink-secondary shadow-[inset_0_0_0_1px_var(--border-default)] hover:bg-surface-hover hover:text-ink-primary',
        className
      )}
    >
      {children}
    </button>
  );
}
