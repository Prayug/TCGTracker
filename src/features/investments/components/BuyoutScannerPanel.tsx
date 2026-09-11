import { Info } from 'lucide-react';
import type { BuyoutPhase, BuyoutScanResult } from '../types';
import {
  CardThumb,
  ChangeBadge,
  EmptyState,
  formatUsd,
  LiquidityBadge,
  PanelLoading,
} from './shared';

const PHASE_STYLES: Record<BuyoutPhase, string> = {
  early: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  active: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  late: 'border-red-500/30 bg-red-500/10 text-red-400',
};

function signalLabel(signal: string): string {
  const [key, detail] = signal.split(':');
  const labels: Record<string, string> = {
    price_spike: 'Price spike',
    supply_drain: 'Supply drain',
    velocity: 'Sales velocity',
    thin_liquidity: 'Thin liquidity',
    premium_expansion: 'Premium expanding',
    pop_tightening: 'Pop tightening',
  };
  const label = labels[key] ?? key;
  return detail ? `${label} (${detail.replace(/_/g, ' ')})` : label;
}

interface Props {
  data: BuyoutScanResult | null;
  loading: boolean;
  error?: string | null;
}

/** Buyout candidates: spike + supply-drain signals with ripple set-mates. */
export function BuyoutScannerPanel({ data, loading, error }: Props) {
  if (loading) return <PanelLoading />;
  if (error) {
    return (
      <EmptyState
        message={`Unable to load buyout candidates: ${error}. The backend may be unavailable.`}
        isError
      />
    );
  }
  if (!data || data.rows.length === 0) {
    return (
      <EmptyState message="No buyout candidates right now. Candidates need a 15%+ gradual price move over the scan window." />
    );
  }

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-1.5 text-xs text-ink-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {data.note}
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.rows.map((c) => (
          <div
            key={c.cardId}
            className="rounded-xl border border-border-default bg-surface-raised p-4"
          >
            <div className="flex items-start gap-3">
              <CardThumb imageSmall={c.imageSmall} name={c.cardName} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-primary">
                      {c.cardName ?? c.cardId}
                    </p>
                    <p className="truncate text-xs text-ink-muted">{c.setName}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PHASE_STYLES[c.phase]}`}
                  >
                    {c.phase}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink-primary">
                    {formatUsd(c.currentPrice)}
                  </span>
                  <ChangeBadge pct={c.changePct} />
                  <LiquidityBadge tier={c.liquidityTier} score={c.liquidityScore} />
                  {c.listedCount != null && (
                    <span
                      className="rounded-full border border-border-subtle px-1.5 py-0.5 text-[10px] text-ink-muted"
                      title={c.supplyNote}
                    >
                      {c.listedCountPrev != null && c.listedCountPrev !== c.listedCount
                        ? `${c.listedCountPrev} → ${c.listedCount} listed`
                        : `${c.listedCount} listed`}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-muted">Buyout score</span>
                <span className="font-semibold text-ink-primary">{c.buyoutScore}/100</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-inset">
                <div
                  className={`h-full rounded-full ${
                    c.buyoutScore >= 70
                      ? 'bg-red-400'
                      : c.buyoutScore >= 45
                        ? 'bg-amber-400'
                        : 'bg-sky-400'
                  }`}
                  style={{ width: `${c.buyoutScore}%` }}
                />
              </div>
            </div>

            <ul className="mt-3 flex flex-wrap gap-1.5">
              {c.signals.map((s) => (
                <li
                  key={s}
                  className="rounded-full border border-border-default bg-surface-inset px-2 py-0.5 text-[10px] text-ink-secondary"
                >
                  {signalLabel(s)}
                </li>
              ))}
            </ul>

            <p className="mt-2 text-xs text-ink-secondary">{c.why}</p>

            {c.ripples.length > 0 && (
              <div className="mt-3 border-t border-border-subtle pt-3">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                  Watch these next (set-mates moving)
                </p>
                <ul className="space-y-1.5">
                  {c.ripples.map((r) => (
                    <li key={r.cardId} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-ink-secondary">{r.cardName ?? r.cardId}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-ink-muted">{formatUsd(r.currentPrice)}</span>
                        <ChangeBadge pct={r.changePct} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
