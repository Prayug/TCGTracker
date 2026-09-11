import React, { useMemo } from 'react';
import { VaultStats, VaultCard } from '../../../types/pokemon';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { cn } from '@/lib/utils';
import { periodChangeExcludingInflows } from '../utils/portfolioSeries';

interface VaultKpiStripProps {
  stats: VaultStats;
  vaultCards: VaultCard[];
  realizedPnl?: number | null;
}

/** Sticky mono value line — replaces the 4-up KPI card strip. */
export const VaultKpiStrip: React.FC<VaultKpiStripProps> = ({ stats, vaultCards, realizedPnl }) => {
  const delta30 = useMemo(() => periodChangeExcludingInflows(vaultCards, '30d'), [vaultCards]);

  const showRealized = realizedPnl != null && Number.isFinite(realizedPnl);

  return (
    <div
      className={cn(
        'sticky top-14 z-20 -mx-1 border border-border-page bg-page/95 px-3 py-2.5 backdrop-blur-md sm:px-4'
      )}
      style={{ borderRadius: 'var(--radius-ui)' }}
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-sm tabular-nums sm:text-[15px]">
        <span className="font-display text-xs font-bold tracking-tight text-ink-primary sm:text-sm">
          TCG Tracker
        </span>
        <span className="text-ink-muted">·</span>
        <span className="font-semibold text-ink-primary">{formatCurrency(stats.currentValue)}</span>
        <span className={cn('font-medium', stats.profit >= 0 ? 'text-gain' : 'text-loss')}>
          {formatPercent(stats.profitPercentage, { signed: true })} P/L
        </span>
        <span className={cn('text-ink-secondary', delta30.dollar >= 0 ? 'text-gain' : 'text-loss')}>
          30d {formatCurrency(delta30.dollar, { signed: true })}
        </span>
        <span className="text-ink-muted">Cost {formatCurrency(stats.totalValue)}</span>
        {showRealized ? (
          <span className={cn(realizedPnl! >= 0 ? 'text-gain' : 'text-loss')}>
            Realized {formatCurrency(realizedPnl!, { signed: true })}
          </span>
        ) : null}
        <span className="text-ink-muted">
          {stats.uniqueCards} unique · {stats.totalCards} total
        </span>
      </div>
    </div>
  );
};
