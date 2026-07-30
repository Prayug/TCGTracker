import React, { useMemo, useState } from 'react';
import { Download, TrendingDown, TrendingUp } from 'lucide-react';
import { VaultCard } from '../../../types/pokemon';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { PriceChart } from '../../market/components/PriceChart';
import {
  buildHoldings,
  buildValueSeries,
  type PerformancePeriod,
} from '../utils/portfolioSeries';

interface VaultPerformanceReportProps {
  vaultCards: VaultCard[];
}

function exportCostBasisCsv(
  holdings: ReturnType<typeof buildHoldings>
) {
  const rows = [
    ['Name', 'Set', 'Qty', 'Cost Basis', 'Current Value', 'P/L', 'P/L %'].join(','),
    ...holdings.map((h) =>
      [
        `"${h.name.replace(/"/g, '""')}"`,
        `"${h.setName.replace(/"/g, '""')}"`,
        h.quantity,
        h.costBasis.toFixed(2),
        h.currentValue.toFixed(2),
        h.profit.toFixed(2),
        h.profitPct.toFixed(2),
      ].join(',')
    ),
  ];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vault-cost-basis-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export const VaultPerformanceReport: React.FC<VaultPerformanceReportProps> = ({ vaultCards }) => {
  const [period, setPeriod] = useState<PerformancePeriod>('30d');

  const holdings = useMemo(() => buildHoldings(vaultCards), [vaultCards]);
  const series = useMemo(() => buildValueSeries(vaultCards, period), [vaultCards, period]);
  const ranked = useMemo(
    () => [...holdings].sort((a, b) => b.profitPct - a.profitPct),
    [holdings]
  );
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];

  if (vaultCards.length === 0) return null;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-secondary">
          Estimated value over time from cost basis toward current market. Unset purchase prices
          default to market (flat P/L).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-border-default bg-surface-inset p-0.5">
            {(
              [
                ['7d', '7D'],
                ['30d', '30D'],
                ['ytd', 'YTD'],
                ['all', 'All'],
              ] as [PerformancePeriod, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  period === key
                    ? 'bg-accent/15 text-accent'
                    : 'text-ink-muted hover:text-ink-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => exportCostBasisCsv(holdings)}
            className="btn-secondary py-2 text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
        </div>
      </div>

      {series.length > 1 ? (
        <div className="rounded-xl border border-border-default bg-surface-raised p-3 sm:p-4">
          <PriceChart
            priceHistory={series}
            title="Portfolio value"
            variant="dark"
            height={200}
            compact
          />
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {best ? (
          <div className="flex items-start gap-3 rounded-xl border border-border-default bg-surface-raised px-4 py-3">
            <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-gain" />
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-muted">Best</p>
              <p className="truncate text-sm font-medium text-ink-primary">{best.name}</p>
              <p
                className={`text-xs tabular-nums ${best.profit >= 0 ? 'text-gain' : 'text-loss'}`}
              >
                {formatPercent(best.profitPct, { signed: true })} · {formatCurrency(best.profit)}
              </p>
            </div>
          </div>
        ) : null}
        {worst ? (
          <div className="flex items-start gap-3 rounded-xl border border-border-default bg-surface-raised px-4 py-3">
            <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-loss" />
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-muted">Worst</p>
              <p className="truncate text-sm font-medium text-ink-primary">{worst.name}</p>
              <p
                className={`text-xs tabular-nums ${worst.profit >= 0 ? 'text-gain' : 'text-loss'}`}
              >
                {formatPercent(worst.profitPct, { signed: true })} · {formatCurrency(worst.profit)}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};
