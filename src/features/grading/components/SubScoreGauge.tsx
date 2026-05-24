import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { normalizeScore } from '../../../types/grading';

interface SubScoreGaugeProps {
  label: string;
  score: number;
  max?: number;
  defects?: string[];
}

function scoreColor(ratio: number): string {
  if (ratio >= 0.94) return '#34d399'; // emerald
  if (ratio >= 0.85) return '#38bdf8'; // sky
  if (ratio >= 0.7) return '#fbbf24'; // amber
  return '#f87171'; // red
}

export const SubScoreGauge: React.FC<SubScoreGaugeProps> = ({
  label,
  score,
  max = 10,
  defects = [],
}) => {
  const [showAll, setShowAll] = useState(false);
  const normalized = normalizeScore(score);
  const ratio = Math.max(0, Math.min(1, normalized / max));
  const color = scoreColor(ratio);
  const radius = 36;
  const stroke = 6;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * ratio;
  const displayScore = Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1);

  return (
    <div className="flex flex-col items-center rounded-xl border border-border-subtle bg-surface-inset/60 p-3">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90">
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-white/10"
          />
          <motion.circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            initial={{ strokeDasharray: `0 ${circumference}` }}
            animate={{ strokeDasharray: `${dash} ${circumference}` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-lg font-bold tabular-nums text-ink-primary">{displayScore}</span>
          <span className="text-[9px] text-ink-muted">/{max}</span>
        </div>
      </div>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      {defects.length > 0 && (
        <div className="mt-1 w-full">
          <p className="line-clamp-2 text-center text-[10px] text-amber-300/90">{defects[0]}</p>
          {defects.length > 1 && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="mt-0.5 flex w-full items-center justify-center gap-0.5 text-[9px] text-ink-muted hover:text-ink-secondary"
            >
              {showAll ? 'Hide' : `+${defects.length - 1} more`}
              <ChevronDown
                className={`h-2.5 w-2.5 transition-transform ${showAll ? 'rotate-180' : ''}`}
              />
            </button>
          )}
          <AnimatePresence>
            {showAll && (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-1 space-y-0.5 overflow-hidden"
              >
                {defects.slice(1).map((d, i) => (
                  <li key={i} className="text-center text-[9px] text-amber-300/80">
                    {d}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
