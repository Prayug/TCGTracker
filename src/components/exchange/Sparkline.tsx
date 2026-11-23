import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Inline trend line for rows and tiles. Colour follows the sign of the
 * change over the window (teal up, vermilion down, ink flat). It carries no
 * axes, so it always sits next to a number that states the change.
 */
export function Sparkline({
  values,
  width = 72,
  height = 22,
  className,
  label,
}: {
  values: (number | null | undefined)[];
  width?: number;
  height?: number;
  className?: string;
  /** Accessible summary, e.g. "Up 12% over 30 days". Omit when the row already says it. */
  label?: string;
}) {
  const gid = useId();
  const pts = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (pts.length < 2) {
    return (
      <span
        aria-hidden={label ? undefined : true}
        aria-label={label}
        className={cn('inline-block border-b border-dashed border-rule', className)}
        style={{ width, height: height / 2 }}
      />
    );
  }
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const step = width / (pts.length - 1);
  const pad = 1.5;
  const y = (v: number) => pad + (height - pad * 2) * (1 - (v - min) / span);
  const d = pts
    .map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ');
  const first = pts[0];
  const last = pts[pts.length - 1];
  const change = first ? (last - first) / first : 0;
  const tone = Math.abs(change) < 0.005 ? 'text-ink-muted' : change > 0 ? 'text-gain' : 'text-loss';
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('shrink-0 overflow-visible', tone, className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.14" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${width} ${height} L0 ${height} Z`} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx={width} cy={y(last)} r="1.8" fill="currentColor" />
    </svg>
  );
}
