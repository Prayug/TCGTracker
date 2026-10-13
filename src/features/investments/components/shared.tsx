import { AlertTriangle, Eye, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { LiquidityTier } from '../types';

export function formatUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n >= 1000
    ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : `$${n.toFixed(2)}`;
}

export function ChangeBadge({ pct, abs }: { pct: number | null; abs?: number | null }) {
  if (pct == null) return <span className="text-xs text-ink-muted">—</span>;
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold ${
        up ? 'border-gain/30 bg-gain-muted text-gain' : 'border-loss/30 bg-loss-muted text-loss'
      }`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}
      {pct.toFixed(1)}%
      {abs != null && (
        <span className="font-normal opacity-80">
          ({abs >= 0 ? '+' : '−'}${Math.abs(abs).toFixed(0)})
        </span>
      )}
    </span>
  );
}

const LIQUIDITY_STYLES: Record<LiquidityTier, string> = {
  strong: 'border-gain/30 bg-gain-muted text-gain',
  ok: 'border-foil/30 bg-foil-muted text-foil',
  thin: 'border-neon-amber/30 bg-accent-muted text-neon-amber',
  illiquid: 'border-loss/30 bg-loss-muted text-loss',
};

const LIQUIDITY_LABELS: Record<LiquidityTier, string> = {
  strong: 'Liquid',
  ok: 'Tradeable',
  thin: 'Thin',
  illiquid: 'Illiquid',
};

export function LiquidityBadge({ tier, score }: { tier: LiquidityTier; score?: number }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${LIQUIDITY_STYLES[tier]}`}
      title={score != null ? `Liquidity score ${score}/100` : undefined}
    >
      {LIQUIDITY_LABELS[tier]}
    </span>
  );
}

export function StaleBadge() {
  return (
    <span
      className="inline-flex items-center rounded-full border border-border-subtle px-1.5 py-0.5 text-[10px] text-ink-muted"
      title="Price quote is more than 12 hours old"
    >
      stale
    </span>
  );
}

export function SentimentChip({ value }: { value: number | null }) {
  if (value == null) return null;
  const label = value > 0.15 ? 'Positive' : value < -0.15 ? 'Negative' : 'Neutral';
  const cls =
    value > 0.15
      ? 'border-gain/30 bg-gain-muted text-gain'
      : value < -0.15
        ? 'border-loss/30 bg-loss-muted text-loss'
        : 'border-border-subtle bg-surface-inset text-ink-muted';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
      title={`Net external sentiment ${value.toFixed(2)}`}
    >
      {label}
    </span>
  );
}

export function CardThumb({
  imageSmall,
  name,
}: {
  imageSmall: string | null;
  name: string | null;
}) {
  if (!imageSmall) {
    return (
      <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-surface-inset text-[9px] text-ink-muted">
        {(name ?? '?').slice(0, 2)}
      </div>
    );
  }
  return (
    <img
      src={imageSmall}
      alt={name ?? ''}
      loading="lazy"
      className="h-12 w-9 shrink-0 rounded-md object-cover"
    />
  );
}

export function EmptyState({ message, isError }: { message: string; isError?: boolean }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-border-subtle">
      {isError ? (
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-loss shadow-[0_0_8px_var(--loss)]"
        />
      ) : null}
      <p
        role={isError ? 'alert' : undefined}
        className="max-w-md px-6 text-center text-[13px] text-ink-muted"
      >
        {message}
      </p>
    </div>
  );
}

export function PanelLoading() {
  return (
    <div className="flex h-40 items-center justify-center">
      <div className="h-4 w-4 animate-[spin_600ms_linear_infinite] rounded-full border-[1.5px] border-ink-muted border-r-transparent" />
    </div>
  );
}

export function Sparkline({ points, className }: { points: number[]; className?: string }) {
  if (points.length < 2) return null;
  const w = 100;
  const h = 28;
  const coords = points
    .map((y, i) => {
      const x = (i / (points.length - 1)) * w;
      const py = h - y * h;
      return `${x},${py}`;
    })
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={className ?? 'h-7 w-24 text-accent/80'}
      aria-hidden
      preserveAspectRatio="none"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={coords}
      />
    </svg>
  );
}

const DIRECTION_STYLES = {
  bullish: 'border-gain/35 bg-gain-muted text-gain',
  bearish: 'border-loss/35 bg-loss-muted text-loss',
  neutral: 'border-border-subtle bg-surface-inset text-ink-muted',
  watch: 'border-neon-amber/35 bg-accent-muted text-neon-amber',
  high_risk: 'border-neon-pink/35 bg-loss-muted text-neon-pink',
} as const;

const DIRECTION_ICONS: Record<keyof typeof DIRECTION_STYLES, typeof TrendingUp> = {
  bullish: TrendingUp,
  bearish: TrendingDown,
  neutral: Minus,
  watch: Eye,
  high_risk: AlertTriangle,
};

export function DirectionBadge({
  direction,
  label,
}: {
  direction: keyof typeof DIRECTION_STYLES;
  label: string;
}) {
  const Icon = DIRECTION_ICONS[direction];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${DIRECTION_STYLES[direction]}`}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden />
      {label}
    </span>
  );
}

export function formatPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}
