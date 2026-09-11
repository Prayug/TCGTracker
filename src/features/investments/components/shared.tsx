import { TrendingDown, TrendingUp } from 'lucide-react';
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
        up
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border-red-500/30 bg-red-500/10 text-red-400'
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
  strong: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  ok: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  thin: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  illiquid: 'border-red-500/30 bg-red-500/10 text-red-400',
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
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
      : value < -0.15
        ? 'border-red-500/30 bg-red-500/10 text-red-400'
        : 'border-slate-500/30 bg-slate-500/10 text-ink-muted';
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
    <div
      className={`flex h-40 items-center justify-center rounded-xl border ${isError ? 'border-red-500/30 bg-red-500/5' : 'border-border-default bg-surface-raised'}`}
    >
      <p
        className={`max-w-md px-6 text-center text-sm ${isError ? 'text-red-400' : 'text-ink-muted'}`}
      >
        {message}
      </p>
    </div>
  );
}

export function PanelLoading() {
  return (
    <div className="flex h-40 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
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
  bullish: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-400',
  bearish: 'border-red-500/35 bg-red-500/12 text-red-400',
  neutral: 'border-slate-500/30 bg-slate-500/10 text-ink-muted',
  watch: 'border-amber-500/35 bg-amber-500/12 text-amber-400',
  high_risk: 'border-orange-500/35 bg-orange-500/12 text-orange-400',
} as const;

export function DirectionBadge({
  direction,
  label,
}: {
  direction: keyof typeof DIRECTION_STYLES;
  label: string;
}) {
  const arrow =
    direction === 'bullish'
      ? '↑'
      : direction === 'bearish'
        ? '↓'
        : direction === 'watch'
          ? '◉'
          : direction === 'high_risk'
            ? '⚠'
            : '→';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${DIRECTION_STYLES[direction]}`}
    >
      <span aria-hidden>{arrow}</span>
      {label}
    </span>
  );
}

export function formatPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}
