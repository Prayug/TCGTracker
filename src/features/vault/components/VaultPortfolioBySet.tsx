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
        <SectionLabel className="text-violet-300/90">By set</SectionLabel>
        <h3 className="mt-1 text-lg font-semibold text-gray-900">Portfolio breakdown</h3>
        <p className="text-sm text-gray-600">Value and performance grouped by expansion</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
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
              <tr key={row.setId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/80">
                <td className="px-4 py-3 font-medium text-gray-900">
                  <span className="inline-flex items-center gap-2">
                    <Layers className="h-4 w-4 text-violet-500" />
                    {row.setName}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700">{row.cardCount}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                  {formatCurrency(row.purchaseValue)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                  {formatCurrency(row.marketValue)}
                </td>
                <td
                  className={`px-4 py-3 text-right tabular-nums font-medium ${
                    row.profit >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {formatCurrency(row.profit, { signed: true })}
                  <span className="ml-1 text-xs text-gray-500">
                    ({formatPercent(row.profitPct, { signed: true })})
                  </span>
                </td>
                {onOpenSet && (
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onOpenSet(row.setId)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-violet-50 hover:text-violet-600"
                      title="Open set tracker"
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
