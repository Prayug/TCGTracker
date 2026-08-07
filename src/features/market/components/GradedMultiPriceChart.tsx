import React, { useEffect, useMemo, useState } from 'react';
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

export type GradedSeriesKey = string; // `${grader}::${grade}`

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

/** Distinct vault-palette colors per common slab series. */
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

const PREFERRED_ON = new Set(['psa::10', 'cgc::10', 'bgs::10']);

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

function pickDefaultEnabled(metas: ChartSeriesMeta[]): Set<GradedSeriesKey> {
  const preferred = metas.filter((m) => PREFERRED_ON.has(m.key) && m.latestPrice != null);
  if (preferred.length > 0) {
    // Drop extreme outliers so Black Label doesn't flatten everyone else.
    const prices = preferred.map((m) => m.latestPrice as number).sort((a, b) => a - b);
    const median = prices[Math.floor(prices.length / 2)];
    const enabled = new Set<GradedSeriesKey>();
    for (const m of preferred) {
      if (m.latestPrice != null && m.latestPrice <= median * 4) {
        enabled.add(m.key);
      }
    }
    if (enabled.size > 0) return enabled;
  }

  return new Set(
    metas
      .filter((m) => m.latestPrice != null)
      .sort((a, b) => (a.latestPrice ?? 0) - (b.latestPrice ?? 0))
      .slice(0, 4)
      .map((m) => m.key)
  );
}

function formatAxisPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (price >= 100) return `$${price.toFixed(0)}`;
  if (price >= 10) return `$${price.toFixed(1)}`;
  return `$${price.toFixed(2)}`;
}

interface GradedMultiPriceChartProps {
  history: AllGradedPriceHistoryResult | null;
  /** Live slab quotes — used to seed today's point when history is thin. */
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
  height = 220,
  enabledKeys: controlledEnabled,
  onEnabledKeysChange,
  focusedKey,
  onFocusKey,
}) => {
  const seriesList: GradedPriceHistorySeries[] = useMemo(() => {
    const fromApi = (history?.series ?? []).filter((s) => isGradedSeries(s.grader));
    const byKey = new Map(fromApi.map((s) => [gradedSeriesKey(s.grader, s.grade), { ...s, points: [...s.points] }]));

    // Seed missing latest points from live graded_prices cache (slabs only).
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
    pickDefaultEnabled(metas)
  );

  useEffect(() => {
    if (controlledEnabled) return;
    setInternalEnabled(pickDefaultEnabled(metas));
  }, [metas, controlledEnabled]);

  const enabled = controlledEnabled ?? internalEnabled;

  const setEnabled = (next: Set<GradedSeriesKey>) => {
    if (onEnabledKeysChange) onEnabledKeysChange(next);
    else setInternalEnabled(next);
  };

  const toggleKey = (key: GradedSeriesKey) => {
    const next = new Set(enabled);
    if (next.has(key)) {
      if (next.size <= 1) return; // keep at least one line
      next.delete(key);
    } else {
      next.add(key);
    }
    setEnabled(next);
    onFocusKey?.(key);
  };

  const activeMetas = metas.filter((m) => enabled.has(m.key));

  const chartData = useMemo(() => {
    const active = seriesList.filter((s) => enabled.has(gradedSeriesKey(s.grader, s.grade)));
    if (active.length === 0) return [];

    // Align all lines to a shared window: start when every enabled series has data
    // (avoids months of empty/flat stretch when one series is older than the rest).
    const firstDates = active
      .map((s) => firstDateOf(s.points))
      .filter((d): d is string => !!d)
      .sort();
    if (firstDates.length === 0) return [];
    const sharedStart = firstDates[firstDates.length - 1]; // max of mins

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
      // If a series' first quote is after sharedStart (shouldn't happen with max-of-mins),
      // seed with its first available quote for forward-fill.
      if (map.size === 0 && s.points.length) {
        map.set(sharedStart, s.points[0].price);
      }
      lookups.set(key, map);
    }

    const carry = new Map<GradedSeriesKey, number>();
    // Seed carry with each series' value on/before sharedStart so day-one isn't undefined.
    for (const [key, map] of lookups) {
      const startVal = map.get(sharedStart);
      if (startVal != null) carry.set(key, startVal);
      else {
        const first = [...map.entries()].sort(([a], [b]) => a.localeCompare(b))[0];
        if (first) carry.set(key, first[1]);
      }
    }

    return dates.map((date) => {
      const row: Record<string, unknown> = {
        date: new Date(`${date}T12:00:00.000Z`),
      };
      for (const [key, map] of lookups) {
        const quote = map.get(date);
        if (quote != null) {
          carry.set(key, quote);
          row[key] = quote;
        } else if (carry.has(key)) {
          row[key] = carry.get(key);
        }
      }
      return row;
    });
  }, [seriesList, enabled]);

  if (metas.length === 0) {
    return (
      <div className="flex h-[160px] flex-col items-center justify-center text-center">
        <div className="mb-2 h-px w-24 bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
        <p className="text-xs text-ink-secondary">No slab history yet</p>
        <p className="mt-0.5 text-[11px] text-ink-muted">Builds daily from PriceCharting</p>
      </div>
    );
  }

  const sparse = chartData.length <= 2;

  return (
    <div className="w-full">
      <div style={{ height }} className="w-full">
        {chartData.length > 0 ? (
          <LineChart
            data={chartData}
            xDataKey="date"
            aspectRatio={undefined}
            style={{ height: '100%', width: '100%' }}
            margin={{ top: 12, right: 12, bottom: 28, left: 48 }}
            className="h-full w-full"
            yDomainTween={false}
          >
            <Grid horizontal vertical={false} />
            {activeMetas.map((m) => (
              <Line
                key={m.key}
                dataKey={m.key}
                stroke={m.color}
                strokeWidth={focusedKey === m.key ? 2.75 : 2}
                showMarkers={sparse || focusedKey === m.key}
                fadeEdges={false}
                showHighlight={false}
                animate={false}
              />
            ))}
            <YAxis tickFormatter={formatAxisPrice} numTicks={4} />
            <XAxis />
            <ChartTooltip
              rows={(point) =>
                activeMetas
                  .map((m) => {
                    const v = point[m.key];
                    if (typeof v !== 'number') return null;
                    return {
                      label: m.label,
                      value: formatAxisPrice(v),
                      color: m.color,
                    };
                  })
                  .filter(Boolean) as Array<{ label: string; value: string; color: string }>
              }
            />
          </LineChart>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-ink-muted">
            Toggle a grade below to plot it
          </div>
        )}
      </div>

      {sparse && (
        <p className="mt-1 text-center text-[11px] text-ink-muted">
          History is young — nightly scrapes thicken these lines.
        </p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {metas.map((m) => {
          const on = enabled.has(m.key);
          const focused = focusedKey === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => toggleKey(m.key)}
              onDoubleClick={() => onFocusKey?.(m.key)}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                focused ? 'bg-accent-muted' : 'hover:bg-surface-hover'
              }`}
              title={on ? 'Click to hide · double-click to focus' : 'Click to show on chart'}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{
                  backgroundColor: on ? m.color : 'transparent',
                  boxShadow: on ? undefined : `inset 0 0 0 1.5px ${m.color}`,
                  opacity: on ? 1 : 0.45,
                }}
              />
              <span
                className={`min-w-0 flex-1 truncate text-xs ${
                  on
                    ? focused
                      ? 'font-semibold text-ink-primary'
                      : 'text-ink-secondary'
                    : 'text-ink-muted line-through'
                }`}
              >
                {m.label}
              </span>
              <span
                className={`shrink-0 font-mono text-xs tabular-nums ${
                  on ? 'text-ink-primary' : 'text-ink-muted line-through'
                }`}
              >
                {m.latestPrice != null ? formatCurrency(m.latestPrice) : '—'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
