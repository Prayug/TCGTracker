import React from 'react';
import { LucideIcon } from 'lucide-react';
import { fillPriceHistoryGaps } from '../../../utils/priceHistory';

interface TrackerStatCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  helper: string;
  tone?: 'default' | 'gain' | 'loss' | 'alert';
}

const tones = {
  default: 'text-white',
  gain: 'text-emerald-300',
  loss: 'text-rose-300',
  alert: 'text-amber-300',
};

export const TrackerStatCard: React.FC<TrackerStatCardProps> = ({
  icon: Icon,
  label,
  value,
  helper,
  tone = 'default',
}) => {
  const display = typeof value === 'number' && value === 0 ? '—' : value;

  return (
    <article className="card">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-default bg-surface-hover">
          <Icon className="h-4 w-4 text-violet-300" />
        </div>
        <p className="section-label !normal-case !tracking-normal text-ink-muted">{label}</p>
      </div>
      <p className={`text-3xl font-bold tabular-nums ${tones[tone]}`}>{display}</p>
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
