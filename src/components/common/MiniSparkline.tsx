import React from 'react';

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
        className="flex items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-[10px] text-slate-500"
        style={{ width, height }}
      >
        —
      </div>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
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
