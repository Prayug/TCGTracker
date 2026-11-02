import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatCurrency } from '../../utils/cardDisplay';
import { toIsoDate } from '../../utils/priceHistory';
import { cn } from '@/lib/utils';
import { useElementWidth } from './useElementWidth';

export interface PricePoint {
  date: string;
  price: number;
}

interface Series {
  key: string;
  label: string;
  color: string;
  points: PricePoint[];
}

const DAY = 86_400_000;

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

function axisMoney(v: number): string {
  if (v >= 10_000) return `$${(v / 1000).toFixed(v >= 100_000 ? 0 : 1)}k`;
  if (v >= 100) return `$${Math.round(v).toLocaleString()}`;
  if (v >= 10) return `$${v.toFixed(0)}`;
  return `$${v.toFixed(2)}`;
}

function fmtDate(t: number, withYear = false): string {
  return new Date(t).toLocaleDateString('en-US', {
    month: 'short',
    day: withYear ? 'numeric' : undefined,
    year: withYear ? 'numeric' : '2-digit',
    timeZone: 'UTC',
  });
}

/**
 * Honest price chart. Observations are drawn as a step line (a price holds
 * until the next observation; nothing is interpolated between trades), with
 * a dot per observation. Gaps longer than `gapDays` break the line and are
 * shown as a dashed hairline so a stale stretch reads as stale.
 *
 * Keyboard: focus the chart and use ←/→ to move between observations.
 * A data table is available for screen readers and anyone who wants numbers.
 */
export function StepPriceChart({
  series,
  height = 240,
  gapDays = 21,
  unitLabel = 'USD',
  title,
  className,
}: {
  series: Series[];
  height?: number;
  gapDays?: number;
  unitLabel?: string;
  title: string;
  className?: string;
}) {
  const id = useId();
  const ref = useRef<SVGSVGElement>(null);
  const [wrapRef, width] = useElementWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<number | null>(null);
  const [tableOpen, setTableOpen] = useState(false);

  const prepared = useMemo(
    () =>
      series
        .map((s) => ({
          ...s,
          pts: s.points
            .map((p) => ({ t: Date.parse(`${toIsoDate(p.date)}T12:00:00Z`), v: p.price }))
            .filter((p) => Number.isFinite(p.t) && p.v > 0)
            .sort((a, b) => a.t - b.t),
        }))
        .filter((s) => s.pts.length > 0),
    [series]
  );

  const all = prepared.flatMap((s) => s.pts);
  const tMin = Math.min(...all.map((p) => p.t));
  const tMax = Math.max(...all.map((p) => p.t));
  const vMinRaw = Math.min(...all.map((p) => p.v));
  const vMaxRaw = Math.max(...all.map((p) => p.v));
  const pad = (vMaxRaw - vMinRaw) * 0.12 || vMaxRaw * 0.08 || 1;
  const vMin = Math.max(0, vMinRaw - pad);
  const vMax = vMaxRaw + pad;
  const ticks = niceTicks(vMin, vMax, 4);
  const labelW = Math.max(...ticks.map((t) => axisMoney(t).length)) * 7.2 + 10;

  const m = { top: 10, right: 12, bottom: 26, left: labelW };
  const iw = Math.max(10, width - m.left - m.right);
  const ih = Math.max(10, height - m.top - m.bottom);
  const x = (t: number) => m.left + (tMax > tMin ? ((t - tMin) / (tMax - tMin)) * iw : iw / 2);
  const y = (v: number) => m.top + ih - ((v - vMin) / (vMax - vMin || 1)) * ih;

  const primary = prepared[0];
  const timeline = primary?.pts ?? [];

  // Month ticks
  const xTicks = useMemo(() => {
    if (!(tMax > tMin)) return [tMin];
    const spanDays = (tMax - tMin) / DAY;
    const stepMonths = spanDays > 540 ? 6 : spanDays > 200 ? 2 : spanDays > 70 ? 1 : 0;
    const out: number[] = [];
    if (stepMonths === 0) {
      const n = 4;
      for (let i = 0; i <= n; i++) out.push(tMin + ((tMax - tMin) * i) / n);
      return out;
    }
    const d = new Date(tMin);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    while (d.getTime() <= tMax) {
      out.push(d.getTime());
      d.setUTCMonth(d.getUTCMonth() + stepMonths);
    }
    return out;
  }, [tMin, tMax]);

  if (prepared.length === 0) return null;

  const pathFor = (pts: { t: number; v: number }[]) => {
    const solid: string[] = [];
    const gaps: string[] = [];
    pts.forEach((p, i) => {
      if (i === 0) {
        solid.push(`M${x(p.t)},${y(p.v)}`);
        return;
      }
      const prev = pts[i - 1];
      const gap = (p.t - prev.t) / DAY > gapDays;
      if (gap) {
        gaps.push(`M${x(prev.t)},${y(prev.v)}L${x(p.t)},${y(p.v)}`);
        solid.push(`M${x(p.t)},${y(p.v)}`);
      } else {
        solid.push(`H${x(p.t)}V${y(p.v)}`);
      }
    });
    return { solid: solid.join(''), gaps: gaps.join('') };
  };

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const svg = ref.current;
    if (!svg || timeline.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestD = Infinity;
    timeline.forEach((p, i) => {
      const d = Math.abs(x(p.t) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (timeline.length === 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setHover((h) => {
        const cur = h ?? timeline.length - 1;
        return Math.min(timeline.length - 1, Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1)));
      });
    } else if (e.key === 'Home') setHover(0);
    else if (e.key === 'End') setHover(timeline.length - 1);
    else if (e.key === 'Escape') setHover(null);
  };

  const hp = hover != null ? timeline[hover] : null;
  const gapCount = timeline.filter(
    (p, i) => i > 0 && (p.t - timeline[i - 1].t) / DAY > gapDays
  ).length;

  return (
    <figure className={cn('w-full', className)} aria-labelledby={`${id}-cap`}>
      <figcaption id={`${id}-cap`} className="sr-only">
        {title}. {timeline.length} observations from {fmtDate(tMin, true)} to {fmtDate(tMax, true)},
        ranging {formatCurrency(vMinRaw)} to {formatCurrency(vMaxRaw)} ({unitLabel}).
      </figcaption>
      <div className="relative" ref={wrapRef}>
        <svg
          ref={ref}
          role="img"
          aria-label={`${title}. Use left and right arrow keys to read observations.`}
          tabIndex={0}
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="block touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={m.left}
                x2={width - m.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--chart-grid)"
              />
              <text
                x={m.left - 8}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-[var(--chart-tick)] font-mono text-[11px]"
              >
                {axisMoney(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text
              key={t}
              x={x(t)}
              y={height - 8}
              textAnchor="middle"
              className="fill-[var(--chart-tick)] font-mono text-[11px]"
            >
              {fmtDate(t)}
            </text>
          ))}
          <line
            x1={m.left}
            x2={width - m.right}
            y1={m.top + ih}
            y2={m.top + ih}
            stroke="var(--border-strong)"
          />

          {prepared.map((s) => {
            const { solid, gaps } = pathFor(s.pts);
            return (
              <g key={s.key}>
                <path
                  d={gaps}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={1}
                  strokeDasharray="2 4"
                  opacity={0.7}
                />
                <path
                  d={solid}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={1.75}
                  strokeLinejoin="round"
                />
                {s.pts.length <= 120
                  ? s.pts.map((p) => (
                      <circle key={p.t} cx={x(p.t)} cy={y(p.v)} r={1.8} fill={s.color} />
                    ))
                  : null}
              </g>
            );
          })}

          {hp ? (
            <g pointerEvents="none">
              <line
                x1={x(hp.t)}
                x2={x(hp.t)}
                y1={m.top}
                y2={m.top + ih}
                stroke="var(--ink-muted)"
                strokeDasharray="3 3"
              />
              <circle
                cx={x(hp.t)}
                cy={y(hp.v)}
                r={4}
                fill="var(--surface-raised)"
                stroke={primary.color}
                strokeWidth={2}
              />
            </g>
          ) : null}
        </svg>

        {hp ? (
          <div
            className="pointer-events-none absolute top-1 rounded-md border border-border-default bg-surface-overlay px-2.5 py-1.5 shadow-popover"
            style={{
              left: `${(x(hp.t) / width) * 100}%`,
              transform:
                x(hp.t) > width * 0.6 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
            }}
            aria-live="polite"
          >
            <p className="font-mono text-[11px] text-ink-muted">{fmtDate(hp.t, true)}</p>
            {prepared.map((s) => {
              const at = [...s.pts].reverse().find((p) => p.t <= hp.t);
              return (
                <p
                  key={s.key}
                  className="flex items-center gap-2 font-mono text-[13px] tabular-nums"
                >
                  {prepared.length > 1 ? (
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  ) : null}
                  {prepared.length > 1 ? (
                    <span className="font-sans text-ink-secondary">{s.label}</span>
                  ) : null}
                  {at ? formatCurrency(at.v) : '—'}
                </p>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-meta text-ink-muted">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {prepared.length > 1
            ? prepared.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5">
                  <span className="h-[2px] w-3" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))
            : null}
          <span>
            {timeline.length} observation{timeline.length === 1 ? '' : 's'} · step line, not
            interpolated
            {gapCount > 0
              ? ` · ${gapCount} gap${gapCount === 1 ? '' : 's'} over ${gapDays} days dashed`
              : ''}
          </span>
        </span>
        <details
          className="group open:basis-full"
          onToggle={(e) => setTableOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer select-none text-accent hover:underline">
            Data table
          </summary>
          {/* Rendered only when open: a closed <details> still lays out its content. */}
          {tableOpen ? (
            <div className="mt-2 max-h-56 overflow-auto rounded-md border border-border-default">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Date</th>
                    {prepared.map((s) => (
                      <th key={s.key} className="num">
                        {s.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...timeline].reverse().map((p) => (
                    <tr key={p.t}>
                      <td className="font-mono">{fmtDate(p.t, true)}</td>
                      {prepared.map((s) => {
                        const at = s.pts.find((q) => q.t === p.t);
                        return (
                          <td key={s.key} className="num">
                            {at ? formatCurrency(at.v) : ''}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </details>
      </div>
    </figure>
  );
}
