import React from 'react';
import { VaultStats } from '../../../types/pokemon';
import { NumberTicker } from '@/components/ui/number-ticker';
import { formatPercent } from '../../../utils/cardDisplay';
import { cn } from '@/lib/utils';

interface VaultSummaryBarProps {
  stats: VaultStats;
}

/**
 * One quiet value line — replaces the four-tile KPI strip.
 * Holdings stay the hero; numbers don't compete for the viewport.
 */
export const VaultSummaryBar: React.FC<VaultSummaryBarProps> = ({ stats }) => {
  const plTrend = stats.profit > 0 ? 'up' : stats.profit < 0 ? 'down' : 'neutral';

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border-subtle pb-4">
      <p className="font-mono text-[clamp(1.75rem,3.5vw,2.35rem)] font-semibold tabular-nums tracking-tight text-ink-primary">
        $
        <NumberTicker value={stats.currentValue} decimalPlaces={2} />
      </p>
      <p
        className={cn(
          'font-mono text-sm tabular-nums',
          plTrend === 'up' && 'text-gain',
          plTrend === 'down' && 'text-loss',
          plTrend === 'neutral' && 'text-ink-muted'
        )}
      >
        {stats.profit >= 0 ? '+' : '−'}$
        <NumberTicker value={Math.abs(stats.profit)} decimalPlaces={2} />
        <span className="ml-1.5 text-ink-muted">
          ({formatPercent(stats.profitPercentage, { signed: true })})
        </span>
      </p>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-muted sm:ml-auto">
        {stats.uniqueCards} unique · {stats.totalCards} cards
      </p>
    </div>
  );
};

/** Alias so existing imports keep working */
export const VaultKpiStrip = VaultSummaryBar;
