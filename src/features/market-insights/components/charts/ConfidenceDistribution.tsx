import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface Props {
  data: { bucket: string; count: number }[];
}

export function ConfidenceDistribution({ data }: Props) {
  const sorted = [...data].sort((a, b) => {
    const aStart = parseInt(a.bucket.split('-')[0]);
    const bStart = parseInt(b.bucket.split('-')[0]);
    return bStart - aStart;
  });

  if (sorted.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-ink-muted">
        No confidence data
      </div>
    );
  }

  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sorted} barGap={2}>
          <XAxis
            dataKey="bucket"
            tick={{ fill: 'var(--ink-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'var(--ink-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface-raised)',
              border: '1px solid var(--border-default)',
              borderRadius: '12px',
              fontSize: '12px',
              color: 'var(--ink-primary)',
            }}
            formatter={(value: number) => [value, 'Cards']}
          />
          <Bar dataKey="count" fill="var(--accent)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
