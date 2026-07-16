import React, { useId } from 'react';
import { computeSparklineRange } from '../../utils/chartDomain';

interface MiniSparklineProps {
  data: number[];
  width?: number;
  height?: number;
  positive?: boolean;
}

export const MiniSparkline: React.FC<MiniSparklineProps> = ({
  data,
  width = 96,
  height = 32,
  positive = true,
}) => {
  const gradientId = useId();

  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-border-subtle bg-surface-inset text-[10px] text-ink-muted"
        style={{ width, height }}
      >
        —
      </div>
    );
  }

  const { min, max } = computeSparklineRange(data);
  const range = max - min || 1;
  const pad = 2;

  const coords = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return { x, y };
  });
  const points = coords.map(({ x, y }) => `${x},${y}`).join(' ');
  const areaPath = `M ${coords[0].x},${height - pad} L ${coords
    .map(({ x, y }) => `${x},${y}`)
    .join(' L ')} L ${coords[coords.length - 1].x},${height - pad} Z`;

  const stroke = positive ? '#34d399' : '#fb7185';

  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};
