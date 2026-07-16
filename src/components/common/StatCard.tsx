import React from 'react';
import { LucideIcon } from 'lucide-react';
import { CountUp } from './CountUp';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  numericValue?: number;
  value?: string;
  suffix?: string;
  prefix?: string;
  tone?: 'default' | 'success' | 'accent';
}

const toneClasses = {
  default: 'text-ink-primary',
  success: 'text-gain',
  accent: 'text-accent',
};

/** Inline stat for use in stats bars — not a boxed card grid item. */
export const StatCard: React.FC<StatCardProps> = ({
  label,
  numericValue,
  value,
  suffix = '',
  prefix = '',
  tone = 'default',
}) => {
  return (
    <div className="flex flex-col gap-0.5 transition-transform duration-200 hover:-translate-y-0.5">
      <p className={`font-mono text-2xl font-semibold tabular-nums tracking-tight ${toneClasses[tone]}`}>
        {value !== undefined ? (
          value
        ) : numericValue !== undefined ? (
          <CountUp end={numericValue} suffix={suffix} prefix={prefix} />
        ) : (
          '—'
        )}
      </p>
      <p className="text-sm text-ink-muted">{label}</p>
    </div>
  );
};

interface StatsBarProps {
  children: React.ReactNode;
  className?: string;
}

export const StatsBar: React.FC<StatsBarProps> = ({ children, className = '' }) => (
  <div
    className={`stagger-children flex flex-wrap items-start gap-x-10 gap-y-6 border-y border-border-subtle py-6 ${className}`}
  >
    {children}
  </div>
);
