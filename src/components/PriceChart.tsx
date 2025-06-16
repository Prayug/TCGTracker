import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { PricePoint } from '../types/pokemon';

interface PriceChartProps {
  priceHistory: PricePoint[];
  title?: string;
}

export const PriceChart: React.FC<PriceChartProps> = ({ priceHistory, title = "Price History" }) => {
  if (!priceHistory || priceHistory.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-500">
        No price history available
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;

  // Calculate price change
  const firstPrice = priceHistory[0]?.price || 0;
  const lastPrice = priceHistory[priceHistory.length - 1]?.price || 0;
  const priceChange = lastPrice - firstPrice;
  const priceChangePercent = firstPrice > 0 ? (priceChange / firstPrice) * 100 : 0;

  const isPositive = priceChange >= 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-semibold">{title}</h4>
        <div className="text-right">
          <div className="text-2xl font-bold">{formatPrice(lastPrice)}</div>
          <div className={`text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? '+' : ''}{formatPrice(priceChange)} ({isPositive ? '+' : ''}{priceChangePercent.toFixed(1)}%)
          </div>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={priceHistory}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isPositive ? "#10B981" : "#EF4444"} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={isPositive ? "#10B981" : "#EF4444"} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              stroke="#6B7280"
              fontSize={12}
            />
            <YAxis 
              tickFormatter={formatPrice}
              stroke="#6B7280"
              fontSize={12}
            />
            <Tooltip 
              formatter={(value: number) => [formatPrice(value), 'Price']}
              labelFormatter={(label: string) => new Date(label).toLocaleDateString()}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={isPositive ? "#10B981" : "#EF4444"}
              strokeWidth={2}
              fill="url(#priceGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Price Statistics */}
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="text-center">
          <div className="text-gray-600">Min Price</div>
          <div className="font-semibold">
            {formatPrice(Math.min(...priceHistory.map(p => p.price)))}
          </div>
        </div>
        <div className="text-center">
          <div className="text-gray-600">Max Price</div>
          <div className="font-semibold">
            {formatPrice(Math.max(...priceHistory.map(p => p.price)))}
          </div>
        </div>
        <div className="text-center">
          <div className="text-gray-600">Avg Price</div>
          <div className="font-semibold">
            {formatPrice(priceHistory.reduce((sum, p) => sum + p.price, 0) / priceHistory.length)}
          </div>
        </div>
      </div>
    </div>
  );
};