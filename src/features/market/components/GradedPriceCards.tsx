import React from 'react';
import { GradedPriceEntry } from '../../../services/gradedPricesApi';
import { formatCurrency } from '../../../utils/cardDisplay';
import { cn } from '@/lib/utils';
import { HEADLINE_GRADES, headlineGradedPrice } from './gradedPriceDisplay';

interface GradedPriceCardsProps {
  rows: GradedPriceEntry[];
  rawPrice: number | null;
  selectedKey?: string | null;
  onSelect?: (grader: string, grade: string) => void;
}

export const GradedPriceCards: React.FC<GradedPriceCardsProps> = ({
  rows,
  rawPrice,
  selectedKey,
  onSelect,
}) => {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {HEADLINE_GRADES.map(({ grader, grade, label }) => {
        const entry = rows.find((row) => row.grader === grader && row.grade === grade) ?? null;
        const price = headlineGradedPrice(entry);
        const multiple =
          price != null && price > 0 && rawPrice != null && rawPrice > 0 ? price / rawPrice : null;
        const key = `${grader}::${grade}`;
        const selected = selectedKey === key;
        const clickable = Boolean(onSelect);

        return (
          <button
            key={key}
            type="button"
            disabled={!clickable}
            onClick={() => onSelect?.(grader, grade)}
            className={cn(
              'rounded-xl bg-surface-raised px-3 py-3 text-left transition-colors',
              clickable && 'cursor-pointer hover:bg-surface-hover',
              selected && 'ring-1 ring-accent/40'
            )}
          >
            <p className="text-xs font-medium text-ink-muted">{label}</p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums tracking-tight text-ink-primary sm:text-xl">
              {price != null ? formatCurrency(price) : '—'}
            </p>
            {entry?.listedLow != null && (entry.listedCount ?? 0) > 0 && (
              <p className="mt-0.5 font-mono text-[11px] tabular-nums text-ink-muted">
                lowest listed {formatCurrency(entry.listedLow)}
              </p>
            )}
            <p className="mt-0.5 text-[11px] text-ink-muted">
              {multiple != null
                ? `${multiple.toFixed(multiple >= 10 ? 1 : 2)}× raw`
                : price == null
                  ? 'No recent sales'
                  : 'vs raw'}
            </p>
          </button>
        );
      })}
    </div>
  );
};
