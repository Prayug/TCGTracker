import React, { useMemo } from 'react';
import { Layers, ChevronRight } from 'lucide-react';
import { VaultCard } from '../../../types/pokemon';
import { pokemonApi } from '../../../services/pokemonApi';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { SectionLabel } from '../../../components/common/SectionLabel';

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
    const purchase = entry.purchasePrice * qty;
    const market =
      (entry.card.marketPrice ?? pokemonApi.extractCardPrice(entry.card)) * qty;

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
    <section className="space-y-4">
      <div>
        <SectionLabel className="text-accent/90">By set</SectionLabel>
        <h3 className="mt-1 text-lg font-semibold text-ink-primary">Portfolio breakdown</h3>
        <p className="text-sm text-ink-muted">Value and performance grouped by expansion</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border-default bg-surface-raised shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-inset text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-3">Set</th>
              <th className="px-4 py-3 text-right">Cards</th>
              <th className="px-4 py-3 text-right">Invested</th>
              <th className="px-4 py-3 text-right">Market</th>
              <th className="px-4 py-3 text-right">P/L</th>
              {onOpenSet && <th className="px-4 py-3 w-10" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.setId} className="border-b border-border-subtle last:border-0 hover:bg-surface-hover">
                <td className="px-4 py-3 font-medium text-ink-primary">
                  <span className="inline-flex items-center gap-2">
                    <Layers className="h-4 w-4 text-accent" />
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
                  <span className="ml-1 text-xs text-ink-muted">
                    ({formatPercent(row.profitPct, { signed: true })})
                  </span>
                </td>
                {onOpenSet && (
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onOpenSet(row.setId)}
                      className="rounded-lg p-1.5 text-ink-muted hover:bg-accent-muted hover:text-accent"
                      aria-label={`Open set tracker for ${row.setName}`}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
