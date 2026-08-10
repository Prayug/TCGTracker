import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Sparkle } from 'lucide-react';
import { gradeHex, gradeTextClass } from '../../../types/grading';

interface GradeBadgeProps {
  grade: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE: Record<
  NonNullable<GradeBadgeProps['size']>,
  { medal: string; numeral: string; ring: string }
> = {
  sm: { medal: 'h-9 w-9', numeral: 'text-[15px]', ring: 'p-[2px]' },
  md: { medal: 'h-14 w-14', numeral: 'text-2xl', ring: 'p-[3px]' },
  lg: { medal: 'h-24 w-24', numeral: 'text-[2.7rem]', ring: 'p-[3.5px]' },
};

export const GradeBadge: React.FC<GradeBadgeProps> = ({
  grade,
  label,
  size = 'md',
  className = '',
}) => {
  const reduced = useReducedMotion();
  const display = Number.isInteger(grade) ? String(grade) : grade.toFixed(1);
  const hex = gradeHex(grade);
  const text = gradeTextClass(grade);
  const isTen = grade >= 10;
  const conf = SIZE[size];

  return (
    <motion.div
      initial={reduced ? false : { scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.1 }}
      className={`inline-flex flex-col items-center gap-1.5 ${className}`}
      title={label || `Grade ${display}`}
    >
      <div className="relative">
        {/* Ambient glow */}
        <motion.div
          aria-hidden
          className="absolute -inset-2 rounded-full"
          style={{
            background: `radial-gradient(circle, ${hex}59 0%, transparent 68%)`,
            filter: 'blur(10px)',
          }}
          animate={
            isTen && !reduced
              ? { opacity: [0.5, 1, 0.5], scale: [1, 1.07, 1] }
              : { opacity: 0.8, scale: 1 }
          }
          transition={{
            repeat: isTen && !reduced ? Infinity : undefined,
            duration: 2.6,
            ease: 'easeInOut',
          }}
        />

        {/* Gem sparkle for top grades */}
        {isTen && (
          <Sparkle
            aria-hidden
            className="absolute -top-1.5 left-1/2 z-10 h-4 w-4 -translate-x-1/2 text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)]"
          />
        )}

        {/* Metal ring */}
        <div
          className={`relative rounded-full ${conf.ring}`}
          style={{
            background: `conic-gradient(from 210deg, ${hex}14 0deg, ${hex}cc 70deg, ${hex}40 150deg, ${hex}14 220deg, ${hex}80 305deg, ${hex}14 360deg)`,
            boxShadow: `0 0 22px ${hex}30, inset 0 0 6px ${hex}40`,
          }}
        >
          {/* Recessed face */}
          <div
            className={`flex ${conf.medal} items-center justify-center rounded-full`}
            style={{
              background:
                'radial-gradient(120% 120% at 50% 18%, var(--surface-overlay) 0%, var(--surface-base) 78%)',
              boxShadow: `inset 0 3px 8px rgba(0,0,0,0.55), inset 0 -1px 2px ${hex}40`,
            }}
          >
            <span
              className={`font-display font-bold leading-none tabular-nums ${conf.numeral}`}
              style={{ color: hex, textShadow: `0 0 18px ${hex}66` }}
            >
              {display}
            </span>
          </div>
        </div>

        {/* Case gloss */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-white/25 via-white/[0.05] to-transparent"
        />
      </div>
      {label && (
        <span className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${text}`}>
          {label}
        </span>
      )}
    </motion.div>
  );
};
