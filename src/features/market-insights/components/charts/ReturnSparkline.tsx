import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { CardPrediction, PredictionWindow } from '../../types';

interface Props {
  prediction: CardPrediction;
  window: PredictionWindow;
  width?: number;
  height?: number;
}

function windowData(prediction: CardPrediction, window: PredictionWindow) {
  const windows: { key: PredictionWindow; label: string; low: number; mid: number; high: number }[] = [
    { key: '7d', label: '7d', low: prediction.predicted7dLow, mid: prediction.predicted7dMid, high: prediction.predicted7dHigh },
    { key: '30d', label: '30d', low: prediction.predicted30dLow, mid: prediction.predicted30dMid, high: prediction.predicted30dHigh },
    { key: '90d', label: '90d', low: prediction.predicted90dLow, mid: prediction.predicted90dMid, high: prediction.predicted90dHigh },
  ];
  if (prediction.predicted180dMid != null) {
    windows.push({ key: '180d', label: '180d', low: prediction.predicted180dLow!, mid: prediction.predicted180dMid!, high: prediction.predicted180dHigh! });
  }
  if (prediction.predicted365dMid != null) {
    windows.push({ key: '365d', label: '365d', low: prediction.predicted365dLow!, mid: prediction.predicted365dMid!, high: prediction.predicted365dHigh! });
  }

  const windowIdx = windows.findIndex(w => w.key === window);
  const endIdx = windowIdx >= 0 ? windowIdx + 1 : windows.length;
  return windows.slice(0, endIdx);
}

export function ReturnSparkline({ prediction, window, width = 80, height = 32 }: Props) {
  const data = windowData(prediction, window);
  const currentPrice = prediction.currentPrice;

  const points = [
    { name: 'now', price: currentPrice },
    ...data.map(w => ({ name: w.label, price: w.mid })),
  ];

  const prices = points.map(p => p.price);
  const min = Math.min(...prices) * 0.98;
  const max = Math.max(...prices) * 1.02;
  const domain = min === max ? [min * 0.9, min * 1.1] : [min, max];

  const lastPrice = points[points.length - 1]?.price ?? currentPrice;
  const isUp = lastPrice >= currentPrice;
  const strokeColor = isUp ? 'var(--gain)' : 'var(--loss)';

  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={points}>
        <YAxis domain={domain} hide />
        <Line
          type="monotone"
          dataKey="price"
          stroke={strokeColor}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
