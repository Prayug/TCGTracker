import React, { useMemo, useId } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
  Line,
} from 'recharts';
import { PricePoint } from '../../../types/pokemon';
import { preparePriceChartSeries, toIsoDate, ChartPricePoint } from '../../../utils/priceHistory';
import { computePriceChartDomain, formatPriceChange } from '../../../utils/chartDomain';
import { useTheme } from '../../../hooks/useTheme';

interface PriceChartProps {
  priceHistory: PricePoint[];
  title?: string;
  /** When false, only plot actual quote days (no weekend carry) */
  fillGaps?: boolean;
  variant?: 'light' | 'dark';
  height?: number;
  compact?: boolean;
}

function formatShortDate(dateStr: string): string {
  if (!dateStr.includes('-')) return dateStr;
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatFullDate(dateStr: string): string {
  if (!dateStr.includes('-')) return dateStr;
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function quoteDates(points: ChartPricePoint[]): string[] {
  return points.filter((p) => p.hasQuote).map((p) => p.date);
}

export const PriceChart: React.FC<PriceChartProps> = ({
  priceHistory,
  title = 'Price History',
  fillGaps = true,
  variant,
  height = 260,
  compact = false,
}) => {
  const { theme } = useTheme();
  const isDark = (variant ?? theme) === 'dark';
  const gradientId = useId().replace(/:/g, '');

  const { chartData, quoteCount, carriedDayCount, missingSpanCount, firstDate, latestDate } =
    useMemo(() => {
      if (!priceHistory?.length) {
        return {
          chartData: [] as ChartPricePoint[],
          quoteCount: 0,
          carriedDayCount: 0,
          missingSpanCount: 0,
          firstDate: '',
          latestDate: '',
        };
      }

      const normalized = [...priceHistory]
        .map((p) => ({ date: toIsoDate(p.date), price: p.price }))
        .filter((p) => p.price > 0);

      const prepared = fillGaps
        ? preparePriceChartSeries(normalized)
        : preparePriceChartSeries(normalized, { maxCarryGapDays: 0 });

      const quotes = quoteDates(prepared.points);

      return {
        chartData: prepared.points,
        quoteCount: prepared.quoteCount,
        carriedDayCount: prepared.carriedDayCount,
        missingSpanCount: prepared.missingSpanCount,
        firstDate: quotes[0] ?? '',
        latestDate: quotes[quotes.length - 1] ?? '',
      };
    }, [priceHistory, fillGaps]);

  const plottable = chartData.filter((p) => p.price !== null);

  if (plottable.length === 0) {
    return (
      <div
        className={`flex min-h-[16rem] items-center justify-center ${isDark ? 'text-ink-muted' : 'text-ink-muted'}`}
      >
        No price history available
      </div>
    );
  }

  const formatPrice = (price: number) => {
    if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (price >= 100) return `$${price.toFixed(0)}`;
    return `$${price.toFixed(2)}`;
  };

  const firstQuote = chartData.find((p) => p.hasQuote);
  const lastQuote = [...chartData].reverse().find((p) => p.hasQuote);
  const firstPrice = firstQuote?.price ?? 0;
  const lastPrice = lastQuote?.price ?? 0;
  const isPositive = lastPrice - firstPrice >= 0;
  const periodChange = formatPriceChange(firstPrice, lastPrice);
  const yDomain = computePriceChartDomain(plottable.map((d) => d.price as number));
  const strokeColor = isPositive ? '#34d399' : '#fb7185';
  const carryColor = isDark ? '#6b6b76' : '#a8a8a0';
  const gridColor = isDark ? '#2a2a2e' : '#e4e4e0';
  const tickColor = isDark ? '#6b6b76' : '#71717a';

  const showAllXTicks = quoteCount <= 10;
  const xInterval = showAllXTicks ? 0 : Math.max(0, Math.floor(chartData.length / 6) - 1);

  const renderQuoteDot = (props: { cx?: number; cy?: number; payload?: ChartPricePoint }) => {
    const { cx, cy, payload } = props;
    if (!payload?.hasQuote || cx == null || cy == null) return null;
    return (
      <circle
        key={`quote-dot-${payload.date}`}
        cx={cx}
        cy={cy}
        r={3}
        fill={strokeColor}
        stroke="none"
      />
    );
  };

  return (
    <div className={compact ? 'min-w-0' : 'space-y-3'}>
      {!compact && (
        <>
          <div
            className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
              isDark ? 'border-border-subtle bg-surface-inset' : 'border-border-default bg-surface-raised'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`h-4 w-4 ${isDark ? 'text-emerald-400' : 'text-ink-muted'}`}>📅</span>
              <div>
                <p
                  className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-ink-muted' : 'text-ink-muted'}`}
                >
                  Quote span
                </p>
                <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {formatFullDate(firstDate)}
                  <span className={`mx-1.5 ${isDark ? 'text-ink-muted' : 'text-ink-muted'}`}>→</span>
                  {formatFullDate(latestDate)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p
                className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-ink-muted' : 'text-ink-muted'}`}
              >
                Latest quote
              </p>
              <p className={`text-sm font-bold tabular-nums ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                {formatPrice(lastPrice)}
                <span className={`ml-2 text-xs font-medium ${isDark ? 'text-ink-muted' : 'text-ink-muted'}`}>
                  {formatShortDate(latestDate)}
                </span>
              </p>
              {quoteCount > 1 && firstPrice > 0 && (
                <p
                  className={`mt-0.5 text-xs font-medium tabular-nums ${
                    isPositive
                      ? isDark
                        ? 'text-emerald-400/80'
                        : 'text-emerald-600'
                      : isDark
                        ? 'text-rose-400/80'
                        : 'text-rose-600'
                  }`}
                >
                  {periodChange.label}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className={`text-xs ${isDark ? 'text-ink-muted' : 'text-ink-muted'}`}>
              <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: strokeColor }} />
              <span className="ml-1.5">
                {quoteCount} market {quoteCount === 1 ? 'quote' : 'quotes'}
              </span>
            </p>
            {carriedDayCount > 0 && (
              <p className={`text-xs ${isDark ? 'text-ink-muted' : 'text-ink-muted'}`}>
                <span
                  className="inline-block w-4 border-t border-dashed align-middle"
                  style={{ borderColor: carryColor }}
                />
                <span className="ml-1.5">{carriedDayCount} weekend carry day{carriedDayCount === 1 ? '' : 's'}</span>
              </p>
            )}
            {missingSpanCount > 0 && (
              <p className={`text-xs ${isDark ? 'text-amber-400/90' : 'text-amber-700'}`}>
                {missingSpanCount} gap{missingSpanCount === 1 ? '' : 's'} without snapshots (line breaks — not flat
                price)
              </p>
            )}
          </div>
        </>
      )}

      {compact && (
        <p className="mb-2.5 text-xs text-ink-muted">
          {formatShortDate(firstDate)} – {formatShortDate(latestDate)} · {quoteCount} market{' '}
          {quoteCount === 1 ? 'quote' : 'quotes'}
          {missingSpanCount > 0 && (
            <span className="text-amber-500/90"> · {missingSpanCount} unsynced gap{missingSpanCount === 1 ? '' : 's'}</span>
          )}
        </p>
      )}

      <div className="w-full min-w-0" style={{ height }}>
        <ResponsiveContainer width="100%" height={height} debounce={50}>
          <ComposedChart
            data={chartData}
            margin={{ top: 12, right: 8, left: 4, bottom: showAllXTicks ? 52 : 32 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={strokeColor} stopOpacity={0.35} />
                <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              stroke={tickColor}
              tick={{ fill: tickColor, fontSize: 11 }}
              interval={xInterval}
              angle={showAllXTicks ? -32 : 0}
              textAnchor={showAllXTicks ? 'end' : 'middle'}
              height={showAllXTicks ? 52 : 32}
              tickLine={false}
              axisLine={{ stroke: isDark ? '#475569' : '#cbd5e1' }}
            />
            <YAxis
              tickFormatter={formatPrice}
              stroke={tickColor}
              tick={{ fill: tickColor, fontSize: 11 }}
              domain={yDomain}
              width={64}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length || !label) return null;
                const row = payload[0]?.payload as ChartPricePoint | undefined;
                if (!row || row.price == null) return null;

                let detail = 'Market quote';
                if (row.kind === 'carried') {
                  detail = 'No snapshot this day — prior quote carried (e.g. weekend)';
                }

                return (
                  <div
                    className={`rounded-lg border px-3 py-2 text-sm shadow-lg ${
                      isDark ? 'border-border-default bg-[#141c2b] text-ink-primary' : 'border-slate-200 bg-white text-slate-900'
                    }`}
                  >
                    <p className={`text-xs ${isDark ? 'text-ink-muted' : 'text-ink-muted'}`}>
                      {formatFullDate(String(label))}
                    </p>
                    <p className="mt-0.5 font-bold tabular-nums">{formatPrice(row.price)}</p>
                    <p className={`mt-1 text-[11px] ${isDark ? 'text-ink-muted' : 'text-ink-muted'}`}>{detail}</p>
                  </div>
                );
              }}
            />
            {/* Solid area + line for quotes and short carries */}
            <Area
              type="monotone"
              dataKey="price"
              stroke={strokeColor}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              connectNulls={false}
              dot={renderQuoteDot}
              activeDot={(props: { cx?: number; cy?: number; payload?: ChartPricePoint }) => {
                const { cx, cy, payload } = props;
                if (!payload?.hasQuote || cx == null || cy == null) return null;
                return (
                  <circle
                    key={`active-dot-${payload.date}`}
                    cx={cx}
                    cy={cy}
                    r={5}
                    fill={strokeColor}
                    stroke={isDark ? '#141c2b' : '#fff'}
                    strokeWidth={2}
                  />
                );
              }}
            />
            {/* Dashed overlay for carried (non-quote) days */}
            <Line
              type="monotone"
              dataKey="carryPrice"
              stroke={carryColor}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
