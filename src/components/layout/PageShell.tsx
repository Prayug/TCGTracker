import { ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/hooks/useMotionPreferences';

interface PageShellProps {
  children: ReactNode;
  className?: string;
  /** Wider shell for dense dashboards */
  wide?: boolean;
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
  flush,
  plain,
  atmosphere = 'default',
}: PageShellProps) {
  const reduced = usePrefersReducedMotion();
  const glow =
    atmosphere === 'subtle'
      ? 'bg-[radial-gradient(ellipse_at_50%_0%,rgba(110,231,183,0.045),transparent_38%),radial-gradient(ellipse_at_85%_12%,rgba(91,196,212,0.03),transparent_32%)]'
      : 'bg-[radial-gradient(ellipse_at_50%_0%,rgba(110,231,183,0.1),transparent_48%),radial-gradient(ellipse_at_90%_20%,rgba(91,196,212,0.07),transparent_42%),radial-gradient(ellipse_at_10%_80%,rgba(110,231,183,0.05),transparent_40%)]';

  return (
    <div className="relative isolate min-h-[calc(100dvh-3.5rem)]">
      <div aria-hidden className={`pointer-events-none absolute inset-0 -z-10 ${glow}`} />

      <motion.div
        initial={plain || reduced ? false : { opacity: 0, scale: 0.94, filter: 'blur(10px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{
          duration: 0.55,
          ease: [0.16, 1, 0.3, 1],
          // Blur cannot go negative — the bezier overshoots, so tween it separately.
          filter: { duration: 0.45, ease: 'easeOut' },
        }}
        style={{ transformOrigin: '50% 8%' }}
        className={cn(
          'mx-auto w-full',
          !flush && 'px-4 py-6 sm:px-6 sm:py-8 lg:px-8',
          !flush && (wide ? 'max-w-7xl' : 'max-w-6xl'),
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
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        className
      )}
    >
      <div className="min-w-0 space-y-2">
        {eyebrow ? (
          <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-foil">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow-accent" aria-hidden />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-h1 tracking-tight text-ink-primary sm:text-[clamp(2rem,4vw,3.25rem)]">
          {title}
        </h1>
        {description ? <p className="max-w-2xl text-sm text-ink-secondary sm:text-base">{description}</p> : null}
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
    <div className={cn('card-chrome space-y-2 rounded-2xl', className)}>
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-muted">{label}</p>
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
        'flex flex-wrap items-center gap-2 rounded-xl border border-border-subtle bg-surface-raised/60 p-2 sm:p-2.5',
        className
      )}
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
        'cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200',
        active
          ? 'bg-accent/15 text-accent'
          : 'text-ink-secondary hover:bg-surface-hover hover:text-ink-primary',
        className
      )}
    >
      {children}
    </button>
  );
}
