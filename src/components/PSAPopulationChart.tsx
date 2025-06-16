import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { PSAData } from '../types/pokemon';

interface PSAPopulationChartProps {
  psaData: PSAData;
}

export const PSAPopulationChart: React.FC<PSAPopulationChartProps> = ({ psaData }) => {
  const populationData = [
    { grade: 'PSA 10', population: psaData.population.grade10, price: psaData.prices.grade10 },
    { grade: 'PSA 9', population: psaData.population.grade9, price: psaData.prices.grade9 },
    { grade: 'PSA 8', population: psaData.population.grade8, price: psaData.prices.grade8 },
    { grade: 'PSA 7', population: psaData.population.grade7, price: 0 },
  ];

  const pieData = populationData.map(item => ({
    name: item.grade,
    value: item.population,
    percentage: ((item.population / psaData.population.total) * 100).toFixed(1)
  }));

  const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444'];

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 rounded-lg">
          <div className="text-sm text-green-700 font-medium">PSA 10 Population</div>
          <div className="text-2xl font-bold text-green-800">{psaData.population.grade10.toLocaleString()}</div>
          <div className="text-xs text-green-600">
            {psaData.popReport.grade10Percentage.toFixed(1)}% of total
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-lg">
          <div className="text-sm text-blue-700 font-medium">Return Rate (9+)</div>
          <div className="text-2xl font-bold text-blue-800">{psaData.returnRate.toFixed(1)}%</div>
          <div className="text-xs text-blue-600">
            {(psaData.population.grade10 + psaData.population.grade9).toLocaleString()} cards
          </div>
        </div>
      </div>

      {/* Population Distribution */}
      <div>
        <h4 className="text-lg font-semibold mb-3">Population Distribution</h4>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={populationData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="grade" />
              <YAxis />
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

      {/* Grade Distribution Pie Chart */}
      <div>
        <h4 className="text-lg font-semibold mb-3">Grade Distribution</h4>
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
                <span className="text-sm">
                  {entry.name}: {entry.value.toLocaleString()} ({entry.percentage}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Price Comparison */}
      <div>
        <h4 className="text-lg font-semibold mb-3">Price by Grade</h4>
        <div className="grid grid-cols-2 gap-3">
          {populationData.filter(item => item.price > 0).map((item, index) => (
            <div key={item.grade} className="bg-gray-50 p-3 rounded-lg">
              <div className="text-sm text-gray-600">{item.grade}</div>
              <div className="text-xl font-bold text-gray-900">${item.price}</div>
              <div className="text-xs text-gray-500">
                {item.population.toLocaleString()} available
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Investment Insights */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg">
        <h4 className="text-lg font-semibold mb-2 text-purple-800">Investment Insights</h4>
        <div className="space-y-2 text-sm">
          {psaData.popReport.lowPop && (
            <div className="flex items-center gap-2 text-green-700">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              Low population card - potential for price appreciation
            </div>
          )}
          {psaData.returnRate > 50 && (
            <div className="flex items-center gap-2 text-blue-700">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              High return rate - good for raw card investment
            </div>
          )}
          {psaData.popReport.grade10Percentage < 10 && (
            <div className="flex items-center gap-2 text-purple-700">
              <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
              Rare PSA 10 - premium graded examples command high prices
            </div>
          )}
        </div>
      </div>
    </div>
  );
};