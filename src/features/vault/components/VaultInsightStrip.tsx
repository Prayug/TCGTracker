import React, { useMemo } from 'react';
import { ArrowRight, TrendingUp, Wallet, AlertTriangle } from 'lucide-react';
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

  const chipClass =
    'flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border border-border-subtle bg-surface-raised/80 px-3.5 py-3 text-left transition-colors hover:bg-surface-hover/80';

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <button
        type="button"
        className={chipClass}
        onClick={() => onFocusHolding?.(top.id)}
      >
        <Wallet className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Top holding
          </p>
          <p className="truncate text-sm font-medium text-ink-primary">{top.card.name}</p>
          <p className="text-xs tabular-nums text-ink-secondary">
            {formatCurrency(holdingMarketValue(top))}
          </p>
        </div>
      </button>

      {gainer ? (
        <button
          type="button"
          className={chipClass}
          onClick={() => onFocusHolding?.(gainer.id)}
        >
          <TrendingUp className="h-4 w-4 shrink-0 text-gain" aria-hidden />
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
              Biggest gainer
            </p>
            <p className="truncate text-sm font-medium text-ink-primary">{gainer.name}</p>
            <p
              className={cn(
                'text-xs tabular-nums',
                gainer.profitPct >= 0 ? 'text-gain' : 'text-loss'
              )}
            >
              {formatPercent(gainer.profitPct, { signed: true })}
            </p>
          </div>
        </button>
      ) : (
        <div className={cn(chipClass, 'cursor-default opacity-60')} />
      )}

      <button
        type="button"
        className={chipClass}
        onClick={onReviewAssumed}
        disabled={assumedCostCount === 0}
      >
        <AlertTriangle
          className={cn(
            'h-4 w-4 shrink-0',
            assumedCostCount > 0 ? 'text-amber-400' : 'text-ink-muted'
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Assumed market cost
          </p>
          <p className="truncate text-sm font-medium text-ink-primary">
            {assumedCostCount > 0
              ? `${assumedCostCount} holding${assumedCostCount === 1 ? '' : 's'}`
              : 'All set'}
          </p>
          {assumedCostCount > 0 ? (
            <p className="inline-flex items-center gap-1 text-xs text-accent">
              Review <ArrowRight className="h-3 w-3" />
            </p>
          ) : (
            <p className="text-xs text-ink-muted">Purchase prices recorded</p>
          )}
        </div>
      </button>
    </div>
  );
};
