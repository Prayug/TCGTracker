import React from 'react';
import { LucideIcon } from 'lucide-react';
import { CountUp } from './CountUp';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  /** Numeric value for count-up animation */
  numericValue?: number;
  /** Static display when not numeric (overrides numeric) */
  value?: string;
  suffix?: string;
  prefix?: string;
  tone?: 'default' | 'success' | 'accent';
}

export const StatCard: React.FC<StatCardProps> = ({
  icon: Icon,
  label,
  numericValue,
  value,
  suffix = '',
  prefix = '',
  tone = 'default',
}) => {
  const iconClass =
    tone === 'success'
      ? 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30'
      : tone === 'accent'
        ? 'bg-violet-400/15 text-violet-300 border-violet-400/30'
        : 'bg-white/10 text-slate-200 border-white/15';

  return (
    <article className="card transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.06]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${iconClass}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      <p className="text-xl font-semibold tracking-tight text-white">
        {value !== undefined ? (
          value
        ) : numericValue !== undefined ? (
          <CountUp end={numericValue} suffix={suffix} prefix={prefix} />
        ) : (
          '—'
        )}
      </p>
      <p className="mt-1 text-sm text-slate-400">{label}</p>
    </article>
  );
};
