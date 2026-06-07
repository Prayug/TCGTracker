import React from 'react';

interface CompletionRingProps {
  /** 0–100 */
  percent: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

/**
 * Radial completion indicator. Action blue while in progress,
 * collectible gold at 100% — finishing a set is a gold moment.
 */
export const CompletionRing: React.FC<CompletionRingProps> = ({
  percent,
  size = 44,
  strokeWidth = 4,
  className = '',
}) => {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const complete = clamped >= 100;
  const color = complete ? '#d6aa51' : '#3b82f6';

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(clamped)}% complete`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <span
        className={`absolute text-[10px] font-bold tabular-nums ${
          complete ? 'text-gold' : 'text-ink-secondary'
        }`}
      >
        {Math.round(clamped)}%
      </span>
    </div>
  );
};
