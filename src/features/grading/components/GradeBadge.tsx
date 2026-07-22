import React from 'react';
import { gradeBadgeColor } from '../../../types/grading';

interface GradeBadgeProps {
  grade: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE: Record<NonNullable<GradeBadgeProps['size']>, string> = {
  sm: 'h-8 min-w-[2rem] px-2 text-sm',
  md: 'h-12 min-w-[3rem] px-3 text-xl',
  lg: 'h-20 min-w-[5rem] px-4 text-4xl',
};

export const GradeBadge: React.FC<GradeBadgeProps> = ({
  grade,
  label,
  size = 'md',
  className = '',
}) => {
  const display = Number.isInteger(grade) ? String(grade) : grade.toFixed(1);

  return (
    <div className={`inline-flex flex-col items-center gap-1 ${className}`}>
      <span
        className={`inline-flex items-center justify-center rounded-xl border font-mono font-bold tabular-nums shadow-sm ${SIZE[size]} ${gradeBadgeColor(grade)}`}
        title={label || `Grade ${display}`}
      >
        {display}
      </span>
      {label && (
        <span className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
          {label}
        </span>
      )}
    </div>
  );
};
