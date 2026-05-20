import React from 'react';
import { Layers, TrendingUp, Wallet } from 'lucide-react';
import { VaultStats } from '../../types/pokemon';
import { formatCurrency, formatPercent } from '../../utils/cardDisplay';
import { PortfolioMetricCard } from './PortfolioMetricCard';

interface PortfolioSnapshotProps {
  stats: VaultStats;
  /** Optional daily P/L when price history is wired up */
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
    dailyChange === null || dailyChange === 0
      ? 'neutral'
      : dailyChange > 0
        ? 'up'
        : 'down';

  const dailyDisplay =
    dailyChange === null
      ? '—'
      : formatCurrency(dailyChange, { signed: true });

  return (
    <div className={className}>
      <PortfolioMetricCard
        label="Market Value"
        value={formatCurrency(stats.currentValue)}
        subValue={
          stats.totalValue > 0
            ? `Cost basis ${formatCurrency(stats.totalValue)}`
            : 'Add cards to your vault'
        }
        trend="neutral"
        size="hero"
        icon={Wallet}
        className="col-span-2 border-violet-500/20 shadow-[0_0_32px_rgba(139,92,246,0.12)]"
      />

      <PortfolioMetricCard
        label="Total P/L"
        value={formatCurrency(stats.profit, { signed: true })}
        subValue={formatPercent(stats.profitPercentage, { signed: true })}
        trend={plTrend}
        icon={TrendingUp}
      />

      <PortfolioMetricCard
        label="Daily Gain/Loss"
        value={dailyDisplay}
        subValue={dailyChange === null ? 'Requires price history' : 'Last 24h'}
        trend={dailyTrend}
      />

      <PortfolioMetricCard
        label="Cards Tracked"
        value={String(stats.totalCards)}
        subValue={stats.totalCards === 1 ? '1 unique holding' : `${stats.totalCards} in vault`}
        trend="neutral"
        icon={Layers}
      />
    </div>
  );
};
