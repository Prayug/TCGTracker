import React, { useMemo } from 'react';
import { Layers, ChevronRight } from 'lucide-react';
import { VaultCard } from '../../../types/pokemon';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { effectiveCostBasis, holdingMarketValue } from '../../../utils/vaultCost';

export interface SetPortfolioRow {
  setId: string;
  setName: string;
  cardCount: number;
  purchaseValue: number;
  marketValue: number;
  profit: number;
  profitPct: number;
}

export function buildSetPortfolioRows(vaultCards: VaultCard[]): SetPortfolioRow[] {
  const bySet = new Map<string, SetPortfolioRow>();

  for (const entry of vaultCards) {
    const setId = entry.card.set?.id || entry.card.set?.name || 'unknown';
    const setName = entry.card.set?.name || 'Unknown Set';
    const key = setId;

    if (!bySet.has(key)) {
      bySet.set(key, {
        setId,
        setName,
        cardCount: 0,
        purchaseValue: 0,
        marketValue: 0,
        profit: 0,
        profitPct: 0,
      });
    }

    const row = bySet.get(key)!;
    const qty = entry.quantity;
    const purchase = effectiveCostBasis(entry);
    const market = holdingMarketValue(entry);

    row.cardCount += qty;
    row.purchaseValue += purchase;
    row.marketValue += market;
  }

  for (const row of bySet.values()) {
    row.profit = row.marketValue - row.purchaseValue;
    row.profitPct =
      row.purchaseValue > 0 ? (row.profit / row.purchaseValue) * 100 : 0;
  }

  return [...bySet.values()].sort((a, b) => b.marketValue - a.marketValue);
}

interface VaultPortfolioBySetProps {
  vaultCards: VaultCard[];
  onOpenSet?: (setId: string) => void;
}

export const VaultPortfolioBySet: React.FC<VaultPortfolioBySetProps> = ({
  vaultCards,
  onOpenSet,
}) => {
  const rows = useMemo(() => buildSetPortfolioRows(vaultCards), [vaultCards]);

  if (rows.length === 0) return null;

  return (
    <section>
      <div className="overflow-x-auto overflow-hidden rounded-xl border border-border-default bg-surface-raised">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-xs font-medium uppercase tracking-[0.12em] text-ink-muted">
              <th className="px-4 py-3 font-medium">Set</th>
              <th className="px-4 py-3 text-right font-medium">Cards</th>
              <th className="px-4 py-3 text-right font-medium">Invested</th>
              <th className="px-4 py-3 text-right font-medium">Market</th>
              <th className="px-4 py-3 text-right font-medium">P/L</th>
              {onOpenSet ? <th className="w-10 px-4 py-3" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.setId}
                className="border-b border-border-subtle last:border-0 hover:bg-surface-hover/60"
              >
                <td className="px-4 py-3 font-medium text-ink-primary">
                  <span className="inline-flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                    {row.setName}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">{row.cardCount}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">
                  {formatCurrency(row.purchaseValue)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">
                  {formatCurrency(row.marketValue)}
                </td>
                <td
                  className={`px-4 py-3 text-right tabular-nums font-medium ${
                    row.profit >= 0 ? 'text-gain' : 'text-loss'
                  }`}
                >
                  {formatCurrency(row.profit, { signed: true })}
                  <span className="ml-1 text-xs font-normal text-ink-muted">
                    ({formatPercent(row.profitPct, { signed: true })})
                  </span>
                </td>
                {onOpenSet ? (
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onOpenSet(row.setId)}
                      className="cursor-pointer rounded-lg p-1.5 text-ink-muted hover:bg-accent-muted hover:text-accent"
                      aria-label={`Open set tracker for ${row.setName}`}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
