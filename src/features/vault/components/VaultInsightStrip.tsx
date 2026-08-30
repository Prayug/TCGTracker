import React, { useMemo } from 'react';
import { TrendingUp, Wallet, AlertTriangle } from 'lucide-react';
import { VaultCard } from '../../../types/pokemon';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { buildHoldings } from '../utils/portfolioSeries';
import { holdingMarketValue } from '../../../utils/vaultCost';
import { cn } from '@/lib/utils';

interface VaultInsightStripProps {
  vaultCards: VaultCard[];
  assumedCostCount: number;
  onReviewAssumed?: () => void;
  onFocusHolding?: (id: string) => void;
}

export const VaultInsightStrip: React.FC<VaultInsightStripProps> = ({
  vaultCards,
  assumedCostCount,
  onReviewAssumed,
  onFocusHolding,
}) => {
  const { top, gainer } = useMemo(() => {
    if (vaultCards.length === 0) return { top: null, gainer: null };
    const byMarket = [...vaultCards].sort(
      (a, b) => holdingMarketValue(b) - holdingMarketValue(a)
    );
    const holdings = buildHoldings(vaultCards);
    const userSet = holdings.filter((h) => !h.assumedCost);
    const pool = userSet.length > 0 ? userSet : holdings;
    const best = [...pool].sort((a, b) => b.profitPct - a.profitPct)[0] ?? null;
    return { top: byMarket[0] ?? null, gainer: best };
  }, [vaultCards]);

  if (!top) return null;

  return (
    <div className="flex min-h-[52px] flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl border border-border-subtle bg-surface-raised/70 px-3.5 py-2 text-sm">
      <button
        type="button"
        className="inline-flex min-w-0 max-w-full cursor-pointer items-center gap-2 text-left"
        onClick={() => onFocusHolding?.(top.id)}
      >
        <Wallet className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          Top holding
        </span>
        <span className="truncate font-medium text-ink-primary">{top.card.name}</span>
        <span className="shrink-0 tabular-nums text-ink-secondary">
          · {formatCurrency(holdingMarketValue(top))}
        </span>
      </button>

      {gainer ? (
        <button
          type="button"
          className="inline-flex min-w-0 max-w-full cursor-pointer items-center gap-2 text-left"
          onClick={() => onFocusHolding?.(gainer.id)}
        >
          <TrendingUp className="h-3.5 w-3.5 shrink-0 text-gain" aria-hidden />
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Best mover
          </span>
          <span className="truncate font-medium text-ink-primary">{gainer.name}</span>
          <span
            className={cn(
              'shrink-0 tabular-nums',
              gainer.profitPct >= 0 ? 'text-gain' : 'text-loss'
            )}
          >
            · {formatPercent(gainer.profitPct, { signed: true })}
          </span>
        </button>
      ) : null}

      <button
        type="button"
        className="ml-auto inline-flex cursor-pointer items-center gap-2 disabled:cursor-default"
        onClick={onReviewAssumed}
        disabled={assumedCostCount === 0}
      >
        <AlertTriangle
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            assumedCostCount > 0 ? 'text-amber-400' : 'text-ink-muted'
          )}
          aria-hidden
        />
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          Pricing
        </span>
        <span className="text-ink-secondary">
          {assumedCostCount > 0
            ? `Market prices assumed · ${assumedCostCount}`
            : 'Purchase prices recorded'}
        </span>
      </button>
    </div>
  );
};
