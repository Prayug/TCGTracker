import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatCurrency, formatPercent } from '../../utils/cardDisplay';
import { cn } from '@/lib/utils';

type PriceSize = 'xl' | 'lg' | 'md' | 'sm';

const SIZE: Record<PriceSize, string> = {
  xl: 'text-[40px] leading-none tracking-[-0.03em]',
  lg: 'text-[28px] leading-none tracking-[-0.025em]',
  md: 'text-[17px] leading-tight tracking-[-0.01em]',
  sm: 'text-[13.5px] leading-tight',
};

/**
 * A price. Always mono + tabular so figures align and read as data.
 * `null`/`undefined`/non-positive renders an explicit unavailable mark
 * instead of "$0.00" — a missing price is not a zero price.
 */
export function Price({
  value,
  size = 'md',
  className,
  unavailableLabel = 'No price',
  allowZero = false,
}: {
  value: number | null | undefined;
  size?: PriceSize;
  className?: string;
  unavailableLabel?: string;
  allowZero?: boolean;
}) {
  const ok = value != null && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0);
  if (!ok) {
    return (
      <span
        className={cn(
          'font-mono text-ink-muted',
          size === 'sm' ? 'text-[12.5px]' : 'text-[13px]',
          className
        )}
        title="Price unavailable"
      >
        {unavailableLabel}
      </span>
    );
  }
  // Split cents so large figures stay legible: $1,344.25 → $1,344 + .25
  const formatted = formatCurrency(value as number);
  const [whole, cents] = formatted.split('.');
  return (
    <span
      className={cn('font-mono font-medium tabular-nums text-ink-primary', SIZE[size], className)}
    >
      {whole}
      {cents ? (
        <span
          className={cn(
            size === 'xl' || size === 'lg' ? 'text-[0.55em] align-[0.6em] text-ink-secondary' : ''
          )}
        >
          .{cents}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Signed movement. Colour + sign + arrow, so it never relies on red/green
 * alone. `period` is mandatory context: a change without a window is noise.
 */
export function Delta({
  pct,
  amount,
  period,
  className,
  size = 'sm',
}: {
  pct: number | null | undefined;
  amount?: number | null;
  period?: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  if (pct == null || !Number.isFinite(pct)) {
    return <span className={cn('font-mono text-[12.5px] text-ink-muted', className)}>—</span>;
  }
  const flat = Math.abs(pct) < 0.05;
  const up = pct > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-mono tabular-nums',
        size === 'md' ? 'text-[14px]' : 'text-[12.5px]',
        flat ? 'text-ink-secondary' : up ? 'text-gain' : 'text-loss',
        className
      )}
    >
      <Icon className={size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'} aria-hidden strokeWidth={2} />
      {amount != null && Number.isFinite(amount)
        ? `${formatCurrency(amount, { signed: true })} · `
        : ''}
      {formatPercent(pct, { signed: true })}
      {period ? <span className="ml-1 font-sans text-ink-muted">{period}</span> : null}
    </span>
  );
}

/**
 * Provenance line: what kind of number this is, where it came from, and when.
 * e.g. "Market estimate · TCGplayer Holofoil · Near Mint · Oct 31"
 */
export function Basis({
  kind,
  source,
  detail,
  asOf,
  stale,
  className,
}: {
  kind:
    | 'Market estimate'
    | 'Asking price'
    | 'Last sold'
    | 'Sold average'
    | 'Historical'
    | 'Forecast'
    | 'Your cost'
    | string;
  source?: string | null;
  detail?: string | null;
  asOf?: string | number | Date | null;
  stale?: boolean;
  className?: string;
}) {
  const date = asOf != null ? new Date(asOf) : null;
  const dateLabel =
    date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
        })
      : null;
  const parts = [kind, source, detail].filter(Boolean) as string[];
  return (
    <p className={cn('text-meta text-ink-muted', className)}>
      {parts.join(' · ')}
      {dateLabel ? (
        <>
          {' · '}
          <span
            className={stale ? 'font-medium text-warn' : undefined}
            title={stale ? 'No newer data available' : undefined}
          >
            {stale ? `stale, last ${dateLabel}` : `as of ${dateLabel}`}
          </span>
        </>
      ) : null}
    </p>
  );
}

/** A designed "not available" state. Explains why, optionally offers a next step. */
export function Unavailable({
  title,
  children,
  action,
  className,
  compact = false,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn('border-l-2 border-border-strong pl-3', compact ? 'py-1' : 'py-2', className)}
      role="note"
    >
      <p className="text-[13.5px] font-medium text-ink-secondary">{title}</p>
      {children ? (
        <div className="mt-0.5 max-w-[60ch] text-meta text-ink-muted">{children}</div>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
