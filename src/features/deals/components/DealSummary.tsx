import { StatBlock } from '../../../components/layout/PageShell';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import type { DealSummary } from '../types';

export function DealSummary({ summary }: { summary: DealSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatBlock
        label="Best Deal"
        value={summary.bestDeal ? formatPercent(summary.bestDeal.discountPercent) : '—'}
        hint={
          summary.bestDeal
            ? `${summary.bestDeal.cardName} · ${formatCurrency(summary.bestDeal.discountAmount)} below market`
            : undefined
        }
      />
      <StatBlock label="Deals Found" value={summary.dealsFound} />
      <StatBlock
        label="Median Discount"
        value={summary.medianDiscount != null ? formatPercent(summary.medianDiscount) : '—'}
      />
      <StatBlock
        label="Potential Savings"
        value={formatCurrency(summary.potentialSavings)}
        trend={summary.potentialSavings > 0 ? 'up' : 'neutral'}
      />
    </div>
  );
}
