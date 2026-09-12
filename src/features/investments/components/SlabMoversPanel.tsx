import type { MoverDirection, SlabMoversResult } from '../types';
import {
  CardThumb,
  ChangeBadge,
  EmptyState,
  formatUsd,
  LiquidityBadge,
  PanelLoading,
  StaleBadge,
} from './shared';

interface Props {
  data: SlabMoversResult | null;
  loading: boolean;
  days: 7 | 30 | 90;
  onDaysChange: (days: 7 | 30 | 90) => void;
  direction: MoverDirection | 'all';
  onDirectionChange: (direction: MoverDirection | 'all') => void;
  error?: string | null;
}

const DAY_OPTIONS: (7 | 30 | 90)[] = [7, 30, 90];
const DIRECTION_OPTIONS: { id: MoverDirection | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'up', label: 'Gainers' },
  { id: 'down', label: 'Losers' },
];

/** Verified PSA 10 slab %-change movers with liquidity context. */
export function SlabMoversPanel({
  data,
  loading,
  days,
  onDaysChange,
  direction,
  onDirectionChange,
  error,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-border-default bg-surface-inset p-0.5">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDaysChange(d)}
              className={`cursor-pointer rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                days === d
                  ? 'bg-accent/15 text-accent'
                  : 'text-ink-muted hover:bg-surface-hover hover:text-ink-secondary'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-border-default bg-surface-inset p-0.5">
          {DIRECTION_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onDirectionChange(opt.id)}
              className={`cursor-pointer rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                direction === opt.id
                  ? 'bg-accent/15 text-accent'
                  : 'text-ink-muted hover:bg-surface-hover hover:text-ink-secondary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <PanelLoading />
      ) : error ? (
        <EmptyState
          message={`Unable to load movers: ${error}. The backend may be unavailable.`}
          isError
        />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState message="No slab movers found for this window. Movers need at least 3 history points and a $5 or 8% move." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-default bg-surface-raised">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-[11px] uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2.5 font-medium">Card</th>
                <th className="px-4 py-2.5 font-medium">PSA 10</th>
                <th className="px-4 py-2.5 font-medium">{data.days}d move</th>
                <th className="px-4 py-2.5 font-medium">Sold</th>
                <th className="px-4 py-2.5 font-medium">Liquidity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {data.rows.map((m) => (
                <tr key={m.cardId} className="transition-colors hover:bg-surface-hover">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <CardThumb imageSmall={m.imageSmall} name={m.cardName} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink-primary">
                          {m.cardName ?? m.cardId}
                        </p>
                        <p className="truncate text-xs text-ink-muted">{m.setName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-ink-primary">{formatUsd(m.currentPrice)}</p>
                    <p className="text-xs text-ink-muted">from {formatUsd(m.prevPrice)}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <ChangeBadge pct={m.changePct} abs={m.changeAbs} />
                  </td>
                  <td className="px-4 py-2.5 text-ink-secondary">{m.soldListings}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <LiquidityBadge tier={m.liquidityTier} score={m.liquidityScore} />
                      {m.stale && <StaleBadge />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
