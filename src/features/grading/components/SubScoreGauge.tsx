import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Check, ChevronDown } from 'lucide-react';
import { normalizeScore } from '../../../types/grading';

interface SubScoreGaugeProps {
  label: string;
  score: number;
  max?: number;
  defects?: string[];
}

const TICKS = 20;

function scoreHex(ratio: number): string {
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
  const hex = scoreHex(ratio);
  const filled = Math.round(ratio * TICKS);
  const hasDefects = defects.length > 0;
  const displayScore = Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-xl border border-border-subtle bg-surface-inset/50 p-4 transition-colors duration-200 hover:border-border-strong"
    >
      {/* Top hairline in the gauge color */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(to right, transparent, ${hex}66, transparent)` }}
      />

      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-secondary">
          {label}
        </p>
        <div className="flex items-baseline gap-1">
          <span
            className="font-display text-[1.7rem] font-bold leading-none tabular-nums"
            style={{ color: hex, textShadow: `0 0 16px ${hex}55` }}
          >
            {displayScore}
          </span>
          <span className="font-mono text-[10px] text-ink-muted">/{max}</span>
        </div>
      </div>

      {/* Ticked track */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.012 } } }}
        className="mt-3 flex gap-[3px]"
        aria-hidden
      >
        {Array.from({ length: TICKS }).map((_, i) => (
          <motion.span
            key={i}
            variants={{ hidden: { opacity: 0, scaleY: 0.3 }, visible: { opacity: 1, scaleY: 1 } }}
            className="h-1.5 flex-1 rounded-full"
            style={{
              background:
                i < filled ? hex : 'color-mix(in srgb, var(--ink-primary) 12%, transparent)',
              boxShadow: i < filled ? `0 0 6px ${hex}55` : undefined,
            }}
          />
        ))}
      </motion.div>

      {/* Defect line */}
      <div className="mt-2.5 min-h-[16px]">
        {!hasDefects ? (
          <p className="flex items-center gap-1.5 text-[10px] font-medium text-gain">
            <Check className="h-3 w-3" />
            Clean — no issues flagged
          </p>
        ) : defects.length === 1 ? (
          <p className="flex items-start gap-1.5 text-[10px] leading-snug text-amber-300/90">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            <span className="line-clamp-2">{defects[0]}</span>
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="flex w-full cursor-pointer items-start gap-1.5 text-left text-[10px] leading-snug text-amber-300/90 transition-colors hover:text-amber-200"
          >
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2">{defects[0]}</span>
              <span className="mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-px font-semibold text-amber-300">
                +{defects.length - 1} more
                <ChevronDown
                  className={`h-2.5 w-2.5 transition-transform duration-200 ${showAll ? 'rotate-180' : ''}`}
                />
              </span>
            </span>
          </button>
        )}

        <AnimatePresence>
          {showAll && (
            <motion.ul
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-2 space-y-1 overflow-hidden border-t border-border-subtle/60 pt-2"
            >
              {defects.slice(1).map((d, i) => (
                <li
                  key={i}
                  className="flex items-start gap-1.5 text-[10px] leading-snug text-amber-300/80"
                >
                  <span
                    className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-300/70"
                    aria-hidden
                  />
                  {d}
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
