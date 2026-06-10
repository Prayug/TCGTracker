import React from 'react';
import { Layers, TrendingUp, Wallet } from 'lucide-react';
import { VaultStats } from '../../types/pokemon';
import { formatCurrency, formatPercent } from '../../utils/cardDisplay';
import { PortfolioMetricCard } from './PortfolioMetricCard';

interface PortfolioSnapshotProps {
  stats: VaultStats;
  dailyChange?: number | null;
  className?: string;
}

export const PortfolioSnapshot: React.FC<PortfolioSnapshotProps> = ({
  stats,
  dailyChange = null,
  className = '',
}) => {
  const plTrend = stats.profit >= 0 ? 'up' : 'down';
  const dailyTrend =
    dailyChange === null || dailyChange === 0 ? 'neutral' : dailyChange > 0 ? 'up' : 'down';

  const dailyDisplay = dailyChange === null ? '—' : formatCurrency(dailyChange, { signed: true });

  return (
    <div className={`grid grid-cols-2 gap-3 ${className}`}>
      <PortfolioMetricCard
        label="Market value"
        value={formatCurrency(stats.currentValue)}
        subValue={
          stats.totalValue > 0
            ? `Cost ${formatCurrency(stats.totalValue)}`
            : 'No cards in vault'
        }
        trend="neutral"
        size="hero"
        icon={Wallet}
        className="col-span-2"
      />

      <PortfolioMetricCard
        label="Total P/L"
        value={formatCurrency(stats.profit, { signed: true })}
        subValue={formatPercent(stats.profitPercentage, { signed: true })}
        trend={plTrend}
        icon={TrendingUp}
      />

      <PortfolioMetricCard
        label="Daily change"
        value={dailyDisplay}
        subValue={dailyChange === null ? 'No history yet' : 'Last 24h'}
        trend={dailyTrend}
      />

      <PortfolioMetricCard
        label="Cards"
        value={String(stats.totalCards)}
        subValue={stats.totalCards === 1 ? '1 in vault' : `${stats.totalCards} in vault`}
        trend="neutral"
        icon={Layers}
        className="col-span-2"
      />
    </div>
  );
};
