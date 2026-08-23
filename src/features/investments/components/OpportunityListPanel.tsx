import { useState } from 'react';
import { X } from 'lucide-react';
import { InsightsApiContext } from '../../market-insights/hooks/insightsApiContext';
import { slabInsightsApi } from '../../../services/marketInsightsApi';
import { ExternalSignalsPanel } from '../../market-insights/components/ExternalSignalsPanel';
import type { OpportunitiesResult, Opportunity, OpportunityGrade } from '../types';
import {
  CardThumb,
  ChangeBadge,
  EmptyState,
  formatUsd,
  PanelLoading,
  SentimentChip,
} from './shared';

const GRADE_STYLES: Record<OpportunityGrade, string> = {
  strong_buy: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400',
  buy: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  watch: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  pass: 'border-slate-500/30 bg-slate-500/10 text-ink-muted',
};

const GRADE_LABELS: Record<OpportunityGrade, string> = {
  strong_buy: 'Strong buy',
  buy: 'Buy',
  watch: 'Watch',
  pass: 'Pass',
};

interface Props {
  data: OpportunitiesResult | null;
  loading: boolean;
  minScore: number;
  onMinScoreChange: (score: number) => void;
}

/** Aggregated, scored opportunities with a slide-over detail view. */
export function OpportunityListPanel({ data, loading, minScore, onMinScoreChange }: Props) {
  const [selected, setSelected] = useState<Opportunity | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-ink-muted">
          Min score: <span className="text-ink-secondary">{minScore}</span>
        </label>
        <input
          type="range"
          min="0"
          max="80"
          step="5"
          value={minScore}
          onChange={(e) => onMinScoreChange(parseInt(e.target.value, 10))}
          className="w-40"
        />
      </div>

      {loading ? (
        <PanelLoading />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState message="No opportunities above the score threshold. Lower the minimum score or run slab predictions first." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.rows.map((o) => (
            <button
              key={o.cardId}
              type="button"
              onClick={() => setSelected(o)}
              className="cursor-pointer rounded-xl border border-border-default bg-surface-raised p-4 text-left transition-colors hover:border-border-strong hover:bg-surface-hover"
            >
              <div className="flex items-start gap-3">
                <CardThumb imageSmall={o.imageSmall} name={o.cardName} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink-primary">
                        {o.cardName ?? o.cardId}
                      </p>
                      <p className="truncate text-xs text-ink-muted">{o.setName}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${GRADE_STYLES[o.grade]}`}
                    >
                      {GRADE_LABELS[o.grade]}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold text-ink-primary">
                      {formatUsd(o.currentPrice)}
                    </span>
                    {o.momentumPct != null && <ChangeBadge pct={o.momentumPct} />}
                    {o.buyoutScore > 0 && (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                        buyout {o.buyoutScore}
                      </span>
                    )}
                    <SentimentChip value={o.netSentiment} />
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-surface-inset px-2 py-1.5">
                  <p className="text-[10px] text-ink-muted">Score</p>
                  <p className="text-sm font-bold text-accent">{o.score}</p>
                </div>
                <div className="rounded-lg bg-surface-inset px-2 py-1.5">
                  <p className="text-[10px] text-ink-muted">90d est.</p>
                  <p
                    className={`text-sm font-semibold ${
                      o.predictedReturn90d == null
                        ? 'text-ink-muted'
                        : o.predictedReturn90d >= 0
                          ? 'text-emerald-400'
                          : 'text-red-400'
                    }`}
                  >
                    {o.predictedReturn90d == null
                      ? '—'
                      : `${o.predictedReturn90d > 0 ? '+' : ''}${o.predictedReturn90d}%`}
                  </p>
                </div>
                <div className="rounded-lg bg-surface-inset px-2 py-1.5">
                  <p className="text-[10px] text-ink-muted">Confidence</p>
                  <p className="text-sm font-semibold text-ink-secondary">
                    {o.confidence != null ? `${o.confidence}%` : '—'}
                  </p>
                </div>
              </div>

              <p className="mt-2 line-clamp-2 text-xs text-ink-muted">{o.why}</p>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setSelected(null)}
            role="presentation"
          />
          <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-border-default bg-surface-overlay shadow-elevated">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <h2 className="truncate text-sm font-semibold text-ink-primary">
                {selected.cardName ?? selected.cardId}
              </h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink-primary"
                aria-label="Close detail"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div className="flex items-center gap-3">
                <CardThumb imageSmall={selected.imageSmall} name={selected.cardName} />
                <div>
                  <p className="text-xs text-ink-muted">{selected.setName}</p>
                  <p className="text-lg font-bold text-ink-primary">
                    {formatUsd(selected.currentPrice)}
                  </p>
                </div>
                <span
                  className={`ml-auto rounded-full border px-2.5 py-1 text-xs font-semibold ${GRADE_STYLES[selected.grade]}`}
                >
                  {GRADE_LABELS[selected.grade]} · {selected.score}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-surface-inset px-3 py-2">
                  <p className="text-[10px] text-ink-muted">Predicted 90d return</p>
                  <p className="font-semibold text-ink-primary">
                    {selected.predictedReturn90d != null
                      ? `${selected.predictedReturn90d > 0 ? '+' : ''}${selected.predictedReturn90d}%`
                      : 'No prediction'}
                  </p>
                </div>
                <div className="rounded-lg bg-surface-inset px-3 py-2">
                  <p className="text-[10px] text-ink-muted">Risk score</p>
                  <p className="font-semibold text-ink-primary">
                    {selected.riskScore != null ? `${selected.riskScore}/100` : '—'}
                  </p>
                </div>
                <div className="rounded-lg bg-surface-inset px-3 py-2">
                  <p className="text-[10px] text-ink-muted">{selected.momentumDays}d momentum</p>
                  <p className="font-semibold text-ink-primary">
                    {selected.momentumPct != null
                      ? `${selected.momentumPct > 0 ? '+' : ''}${selected.momentumPct}%`
                      : '—'}
                  </p>
                </div>
                <div className="rounded-lg bg-surface-inset px-3 py-2">
                  <p className="text-[10px] text-ink-muted">Set-mate momentum</p>
                  <p className="font-semibold text-ink-primary">
                    {selected.compMomentumPct != null
                      ? `${selected.compMomentumPct > 0 ? '+' : ''}${selected.compMomentumPct}%`
                      : '—'}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                  Key signals
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {selected.keySignals.map((s) => (
                    <li
                      key={s}
                      className="rounded-full border border-border-default bg-surface-inset px-2 py-0.5 text-[10px] text-ink-secondary"
                    >
                      {s.replace(/_/g, ' ')}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-xs text-ink-secondary">{selected.why}</p>

              <div className="rounded-xl border border-border-default bg-surface-raised">
                <p className="border-b border-border-subtle px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                  External signals
                </p>
                <InsightsApiContext.Provider value={slabInsightsApi}>
                  <ExternalSignalsPanel cardId={selected.cardId} />
                </InsightsApiContext.Provider>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
