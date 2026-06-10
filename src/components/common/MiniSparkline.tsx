import React from 'react';
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

  const points = data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (width - pad * 2);
      const y = pad + (1 - (v - min) / range) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const stroke = positive ? '#34d399' : '#fb7185';

  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden="true">
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
