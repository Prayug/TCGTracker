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
  /** Skip the page-turn enter (rare) */
  plain?: boolean;
  /** Soften the ambient glow (portfolio / dense tables) */
  atmosphere?: 'default' | 'subtle';
  /** Wrap children in a binder paper sheet with ring rail */
  binderPage?: boolean;
}

export function PageShell({
  children,
  className,
  wide,
  fluid,
  flush,
  plain,
  atmosphere = 'default',
  binderPage = true,
}: PageShellProps) {
  const reduced = usePrefersReducedMotion();
  const glow =
    atmosphere === 'subtle'
      ? 'bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,244,220,0.04),transparent_42%)]'
      : 'bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,244,220,0.08),transparent_55%)]';

  const inner = (
    <motion.div
      initial={plain || reduced ? false : { opacity: 0, rotateY: -10, x: 14 }}
      animate={{ opacity: 1, rotateY: 0, x: 0 }}
      transition={{
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
      }}
      style={{ transformOrigin: 'left center', transformStyle: 'preserve-3d' }}
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
  );

  return (
    <div className="relative isolate min-h-[calc(100dvh-3.5rem)]">
      <div aria-hidden className={`pointer-events-none absolute inset-0 -z-10 ${glow}`} />

      {binderPage && !flush ? (
        <div className="mx-auto w-full px-3 pb-6 pt-4 sm:px-5 lg:px-6">
          <div
            className={cn(
              'binder-page binder-page-rail animate-page-turn',
              wide || fluid ? 'max-w-none' : 'mx-auto max-w-6xl',
              wide && 'max-w-7xl mx-auto'
            )}
          >
            {inner}
          </div>
        </div>
      ) : (
        inner
      )}
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
        {eyebrow ? <p className="text-xs font-medium text-ink-muted">{eyebrow}</p> : null}
        <h1 className="font-display text-h1 tracking-tight text-ink-primary sm:text-[clamp(2rem,4vw,3.25rem)]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm text-ink-secondary sm:text-base">{description}</p>
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

export function StatBlock({ label, value, hint, trend, className }: StatBlockProps) {
  return (
    <div className={cn('card-chrome space-y-2', className)}>
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p
        className={cn(
          'font-mono text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl',
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
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 border border-border-page bg-sleeve/70 p-2 sm:p-2.5',
        className
      )}
      style={{ borderRadius: 'var(--radius-ui)' }}
    >
      {children}
    </div>
  );
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
        'cursor-pointer px-3 py-1.5 text-sm font-medium transition-colors duration-200',
        active
          ? 'bg-foil/15 text-ink-primary'
          : 'text-ink-secondary hover:bg-surface-hover hover:text-ink-primary',
        className
      )}
      style={{ borderRadius: 'var(--radius-ui)' }}
    >
      {children}
    </button>
  );
}
