import React, { useMemo } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { Calendar } from 'lucide-react';
import { PricePoint } from '../../../types/pokemon';
import { fillPriceHistoryGaps, toIsoDate } from '../../../utils/priceHistory';

interface PriceChartProps {
  priceHistory: PricePoint[];
  title?: string;
  fillGaps?: boolean;
  variant?: 'light' | 'dark';
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

export const PriceChart: React.FC<PriceChartProps> = ({
  priceHistory,
  title = 'Price History',
  fillGaps = true,
  variant = 'dark',
}) => {
  const isDark = variant === 'dark';

  const { chartData, filledDayCount, rawPointCount, latestDate, firstDate } = useMemo(() => {
    if (!priceHistory?.length) {
      return {
        chartData: [],
        filledDayCount: 0,
        rawPointCount: 0,
        latestDate: '',
        firstDate: '',
      };
    }

    const normalized = [...priceHistory]
      .map((p) => ({ date: toIsoDate(p.date), price: p.price }))
      .filter((p) => p.price > 0)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const series = fillGaps ? fillPriceHistoryGaps(normalized).points : normalized;
    const filled = fillGaps ? fillPriceHistoryGaps(normalized).filledDayCount : 0;

    return {
      chartData: series,
      filledDayCount: filled,
      rawPointCount: normalized.length,
      firstDate: series[0]?.date ?? '',
      latestDate: series[series.length - 1]?.date ?? '',
    };
  }, [priceHistory, fillGaps]);

  if (chartData.length === 0) {
    return (
      <div className={`flex h-64 items-center justify-center ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
        No price history available
      </div>
    );
  }

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  const firstPrice = chartData[0]?.price || 0;
  const lastPrice = chartData[chartData.length - 1]?.price || 0;
  const isPositive = lastPrice - firstPrice >= 0;
  const strokeColor = isPositive ? '#34d399' : '#fb7185';
  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const tickColor = isDark ? '#94a3b8' : '#64748b';

  const showAllXTicks = chartData.length <= 10;
  const xInterval = showAllXTicks ? 0 : Math.max(0, Math.floor(chartData.length / 6) - 1);

  return (
    <div className="space-y-3">
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
          isDark ? 'border-white/10 bg-white/[0.04]' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <div className="flex items-center gap-2">
          <Calendar className={`h-4 w-4 ${isDark ? 'text-emerald-400' : 'text-slate-500'}`} />
          <div>
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
              Date range
            </p>
            <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {formatFullDate(firstDate)}
              <span className={`mx-1.5 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>→</span>
              {formatFullDate(latestDate)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
            Latest quote
          </p>
          <p className={`text-sm font-bold tabular-nums ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
            {formatPrice(lastPrice)}
            <span className={`ml-2 text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {formatShortDate(latestDate)}
            </span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
          {title} · {rawPointCount} market {rawPointCount === 1 ? 'quote' : 'quotes'}
        </p>
        {filledDayCount > 0 && (
          <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
            {filledDayCount} gap day{filledDayCount === 1 ? '' : 's'} carried at prior price
          </p>
        )}
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 12, right: 8, left: 4, bottom: showAllXTicks ? 8 : 4 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
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
              domain={['auto', 'auto']}
              width={56}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(value: number) => [formatPrice(value), 'Price']}
              labelFormatter={(label: string) => formatFullDate(String(label))}
              contentStyle={
                isDark
                  ? {
                      backgroundColor: '#0f1624',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '8px',
                      color: '#e2e8f0',
                    }
                  : {
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                    }
              }
              labelStyle={isDark ? { color: '#94a3b8' } : undefined}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={strokeColor}
              strokeWidth={2}
              fill="url(#priceGradient)"
              dot={{ fill: strokeColor, strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5, fill: strokeColor, stroke: isDark ? '#0f1624' : '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
