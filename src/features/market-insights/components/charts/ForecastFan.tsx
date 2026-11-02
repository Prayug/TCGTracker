import { useMemo, useState } from 'react';
import { area, curveMonotoneX, line } from 'd3-shape';
import { motion, useReducedMotion } from 'motion/react';
import type { CardPrediction } from '../../types';
import { useElementWidth } from '../../../../components/exchange/useElementWidth';

export interface FanPoint {
  day: number;
  label: string;
  low: number;
  mid: number;
  high: number;
}

/** The model's own ranges per horizon, starting from today's price. Horizons it did not score are left out. */
export function fanPoints(p: CardPrediction): FanPoint[] {
  const pts: FanPoint[] = [
    { day: 0, label: 'Today', low: p.currentPrice, mid: p.currentPrice, high: p.currentPrice },
    { day: 7, label: '7d', low: p.predicted7dLow, mid: p.predicted7dMid, high: p.predicted7dHigh },
    {
      day: 30,
      label: '30d',
      low: p.predicted30dLow,
      mid: p.predicted30dMid,
      high: p.predicted30dHigh,
    },
    {
      day: 90,
      label: '90d',
      low: p.predicted90dLow,
      mid: p.predicted90dMid,
      high: p.predicted90dHigh,
    },
  ];
  if (p.predicted180dMid != null && p.predicted180dLow != null && p.predicted180dHigh != null) {
    pts.push({
      day: 180,
      label: '6m',
      low: p.predicted180dLow,
      mid: p.predicted180dMid,
      high: p.predicted180dHigh,
    });
  }
  if (p.predicted365dMid != null && p.predicted365dLow != null && p.predicted365dHigh != null) {
    pts.push({
      day: 365,
      label: '1y',
      low: p.predicted365dLow,
      mid: p.predicted365dMid,
      high: p.predicted365dHigh,
    });
  }
  return pts.filter((x) => [x.low, x.mid, x.high].every((v) => Number.isFinite(v) && v > 0));
}

/**
 * A forecast fan: the shaded band is the model's low-to-high range at each
 * horizon, the line is its midpoint. The x axis is spaced by horizon, not
 * by calendar, so a year does not flatten the near term.
 */
export function ForecastFan({
  prediction,
  dark = false,
  height = 260,
}: {
  prediction: CardPrediction;
  dark?: boolean;
  height?: number;
}) {
  const [wrap, width] = useElementWidth<HTMLDivElement>(640);
  const reduce = useReducedMotion();
  const pts = useMemo(() => fanPoints(prediction), [prediction]);
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 56, r: 18, t: 18, b: 30 };
  const w = Math.max(240, width);
  const innerW = w - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const lo = Math.min(...pts.map((p) => p.low));
  const hi = Math.max(...pts.map((p) => p.high));
  const span = Math.max(hi - lo, hi * 0.04);
  const y0 = lo - span * 0.12;
  const y1 = hi + span * 0.12;
  const x = (i: number) => pad.l + (pts.length > 1 ? (i / (pts.length - 1)) * innerW : innerW / 2);
  const y = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0)) * innerH;
  const band = area<FanPoint>()
    .x((_, i) => x(i))
    .y0((d) => y(d.low))
    .y1((d) => y(d.high))
    .curve(curveMonotoneX)(pts);
  const mid = line<FanPoint>()
    .x((_, i) => x(i))
    .y((d) => y(d.mid))
    .curve(curveMonotoneX)(pts);
  const up = pts[pts.length - 1]?.mid >= prediction.currentPrice;
  const tone = up ? 'var(--gain)' : 'var(--loss)';
  const ticks = [y0 + (y1 - y0) * 0.15, (y0 + y1) / 2, y1 - (y1 - y0) * 0.15];
  const axis = dark ? 'rgba(255,255,255,0.5)' : 'var(--ink-muted)';
  const grid = dark ? 'rgba(255,255,255,0.08)' : 'var(--rule)';
  const money = (v: number) =>
    v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(v < 10 ? 2 : 0)}`;
  const h = hover != null ? pts[hover] : null;

  if (pts.length < 2) {
    return (
      <p className="text-[13px] text-ink-muted">
        The model did not produce a usable range for this card.
      </p>
    );
  }

  return (
    <div ref={wrap} className="relative">
      <svg
        width={w}
        height={height}
        role="img"
        aria-label={`Forecast range for ${prediction.cardName}: ${pts
          .slice(1)
          .map((p) => `${p.label} ${money(p.low)} to ${money(p.high)}, midpoint ${money(p.mid)}`)
          .join('; ')}`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`fan-${prediction.id}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={tone} stopOpacity="0.05" />
            <stop offset="1" stopColor={tone} stopOpacity="0.32" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={grid} />
            <text
              x={pad.l - 8}
              y={y(t)}
              dy="0.32em"
              textAnchor="end"
              fontSize="11"
              fill={axis}
              fontFamily="var(--font-mono, monospace)"
            >
              {money(t)}
            </text>
          </g>
        ))}
        <line
          x1={pad.l}
          x2={w - pad.r}
          y1={y(prediction.currentPrice)}
          y2={y(prediction.currentPrice)}
          stroke={axis}
          strokeDasharray="3 4"
        />
        <motion.path
          d={band ?? ''}
          fill={`url(#fan-${prediction.id})`}
          initial={reduce ? false : { opacity: 0, scaleX: 0.2 }}
          animate={{ opacity: 1, scaleX: 1 }}
          style={{ originX: `${pad.l}px` }}
          transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
        />
        <motion.path
          d={mid ?? ''}
          fill="none"
          stroke={tone}
          strokeWidth={2.5}
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
        />
        {pts.map((p, i) => (
          <g key={p.label}>
            <line
              x1={x(i)}
              x2={x(i)}
              y1={y(p.low)}
              y2={y(p.high)}
              stroke={tone}
              strokeOpacity={hover === i ? 0.9 : 0.35}
              strokeWidth={hover === i ? 2 : 1}
            />
            <circle
              cx={x(i)}
              cy={y(p.mid)}
              r={hover === i ? 5.5 : 3.5}
              fill={i === 0 ? axis : tone}
              stroke={dark ? '#0b0e14' : 'var(--surface-base)'}
              strokeWidth={2}
            />
            <text x={x(i)} y={height - 8} textAnchor="middle" fontSize="11.5" fill={axis}>
              {p.label}
            </text>
            <rect
              x={x(i) - innerW / (pts.length - 1) / 2}
              y={pad.t}
              width={innerW / (pts.length - 1)}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}
      </svg>
      {h && hover != null && hover > 0 ? (
        <div
          className="pointer-events-none absolute z-10 w-44 -translate-x-1/2 rounded-lg border border-rule-strong bg-surface-raised px-3 py-2 text-[12px] text-ink-primary shadow-xl"
          style={{
            left: Math.min(w - 90, Math.max(90, x(hover))),
            top: Math.max(0, y(h.high) - 84),
          }}
          role="tooltip"
        >
          <p className="font-medium">In {h.label}</p>
          <p className="font-mono tabular-nums">Mid {money(h.mid)}</p>
          <p className="font-mono text-[11px] tabular-nums text-ink-muted">
            Range {money(h.low)} to {money(h.high)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
