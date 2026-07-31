import React, { useMemo } from 'react';
import { AreaChart } from '@/components/charts/area-chart';
import { Area } from '@/components/charts/area';
import { Grid } from '@/components/charts/grid';
import { XAxis } from '@/components/charts/x-axis';
import { YAxis } from '@/components/charts/y-axis';
import { ChartTooltip } from '@/components/charts/tooltip';
import { PricePoint } from '../../../types/pokemon';
import { preparePriceChartSeries, toIsoDate, ChartPricePoint } from '../../../utils/priceHistory';
import { computePriceChartDomain, formatPriceChange } from '../../../utils/chartDomain';

interface PriceChartProps {
  priceHistory: PricePoint[];
  title?: string;
  /** When false, only plot actual quote days (no weekend carry) */
  fillGaps?: boolean;
  variant?: 'light' | 'dark';
  height?: number;
  compact?: boolean;
}

function quoteDates(points: ChartPricePoint[]): string[] {
  return points.filter((p) => p.hasQuote).map((p) => p.date);
}

function formatAxisPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (price >= 100) return `$${price.toFixed(0)}`;
  if (price >= 10) return `$${price.toFixed(1)}`;
  return `$${price.toFixed(2)}`;
}

export const PriceChart: React.FC<PriceChartProps> = ({
  priceHistory,
  title = 'Price History',
  fillGaps = true,
  height = 260,
  compact = false,
}) => {
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

  const series = useMemo(
    () =>
      chartData
        .filter((p) => p.price !== null)
        .map((p) => ({
          date: new Date(`${p.date}T12:00:00.000Z`),
          price: p.price as number,
          hasQuote: p.hasQuote,
        })),
    [chartData]
  );

  const yDomain = useMemo(
    () => computePriceChartDomain(series.map((p) => p.price)),
    [series]
  );

  if (series.length === 0) {
    return (
      <div className="flex min-h-[16rem] items-center justify-center text-ink-muted">
        No price history available
      </div>
    );
  }

  const formatPrice = formatAxisPrice;

  const firstPrice = series[0]?.price ?? 0;
  const lastPrice = series[series.length - 1]?.price ?? 0;
  const isPositive = lastPrice - firstPrice >= 0;
  const periodChange = formatPriceChange(firstPrice, lastPrice);
  const strokeColor = isPositive ? 'var(--gain)' : 'var(--loss)';

  return (
    <div className="w-full">
      {!compact && (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="font-display text-sm font-semibold text-ink-primary">{title}</h3>
            <p className="mt-0.5 text-xs text-ink-muted">
              {quoteCount} quotes
              {carriedDayCount > 0 ? ` · ${carriedDayCount} carried` : ''}
              {missingSpanCount > 0 ? ` · ${missingSpanCount} gaps` : ''}
              {firstDate && latestDate ? ` · ${firstDate} → ${latestDate}` : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-semibold tabular-nums text-ink-primary">
              {formatPrice(lastPrice)}
            </p>
            <p className={`text-xs font-medium ${isPositive ? 'text-gain' : 'text-loss'}`}>
              {periodChange.label}
            </p>
          </div>
        </div>
      )}

      <div style={{ height }} className="w-full">
        <AreaChart
          data={series}
          xDataKey="date"
          yDomain={yDomain}
          aspectRatio={undefined}
          style={{ height: '100%', width: '100%' }}
          margin={{ top: 12, right: 12, bottom: 28, left: 44 }}
          className="h-full w-full"
        >
          <Grid horizontal vertical={false} />
          <Area
            dataKey="price"
            fill={strokeColor}
            stroke={strokeColor}
            fillOpacity={0.22}
            gradientToOpacity={0}
            strokeWidth={2}
          />
          <YAxis tickFormatter={formatAxisPrice} numTicks={4} />
          <XAxis />
          <ChartTooltip
            rows={(point) => [
              {
                label: 'Price',
                value: formatAxisPrice(Number(point.price) || 0),
                color: strokeColor,
              },
            ]}
          />
        </AreaChart>
      </div>
    </div>
  );
};
