import React from 'react';
import { LucideIcon, TrendingDown, TrendingUp } from 'lucide-react';

export type MetricTrend = 'up' | 'down' | 'neutral';
export type MetricSize = 'compact' | 'default' | 'hero';

interface PortfolioMetricCardProps {
  label: string;
  value: string;
  subValue?: string;
  trend?: MetricTrend;
  size?: MetricSize;
  icon?: LucideIcon;
  className?: string;
}

const trendStyles: Record<
  MetricTrend,
  { value: string; sub: string; glow: string; icon: string; border: string }
> = {
  up: {
    value: 'text-emerald-300',
    sub: 'text-emerald-400/80',
    glow: 'shadow-[0_0_24px_rgba(16,185,129,0.18)]',
    icon: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
    border: 'border-emerald-500/25 hover:border-emerald-400/40',
  },
  down: {
    value: 'text-rose-300',
    sub: 'text-rose-400/80',
    glow: 'shadow-[0_0_24px_rgba(244,63,94,0.16)]',
    icon: 'bg-rose-400/15 text-rose-300 border-rose-400/30',
    border: 'border-rose-500/25 hover:border-rose-400/40',
  },
  neutral: {
    value: 'text-white',
    sub: 'text-slate-400',
    glow: 'shadow-[0_0_20px_rgba(148,163,184,0.08)]',
    icon: 'bg-white/10 text-slate-200 border-white/15',
    border: 'border-white/10 hover:border-white/20',
  },
};

const sizeStyles: Record<MetricSize, { shell: string; value: string; label: string }> = {
  compact: {
    shell: 'p-3',
    value: 'text-lg font-semibold tracking-tight',
    label: 'text-[10px] uppercase tracking-[0.16em]',
  },
  default: {
    shell: 'p-3.5',
    value: 'text-xl font-semibold tracking-tight tabular-nums',
    label: 'text-[11px] uppercase tracking-[0.18em]',
  },
  hero: {
    shell: 'p-4 sm:p-5',
    value: 'text-3xl sm:text-4xl font-bold tracking-tight tabular-nums',
    label: 'text-xs uppercase tracking-[0.2em]',
  },
};

export const PortfolioMetricCard: React.FC<PortfolioMetricCardProps> = ({
  label,
  value,
  subValue,
  trend = 'neutral',
  size = 'default',
  icon: Icon,
  className = '',
}) => {
  const palette = trendStyles[trend];
  const sizing = sizeStyles[size];
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : null;

  return (
    <article
      className={[
        'group relative overflow-hidden rounded-2xl border bg-slate-950/60 backdrop-blur-md transition-all duration-300',
        'hover:-translate-y-0.5 hover:bg-white/[0.06]',
        palette.border,
        palette.glow,
        sizing.shell,
        className,
      ].join(' ')}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      {trend === 'up' && (
        <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-emerald-500/10 blur-2xl" />
      )}
      {trend === 'down' && (
        <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-rose-500/10 blur-2xl" />
      )}

      <div className="relative">
        <div className="mb-2 flex items-start justify-between gap-2">
          <p className={`font-medium text-slate-400 ${sizing.label}`}>{label}</p>
          {Icon && (
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${palette.icon}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="flex items-end justify-between gap-2">
          <p
            className={`${sizing.value} ${palette.value} [text-shadow:0_0_24px_rgba(255,255,255,0.08)]`}
          >
            {value}
          </p>
          {TrendIcon && (
            <TrendIcon
              className={`mb-1 h-4 w-4 shrink-0 ${trend === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}
              aria-hidden="true"
            />
          )}
        </div>

        {subValue && (
          <p className={`mt-1 text-xs font-medium tabular-nums ${palette.sub}`}>{subValue}</p>
        )}
      </div>
    </article>
  );
};
