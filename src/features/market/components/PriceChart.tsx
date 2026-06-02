import React from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { PricePoint } from '../../../types/pokemon';

interface PriceChartProps {
  priceHistory: PricePoint[];
  title?: string;
}

export const PriceChart: React.FC<PriceChartProps> = ({ priceHistory, title = "Price History" }) => {
  if (!priceHistory || priceHistory.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500">
        No price history available
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr.includes('-')) return dateStr;
    const normalized = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const [year, month, day] = normalized.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  };

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;

  // Calculate price change
  const firstPrice = priceHistory[0]?.price || 0;
  const lastPrice = priceHistory[priceHistory.length - 1]?.price || 0;
  const priceChange = lastPrice - firstPrice;
  const priceChangePercent = firstPrice > 0 ? (priceChange / firstPrice) * 100 : 0;

  const isPositive = priceChange >= 0;
  const toIsoDate = (value: string) => (value.includes('T') ? value.split('T')[0] : value);
  const sorted = [...priceHistory].sort(
    (a, b) => new Date(toIsoDate(a.date)).getTime() - new Date(toIsoDate(b.date)).getTime()
  );
  const firstDate = new Date(`${toIsoDate(sorted[0].date)}T00:00:00Z`);
  const lastDate = new Date(`${toIsoDate(sorted[sorted.length - 1].date)}T00:00:00Z`);
  const byDate = new Map(sorted.map((point) => [toIsoDate(point.date), point.price]));
  const expandedData: Array<{ date: string; price: number | null }> = [];
  const cursor = new Date(firstDate);
  while (cursor <= lastDate) {
    const key = cursor.toISOString().slice(0, 10);
    expandedData.push({ date: key, price: byDate.has(key) ? (byDate.get(key) as number) : null });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const missingDays = expandedData.filter((point) => point.price === null).length;
  const hasSparseData = missingDays > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{title} ({priceHistory.length} points)</p>
        {hasSparseData && (
          <p className="text-xs text-amber-700">
            Sparse data: {missingDays} missing day{missingDays === 1 ? '' : 's'}
          </p>
        )}
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={expandedData}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isPositive ? "#10B981" : "#EF4444"} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={isPositive ? "#10B981" : "#EF4444"} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              stroke="#64748b"
              fontSize={12}
            />
            <YAxis 
              tickFormatter={formatPrice}
              stroke="#64748b"
              fontSize={12}
            />
            <Tooltip 
              formatter={(value: number | null) => [
                typeof value === 'number' ? formatPrice(value) : 'No data',
                'Price',
              ]}
              labelFormatter={(label: string) => {
                if (!label.includes('-')) return label;
                const [year, month, day] = label.split('-').map(Number);
                const date = new Date(Date.UTC(year, month - 1, day));
                return date.toLocaleDateString('en-US', { timeZone: 'UTC' });
              }}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
            />
            <Area
              type="linear"
              dataKey="price"
              stroke={isPositive ? "#10B981" : "#EF4444"}
              strokeWidth={2}
              fill="url(#priceGradient)"
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};