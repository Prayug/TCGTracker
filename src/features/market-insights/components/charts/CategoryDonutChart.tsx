import { useMemo } from 'react';
import { PieChart } from '@/components/charts/pie-chart';
import { PieSlice } from '@/components/charts/pie-slice';
import { PieCenter } from '@/components/charts/pie-center';
import { CATEGORY_LABELS } from '../../types';

interface Props {
  data: Record<string, number>;
}

const COLORS: Record<string, string> = {
  strong_buy: '#3d9b6e',
  watch_dip: '#5a9bb8',
  recovery: '#c4a35a',
  momentum: '#d4b56a',
  stagnant: '#8b8798',
  avoid: '#c45c6a',
  downtrend: '#a8894a',
};

export function CategoryDonutChart({ data }: Props) {
  const chartData = useMemo(
    () =>
      Object.entries(data)
        .filter(([, count]) => count > 0)
        .map(([key, count]) => ({
          label: CATEGORY_LABELS[key as keyof typeof CATEGORY_LABELS] || key,
          value: count,
          color: COLORS[key] || '#8b8798',
        }))
        .sort((a, b) => b.value - a.value),
    [data]
  );

  if (chartData.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-ink-muted">
        No category data
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto h-48 w-48">
        <PieChart data={chartData} innerRadius={52} padAngle={0.02} className="h-full w-full">
          <PieSlice />
          <PieCenter defaultLabel="cards" />
        </PieChart>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
        {chartData.map((entry) => (
          <div key={entry.label} className="flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
            <span>{entry.label}</span>
            <span className="font-mono text-ink-secondary">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
