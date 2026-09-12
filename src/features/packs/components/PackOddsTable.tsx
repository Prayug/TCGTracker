import React from 'react';
import { ValueRange } from '../../../types/pokemon';
import { cn } from '../../../lib/utils';
import { formatOddsLabel, PackTierTheme } from '../packPresentation';

interface PackOddsTableProps {
  ranges: ValueRange[];
  tierTheme: PackTierTheme;
  boosted?: boolean;
  isOnePiece?: boolean;
}

export const PackOddsTable: React.FC<PackOddsTableProps> = ({
  ranges,
  tierTheme,
  boosted = false,
  isOnePiece = false,
}) => (
  <div className="w-full rounded-2xl border border-border-subtle bg-surface-inset/80 p-4 sm:p-5">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">Odds</h3>
      {boosted ? (
        <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
          Boosted
        </span>
      ) : null}
    </div>
    <div className="space-y-1.5" role="table" aria-label="Pack value odds">
      {ranges.map((range, idx) => (
        <div
          key={`${range.min}-${range.max}-${idx}`}
          className="relative overflow-hidden rounded-lg bg-white/[0.04] px-3 py-2"
          role="row"
        >
          <div
            className={cn('absolute inset-y-0 left-0 rounded-lg', tierTheme.bar)}
            style={{ width: `max(${range.probability}%, 4px)` }}
            aria-hidden
          />
          <div className="relative flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate tabular-nums text-ink-secondary">
              {formatOddsLabel(range)}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-ink-primary">
              {range.probability % 1 === 0
                ? `${range.probability}%`
                : `${range.probability.toFixed(1)}%`}
            </span>
          </div>
        </div>
      ))}
    </div>
    <p className="mt-3 text-[10px] leading-relaxed text-ink-muted sm:text-xs">
      {boosted
        ? 'Boosted odds — lower floor, higher ceiling. Same price.'
        : 'Exact simulated odds — every tier disclosed.'}
      {!isOnePiece ? ' Raw vs PSA 10 at each bracket follows what is in the card pool.' : ''}
    </p>
  </div>
);
