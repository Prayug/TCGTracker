import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { PSAData } from '../../../types/pokemon';

interface PSAPopulationChartProps {
  psaData: PSAData;
}

export const PSAPopulationChart: React.FC<PSAPopulationChartProps> = ({ psaData }) => {
  const total = psaData.population.total || 1;

  const populationData = [
    { grade: 'PSA 10', population: psaData.population.grade10, price: psaData.prices.grade10 },
    { grade: 'PSA 9', population: psaData.population.grade9, price: psaData.prices.grade9 },
    { grade: 'PSA 8', population: psaData.population.grade8, price: psaData.prices.grade8 },
    { grade: 'PSA 7', population: psaData.population.grade7, price: 0 },
  ];

  const pieData = populationData.map(item => ({
    name: item.grade,
    value: item.population,
    percentage: ((item.population / total) * 100).toFixed(1)
  }));

  const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gain-muted p-4 rounded-lg">
          <p className="text-sm text-gain font-medium">PSA 10 Population</p>
          <p className="text-2xl font-bold text-ink-primary">{psaData.population.grade10.toLocaleString()}</p>
          <p className="text-xs text-ink-muted">
            {psaData.popReport.grade10Percentage.toFixed(1)}% of total
          </p>
        </div>

        <div className="bg-accent-muted p-4 rounded-lg">
          <p className="text-sm text-accent font-medium">Return Rate (9+)</p>
          <p className="text-2xl font-bold text-ink-primary">{psaData.returnRate.toFixed(1)}%</p>
          <p className="text-xs text-ink-muted">
            {(psaData.population.grade10 + psaData.population.grade9).toLocaleString()} cards
          </p>
        </div>
      </div>

      <div>
        <h4 className="text-lg font-semibold text-ink-primary mb-3">Population Distribution</h4>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={populationData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="grade" stroke="var(--ink-muted)" />
              <YAxis stroke="var(--ink-muted)" />
              <Tooltip
                formatter={(value: number, name: string) => [
                  name === 'population' ? value.toLocaleString() : `$${value}`,
                  name === 'population' ? 'Population' : 'Price'
                ]}
              />
              <Bar dataKey="population" fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h4 className="text-lg font-semibold text-ink-primary mb-3">Grade Distribution</h4>
        <div className="flex items-center">
          <div className="h-48 w-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Population']} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="ml-6 space-y-2">
            {pieData.map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-sm text-ink-primary">
                  {entry.name}: {entry.value.toLocaleString()} ({entry.percentage}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-lg font-semibold text-ink-primary mb-3">Price by Grade</h4>
        <div className="grid grid-cols-2 gap-3">
          {populationData.filter(item => item.price > 0).map((item) => (
            <div key={item.grade} className="bg-surface-inset p-3 rounded-lg">
              <p className="text-sm text-ink-muted">{item.grade}</p>
              <p className="text-xl font-bold text-ink-primary">${item.price}</p>
              <p className="text-xs text-ink-muted">
                {item.population.toLocaleString()} available
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-accent-muted p-4 rounded-lg">
        <h4 className="text-lg font-semibold mb-2 text-ink-primary">Investment Insights</h4>
        <div className="space-y-2 text-sm">
          {psaData.popReport.lowPop && (
            <div className="flex items-center gap-2 text-gain">
              <span className="w-2 h-2 bg-gain rounded-full" />
              Low population card - potential for price appreciation
            </div>
          )}
          {psaData.returnRate > 50 && (
            <div className="flex items-center gap-2 text-accent">
              <span className="w-2 h-2 bg-accent rounded-full" />
              High return rate - good for raw card investment
            </div>
          )}
          {psaData.popReport.grade10Percentage < 10 && (
            <div className="flex items-center gap-2 text-ink-primary">
              <span className="w-2 h-2 bg-accent rounded-full" />
              Rare PSA 10 - premium graded examples command high prices
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
