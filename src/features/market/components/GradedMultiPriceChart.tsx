import React, { useEffect, useMemo, useState } from 'react';
import { curveLinear } from '@visx/curve';
import { LineChart } from '@/components/charts/line-chart';
import { Line } from '@/components/charts/line';
import { Grid } from '@/components/charts/grid';
import { XAxis } from '@/components/charts/x-axis';
import { YAxis } from '@/components/charts/y-axis';
import { ChartTooltip } from '@/components/charts/tooltip';
import {
  AllGradedPriceHistoryResult,
  GradedPriceEntry,
  GradedPriceHistorySeries,
} from '../../../services/gradedPricesApi';
import { formatCurrency } from '../../../utils/cardDisplay';
import { toIsoDate } from '../../../utils/priceHistory';
import {
  PRICE_RANGES,
  PriceRangeKey,
  computeTightChartDomain,
  formatAxisPercent,
  formatCompactAxisPrice,
  slicePriceHistory,
} from '../../../utils/chartDomain';
import { cn } from '@/lib/utils';

export type GradedSeriesKey = string;

export function gradedSeriesKey(grader: string, grade: string): GradedSeriesKey {
  return `${grader}::${grade}`;
}

function graderLabel(grader: string): string {
  const map: Record<string, string> = {
    psa: 'PSA',
    cgc: 'CGC',
    bgs: 'BGS',
    sgc: 'SGC',
    tag: 'TAG',
    ace: 'ACE',
  };
  return map[grader] ?? grader.toUpperCase();
}

function formatGradeLabel(grade: string): string {
  return grade
    .split(/\s+/)
    .map((part) => {
      if (/^\d+(\.\d+)?$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

export function seriesDisplayLabel(grader: string, grade: string): string {
  return `${graderLabel(grader)} ${formatGradeLabel(grade)}`.trim();
}

const SERIES_COLORS: Record<string, string> = {
  'psa::10': '#6ee7b7',
  'psa::9': '#3d9b6e',
  'psa::8': '#2d6b4f',
  'cgc::10': '#5bc4d4',
  'cgc::10 pristine': '#86efac',
  'bgs::10': '#f0b27a',
  'bgs::10 black': '#e8ecf2',
  'sgc::10': '#7dd3c0',
  'tag::10': '#7dd3fc',
  'ace::10': '#d4a574',
};

const FALLBACK_COLORS = ['#6ee7b7', '#5bc4d4', '#f0b27a', '#86efac', '#9aa6b8', '#d4a574', '#7dd3fc'];

const PRIMARY_KEYS = ['psa::10', 'cgc::10', 'bgs::10'] as const;

export function seriesColor(key: GradedSeriesKey, index: number): string {
  return SERIES_COLORS[key] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

export interface ChartSeriesMeta {
  key: GradedSeriesKey;
  grader: string;
  grade: string;
  label: string;
  color: string;
  latestPrice: number | null;
  pointCount: number;
  firstDate: string | null;
}

type ChartMode = 'price' | 'performance';

function latestOf(points: { price: number }[]): number | null {
  if (!points.length) return null;
  return points[points.length - 1].price;
}

function firstDateOf(points: { date: string }[]): string | null {
  if (!points.length) return null;
  return toIsoDate(points[0].date);
}

function isGradedSeries(grader: string): boolean {
  return grader !== 'ungraded' && grader !== 'generic';
}

function pickSoloEnabled(
  metas: ChartSeriesMeta[],
  focusedKey?: GradedSeriesKey | null
): Set<GradedSeriesKey> {
  if (focusedKey && metas.some((m) => m.key === focusedKey)) {
    return new Set([focusedKey]);
  }
  const psa10 = metas.find((m) => m.key === 'psa::10');
  if (psa10) return new Set([psa10.key]);
  const priced = metas.find((m) => m.latestPrice != null);
  return priced ? new Set([priced.key]) : new Set();
}

function formatTooltipDate(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

interface GradedMultiPriceChartProps {
  history: AllGradedPriceHistoryResult | null;
  livePrices?: GradedPriceEntry[];
  height?: number;
  enabledKeys?: Set<GradedSeriesKey>;
  onEnabledKeysChange?: (keys: Set<GradedSeriesKey>) => void;
  focusedKey?: GradedSeriesKey | null;
  onFocusKey?: (key: GradedSeriesKey) => void;
}

export const GradedMultiPriceChart: React.FC<GradedMultiPriceChartProps> = ({
  history,
  livePrices = [],
  height = 150,
  enabledKeys: controlledEnabled,
  onEnabledKeysChange,
  focusedKey,
}) => {
  const [chartMode, setChartMode] = useState<ChartMode>('price');
  const [range, setRange] = useState<PriceRangeKey>('6M');
  const [showAllLegend, setShowAllLegend] = useState(false);

  const seriesList: GradedPriceHistorySeries[] = useMemo(() => {
    const fromApi = (history?.series ?? []).filter((s) => isGradedSeries(s.grader));
    const byKey = new Map(
      fromApi.map((s) => [gradedSeriesKey(s.grader, s.grade), { ...s, points: [...s.points] }])
    );

    for (const live of livePrices) {
      if (!isGradedSeries(live.grader)) continue;
      if (live.price == null || live.price <= 0) continue;
      const key = gradedSeriesKey(live.grader, live.grade);
      const existing = byKey.get(key);
      const today = new Date().toISOString().slice(0, 10);
      if (!existing) {
        byKey.set(key, {
          cardId: history?.cardId ?? '',
          grader: live.grader,
          grade: live.grade,
          points: [{ date: today, price: live.price, soldListings: live.soldListings }],
          latestPrice: live.price,
        });
      } else {
        const last = existing.points[existing.points.length - 1];
        if (!last || toIsoDate(last.date) !== today) {
          existing.points = [
            ...existing.points,
            { date: today, price: live.price, soldListings: live.soldListings },
          ];
        } else {
          existing.points = [
            ...existing.points.slice(0, -1),
            { date: today, price: live.price, soldListings: live.soldListings },
          ];
        }
        existing.latestPrice = live.price;
      }
    }

    return [...byKey.values()].sort((a, b) => {
      const order = ['psa', 'cgc', 'bgs', 'sgc', 'tag', 'ace'];
      const ai = order.indexOf(a.grader);
      const bi = order.indexOf(b.grader);
      if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.grade.localeCompare(b.grade);
    });
  }, [history, livePrices]);

  const metas: ChartSeriesMeta[] = useMemo(
    () =>
      seriesList.map((s, i) => {
        const key = gradedSeriesKey(s.grader, s.grade);
        return {
          key,
          grader: s.grader,
          grade: s.grade,
          label: seriesDisplayLabel(s.grader, s.grade),
          color: seriesColor(key, i),
          latestPrice: s.latestPrice ?? latestOf(s.points),
          pointCount: s.points.length,
          firstDate: firstDateOf(s.points),
        };
      }),
    [seriesList]
  );

  const [internalEnabled, setInternalEnabled] = useState<Set<GradedSeriesKey>>(() =>
    pickSoloEnabled(metas, focusedKey)
  );
  const lastFocusedKey = React.useRef<GradedSeriesKey | null | undefined>(undefined);

  useEffect(() => {
    if (controlledEnabled) return;
    const focusedChanged = lastFocusedKey.current !== focusedKey;
    lastFocusedKey.current = focusedKey;
    setInternalEnabled((prev) => {
      if (focusedChanged && focusedKey) return new Set([focusedKey]);
      if (prev.size === 0) return pickSoloEnabled(metas, focusedKey);
      const kept = new Set([...prev].filter((key) => metas.some((m) => m.key === key)));
      return kept.size > 0 ? kept : pickSoloEnabled(metas, focusedKey);
    });
  }, [focusedKey, metas, controlledEnabled]);

  const enabled = controlledEnabled ?? internalEnabled;

  const setEnabled = (next: Set<GradedSeriesKey>) => {
    if (onEnabledKeysChange) onEnabledKeysChange(next);
    else setInternalEnabled(next);
  };

  const toggleKey = (key: GradedSeriesKey) => {
    const next = new Set(enabled);
    if (next.has(key)) {
      if (next.size <= 1) return;
      next.delete(key);
    } else {
      next.add(key);
    }
    setEnabled(next);
  };

  const activeMetas = metas.filter((m) => enabled.has(m.key));

  const rangedSeries = useMemo(
    () =>
      seriesList.map((s) => ({
        ...s,
        points: slicePriceHistory(
          s.points.map((p) => ({ ...p, date: toIsoDate(p.date) })),
          range
        ),
      })),
    [seriesList, range]
  );

  const chartData = useMemo(() => {
    const active = rangedSeries.filter((s) => enabled.has(gradedSeriesKey(s.grader, s.grade)));
    if (active.length === 0) return [];

    const firstDates = active
      .map((s) => firstDateOf(s.points))
      .filter((d): d is string => !!d)
      .sort();
    if (firstDates.length === 0) return [];
    const sharedStart = firstDates[firstDates.length - 1];

    const dateSet = new Set<string>();
    for (const s of active) {
      for (const p of s.points) {
        const d = toIsoDate(p.date);
        if (d >= sharedStart) dateSet.add(d);
      }
    }
    const dates = [...dateSet].sort();
    if (dates.length === 0) return [];

    const lookups = new Map<GradedSeriesKey, Map<string, number>>();
    for (const s of active) {
      const key = gradedSeriesKey(s.grader, s.grade);
      const map = new Map<string, number>();
      for (const p of s.points) {
        const d = toIsoDate(p.date);
        if (d >= sharedStart) map.set(d, p.price);
      }
      if (map.size === 0 && s.points.length) {
        map.set(sharedStart, s.points[0].price);
      }
      lookups.set(key, map);
    }

    const carry = new Map<GradedSeriesKey, number>();
    const base = new Map<GradedSeriesKey, number>();
    for (const [key, map] of lookups) {
      const startVal = map.get(sharedStart);
      if (startVal != null) {
        carry.set(key, startVal);
        base.set(key, startVal);
      } else {
        const first = [...map.entries()].sort(([a], [b]) => a.localeCompare(b))[0];
        if (first) {
          carry.set(key, first[1]);
          base.set(key, first[1]);
        }
      }
    }

    return dates.map((date) => {
      const row: Record<string, unknown> = {
        date: new Date(`${date}T12:00:00.000Z`),
      };
      for (const [key, map] of lookups) {
        const quote = map.get(date);
        if (quote != null) carry.set(key, quote);
        const price = carry.get(key);
        if (price == null) continue;
        row[`${key}__price`] = price;
        const origin = base.get(key);
        if (chartMode === 'performance') {
          row[key] = origin && origin > 0 ? ((price - origin) / origin) * 100 : 0;
        } else {
          row[key] = price;
        }
      }
      return row;
    });
  }, [rangedSeries, enabled, chartMode]);

  const yDomain = useMemo(() => {
    const values: number[] = [];
    for (const row of chartData) {
      for (const m of activeMetas) {
        const v = row[m.key];
        if (typeof v === 'number') values.push(v);
      }
    }
    return computeTightChartDomain(values, { includeZero: chartMode === 'performance' });
  }, [chartData, activeMetas, chartMode]);

  const primaryMetas = PRIMARY_KEYS.map((key) => metas.find((m) => m.key === key)).filter(
    (m): m is ChartSeriesMeta => Boolean(m)
  );
  const extraMetas = metas.filter((m) => !PRIMARY_KEYS.includes(m.key as (typeof PRIMARY_KEYS)[number]));
  const visibleExtras = extraMetas.filter((m) => showAllLegend || enabled.has(m.key));
  const hiddenCount = extraMetas.filter((m) => !showAllLegend && !enabled.has(m.key)).length;
  const legendMetas = [...primaryMetas, ...visibleExtras];

  if (metas.length === 0) {
    return (
      <div className="flex h-[140px] flex-col items-center justify-center text-center">
        <p className="text-xs text-ink-secondary">No slab history yet</p>
        <p className="mt-0.5 text-[11px] text-ink-muted">Builds daily from PriceCharting</p>
      </div>
    );
  }

  const tickFormatter = chartMode === 'performance' ? formatAxisPercent : formatCompactAxisPrice;

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h4 className="text-sm font-semibold text-ink-primary">Price History</h4>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg bg-surface-raised p-0.5">
            {(['price', 'performance'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setChartMode(mode)}
                className={cn(
                  'rounded-md px-2 py-1 text-[11px] font-medium',
                  chartMode === mode
                    ? 'bg-surface-hover text-ink-primary'
                    : 'text-ink-muted hover:text-ink-secondary'
                )}
              >
                {mode === 'price' ? 'Price' : 'Performance'}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5">
            {PRICE_RANGES.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRange(key)}
                className={cn(
                  'rounded-md px-1.5 py-1 text-[11px] font-semibold tabular-nums',
                  range === key ? 'text-ink-primary' : 'text-ink-muted hover:text-ink-secondary'
                )}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {legendMetas.map((m) => {
          const on = enabled.has(m.key);
          const focused = focusedKey === m.key;
          const unavailable = m.latestPrice == null;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => toggleKey(m.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-left',
                focused ? 'bg-surface-hover' : 'hover:bg-surface-hover/70'
              )}
              style={{ opacity: on ? 1 : 0.42 }}
              title={unavailable ? 'No recent sales' : on ? 'Hide from chart' : 'Show on chart'}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: on ? m.color : 'transparent',
                  boxShadow: on ? undefined : `inset 0 0 0 1.5px ${m.color}`,
                }}
              />
              <span className="text-xs text-ink-secondary">{m.label}</span>
              <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                {unavailable ? '—' : formatCurrency(m.latestPrice as number)}
              </span>
            </button>
          );
        })}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAllLegend(true)}
            className="rounded-full px-2 py-1 text-xs text-ink-muted hover:text-ink-secondary"
          >
            + {hiddenCount} more
          </button>
        )}
        {showAllLegend && extraMetas.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAllLegend(false)}
            className="rounded-full px-2 py-1 text-xs text-ink-muted hover:text-ink-secondary"
          >
            Less
          </button>
        )}
      </div>

      <div style={{ height }} className="w-full">
        {chartData.length > 0 ? (
          <LineChart
            data={chartData}
            xDataKey="date"
            yDomain={yDomain}
            aspectRatio={undefined}
            style={{ height: '100%', width: '100%' }}
            margin={{ top: 8, right: 8, bottom: 24, left: 44 }}
            className="h-full w-full"
            yDomainTween={false}
          >
            <Grid
              horizontal
              vertical={false}
              numTicksRows={3}
              strokeDasharray="0"
              strokeOpacity={0.28}
            />
            {activeMetas.map((m) => (
              <Line
                key={m.key}
                dataKey={m.key}
                stroke={m.color}
                strokeWidth={focusedKey === m.key || activeMetas.length === 1 ? 2.4 : 1.5}
                curve={curveLinear}
                showMarkers={false}
                fadeEdges={false}
                showHighlight={false}
                animate={false}
              />
            ))}
            <YAxis tickFormatter={tickFormatter} numTicks={3} />
            <XAxis />
            <ChartTooltip
              showDatePill={false}
              showCrosshair
              showDots
              dotSize={3}
              content={({ point }) => {
                const dateLabel = formatTooltipDate(point.date);
                const rows = activeMetas
                  .map((m) => {
                    const plotted = point[m.key];
                    const price = point[`${m.key}__price`];
                    if (typeof plotted !== 'number') return null;
                    const value =
                      chartMode === 'performance'
                        ? formatAxisPercent(plotted)
                        : formatCurrency(typeof price === 'number' ? price : plotted);
                    return { label: m.label, value, color: m.color };
                  })
                  .filter(Boolean) as Array<{ label: string; value: string; color: string }>;

                if (rows.length === 1) {
                  return (
                    <p className="px-3 py-2 text-xs text-ink-primary">
                      {dateLabel} · {rows[0].label} · {rows[0].value}
                    </p>
                  );
                }

                return (
                  <div className="px-3 py-2">
                    <p className="mb-1.5 text-xs text-ink-muted">{dateLabel}</p>
                    <div className="space-y-1">
                      {rows.map((row) => (
                        <p key={row.label} className="text-xs text-ink-primary">
                          {row.label} · {row.value}
                        </p>
                      ))}
                    </div>
                  </div>
                );
              }}
            />
          </LineChart>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-ink-muted">
            Select a grade to plot it
          </div>
        )}
      </div>
    </div>
  );
};
