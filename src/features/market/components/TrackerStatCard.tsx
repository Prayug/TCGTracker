import React from 'react';
import { LucideIcon } from 'lucide-react';

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
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06]">
          <Icon className="h-4 w-4 text-violet-300" />
        </div>
        <p className="section-label !normal-case !tracking-normal text-slate-400">{label}</p>
      </div>
      <p className={`text-3xl font-bold tabular-nums ${tones[tone]}`}>{display}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </article>
  );
};

function buildSparklinePrices(history: { price: number }[]): number[] {
  const prices = history.map((h) => h.price);
  if (prices.length === 0) return [];
  const slice = prices.slice(-7);
  while (slice.length < 7 && slice.length > 0) {
    slice.unshift(slice[0]);
  }
  return slice;
}

export { buildSparklinePrices };
