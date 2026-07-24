import { useMemo } from 'react';

interface MiniSparklineProps {
  data: { price: number }[];
  width?: number;
  height?: number;
  color?: string;
}

export const MiniSparkline: React.FC<MiniSparklineProps> = ({
  data,
  width = 60,
  height = 20,
  color,
}) => {
  const path = useMemo(() => {
    if (data.length < 2) return null;
    const prices = data.map((d) => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const stepX = width / (prices.length - 1);
    return prices
      .map((p, i) => {
        const x = i * stepX;
        const y = height - ((p - min) / range) * (height - 2) - 1;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [data, width, height]);

  if (!path) return null;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
      <path
        d={path}
        fill="none"
        stroke={color || 'var(--gain)'}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
