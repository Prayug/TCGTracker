import React from 'react';
import { LucideIcon } from 'lucide-react';
import { CountUp } from '../../../components/common/CountUp';
import { fillPriceHistoryGaps } from '../../../utils/priceHistory';

interface TrackerStatCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  helper: string;
  tone?: 'default' | 'gain' | 'loss' | 'alert';
}

const tones = {
  default: 'text-ink-primary',
  gain: 'text-gain',
  loss: 'text-loss',
  alert: 'text-accent',
};

export const TrackerStatCard: React.FC<TrackerStatCardProps> = ({
  icon: Icon,
  label,
  value,
  helper,
  tone = 'default',
}) => {
  return (
    <article className="card-glass transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/25 bg-accent-muted">
          <Icon className="h-4 w-4 text-accent" />
        </div>
        <p className="section-label !normal-case !tracking-normal text-ink-muted">{label}</p>
      </div>
      <p className={`font-mono text-3xl font-bold tabular-nums ${tones[tone]}`}>
        {typeof value === 'number' ? value === 0 ? '—' : <CountUp end={value} /> : value}
      </p>
      <p className="mt-1 text-xs text-ink-muted">{helper}</p>
    </article>
  );
};

function buildSparklinePrices(history: { date: string; price: number }[]): number[] {
  if (history.length === 0) return [];
  const { points } = fillPriceHistoryGaps(history);
  return points.slice(-7).map((p) => p.price);
}

export { buildSparklinePrices };
