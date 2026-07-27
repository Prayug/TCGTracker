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

import { motion } from 'framer-motion';

const gradeGlow = (grade: number): string => {
  if (grade >= 10) return 'shadow-[0_0_24px_rgba(201,162,39,0.5),0_0_48px_rgba(201,162,39,0.2)]';
  if (grade >= 9) return 'shadow-[0_0_20px_rgba(168,132,26,0.35),0_0_40px_rgba(168,132,26,0.15)]';
  if (grade >= 8) return 'shadow-[0_0_16px_rgba(205,127,50,0.3),0_0_32px_rgba(205,127,50,0.1)]';
  return 'shadow-sm';
};

export const GradeBadge: React.FC<GradeBadgeProps> = ({
  grade,
  label,
  size = 'md',
  className = '',
}) => {
  const display = Number.isInteger(grade) ? String(grade) : grade.toFixed(1);

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
      className={`inline-flex flex-col items-center gap-1 ${className}`}
    >
      <span
        className={`inline-flex items-center justify-center rounded-xl border font-mono font-bold tabular-nums ${SIZE[size]} ${gradeBadgeColor(grade)}`}
        style={{ boxShadow: gradeGlow(grade) }}
        title={label || `Grade ${display}`}
      >
        {display}
      </span>
      {label && (
        <span className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
          {label}
        </span>
      )}
    </motion.div>
  );
};
