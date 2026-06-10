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

const trendStyles: Record<MetricTrend, { value: string; sub: string; border: string }> = {
  up: {
    value: 'text-gain',
    sub: 'text-gain/80',
    border: 'border-gain/25',
  },
  down: {
    value: 'text-loss',
    sub: 'text-loss/80',
    border: 'border-loss/25',
  },
  neutral: {
    value: 'text-ink-primary',
    sub: 'text-ink-muted',
    border: 'border-border-default',
  },
};

const sizeStyles: Record<MetricSize, { shell: string; value: string; label: string }> = {
  compact: {
    shell: 'p-3',
    value: 'text-lg font-semibold tracking-tight font-mono',
    label: 'text-xs font-medium',
  },
  default: {
    shell: 'p-3.5',
    value: 'text-xl font-semibold tracking-tight tabular-nums font-mono',
    label: 'text-xs font-medium',
  },
  hero: {
    shell: 'p-4',
    value: 'text-3xl font-bold tracking-tight tabular-nums font-mono',
    label: 'text-sm font-medium',
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
        'rounded-lg border bg-surface-inset transition-colors',
        palette.border,
        sizing.shell,
        className,
      ].join(' ')}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className={`text-ink-muted ${sizing.label}`}>{label}</p>
        {Icon && (
          <Icon className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        <p className={`${sizing.value} ${palette.value}`}>{value}</p>
        {TrendIcon && (
          <TrendIcon
            className={`mb-1 h-4 w-4 shrink-0 ${trend === 'up' ? 'text-gain' : 'text-loss'}`}
            aria-hidden="true"
          />
        )}
      </div>

      {subValue && (
        <p className={`mt-1 text-xs font-medium tabular-nums ${palette.sub}`}>{subValue}</p>
      )}
    </article>
  );
};
