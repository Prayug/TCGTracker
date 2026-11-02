import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import type { DealSummary } from '../types';

/** The scan's result in a sentence, measured against market estimates. */
export function DealSummary({ summary }: { summary: DealSummary }) {
  if (!summary.dealsFound) return null;
  const best = summary.bestDeal;
  return (
    <p className="max-w-[72ch] text-[14px] text-ink-secondary">
      <span className="font-medium text-ink-primary">
        {summary.dealsFound.toLocaleString()} listing{summary.dealsFound === 1 ? '' : 's'} under the
        market estimate.
      </span>{' '}
      {summary.medianDiscount != null
        ? `The median is ${formatPercent(summary.medianDiscount)} under. `
        : ''}
      {best
        ? `The deepest is ${best.cardName}, ${formatCurrency(best.discountAmount)} (${formatPercent(best.discountPercent)}) under. `
        : ''}
      {summary.potentialSavings > 0
        ? `Together they ask ${formatCurrency(summary.potentialSavings)} less than the estimates.`
        : ''}
    </p>
  );
}
