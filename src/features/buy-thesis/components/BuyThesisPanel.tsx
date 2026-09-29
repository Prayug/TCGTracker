import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Info, Shield } from 'lucide-react';
import { fetchBuyThesis } from '../../../services/buyThesisApi';
import { BUY_CATEGORY_COLORS, type BuyThesisAnalysis, type BuyThesisScores } from '../types';
import { cn } from '@/lib/utils';

interface Props {
  cardId: string | null | undefined;
  /** Compact mode for side panels */
  compact?: boolean;
  className?: string;
}

function ScoreBar({
  label,
  value,
  invert,
  hint,
}: {
  label: string;
  value: number;
  invert?: boolean;
  hint?: string;
}) {
  const display = Math.round(value);
  const pct = Math.min(100, Math.max(0, value));
  const color = invert
    ? value >= 70
      ? '#f87171'
      : value >= 45
        ? '#fbbf24'
        : '#34d399'
    : value >= 65
      ? '#34d399'
      : value >= 45
        ? '#fbbf24'
        : '#f87171';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-ink-muted" title={hint}>
          {label}
        </span>
        <span className="font-mono tabular-nums text-ink-secondary">{display}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-surface-inset">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function scoreEntries(): Array<{
  key: keyof BuyThesisScores;
  label: string;
  invert?: boolean;
  hint: string;
}> {
  return [
    { key: 'opportunity', label: 'Opportunity', hint: 'Weighted overall buy opportunity' },
    { key: 'value', label: 'Value', hint: 'Price vs trimmed fair / peers' },
    { key: 'momentum', label: 'Momentum', hint: 'MA + recent returns' },
    { key: 'liquidity', label: 'Liquidity', hint: 'Quote density / volume / comps' },
    { key: 'gradingOpportunity', label: 'Grading', hint: 'PSA spread & population' },
    { key: 'supplyDemand', label: 'Supply/Demand', hint: 'Rarity, set age, listings' },
    { key: 'risk', label: 'Risk', invert: true, hint: 'Higher = more risk' },
    { key: 'dataQuality', label: 'Data quality', hint: 'Evidence reliability inputs' },
  ];
}

export function BuyThesisPanel({ cardId, compact = false, className }: Props) {
  const [analysis, setAnalysis] = useState<BuyThesisAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCalc, setShowCalc] = useState(false);
  const [showSignals, setShowSignals] = useState(false);

  useEffect(() => {
    if (!cardId) {
      setAnalysis(null);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetchBuyThesis(cardId)
      .then((data) => {
        if (!ac.signal.aborted) setAnalysis(data);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        const msg =
          (err as { response?: { status?: number }; message?: string })?.response?.status === 404
            ? 'No market data for buy thesis yet'
            : (err as Error)?.message || 'Failed to load buy thesis';
        setError(msg);
        setAnalysis(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [cardId]);

  if (!cardId) return null;

  if (loading) {
    return (
      <div
        className={cn('rounded-xl border border-border-default bg-surface-inset p-4', className)}
      >
        <p className="text-xs text-ink-muted">Building buy thesis…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('rounded-xl border border-border-subtle bg-surface-inset p-4', className)}>
        <p className="text-xs text-ink-muted">{error}</p>
      </div>
    );
  }

  if (!analysis) return null;

  const confColor =
    analysis.confidence.tier === 'high'
      ? 'text-emerald-400'
      : analysis.confidence.tier === 'medium'
        ? 'text-amber-300'
        : 'text-orange-400';

  return (
    <div
      className={cn(
        'rounded-xl border border-border-default bg-surface-raised/80 p-4 space-y-3',
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
            Buy thesis
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium',
                BUY_CATEGORY_COLORS[analysis.category]
              )}
            >
              {analysis.categoryLabel}
            </span>
            <span
              className={cn('text-xs font-medium', confColor)}
              title={analysis.confidence.reasons.join('; ')}
            >
              {analysis.confidence.tier} confidence ({Math.round(analysis.confidence.score)})
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-ink-muted">Opportunity</p>
          <p className="font-mono text-xl font-semibold tabular-nums text-ink-primary">
            {Math.round(analysis.scores.opportunity)}
            <span className="text-sm text-ink-muted">/100</span>
          </p>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-ink-secondary">{analysis.reasoning.headline}</p>

      {analysis.fairValue && (
        <div className="rounded-lg bg-surface-inset px-3 py-2 text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-ink-muted">Fair value range</span>
            <span className="font-mono tabular-nums text-ink-primary">
              ${analysis.fairValue.low.toFixed(2)} – ${analysis.fairValue.high.toFixed(2)}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] text-ink-muted">
            Mid ${analysis.fairValue.mid.toFixed(2)} ·{' '}
            {analysis.fairValue.method.replace(/_/g, ' ')}
          </p>
        </div>
      )}

      <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-2')}>
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-emerald-400/80">
            Why
          </p>
          <ul className="space-y-1">
            {analysis.reasoning.whyBuy.slice(0, compact ? 2 : 4).map((line) => (
              <li key={line} className="text-xs leading-snug text-ink-secondary">
                · {line}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-red-400/80">
            Risks
          </p>
          <ul className="space-y-1">
            {analysis.reasoning.whyNot.slice(0, compact ? 2 : 4).map((line) => (
              <li key={line} className="text-xs leading-snug text-ink-secondary">
                · {line}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {analysis.fakeOpportunityFlags.filter((f) => f.severity !== 'info').length > 0 && (
        <div className="space-y-1">
          {analysis.fakeOpportunityFlags
            .filter((f) => f.severity !== 'info')
            .slice(0, 3)
            .map((f) => (
              <div key={f.id} className="flex items-start gap-1.5 text-[11px] text-amber-300/90">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{f.message}</span>
              </div>
            ))}
        </div>
      )}

      <div className="space-y-2">
        {scoreEntries()
          .filter((e) =>
            compact ? e.key === 'opportunity' || e.key === 'risk' || e.key === 'liquidity' : true
          )
          .map((e) => (
            <ScoreBar
              key={e.key}
              label={e.label}
              value={analysis.scores[e.key]}
              invert={e.invert}
              hint={e.hint}
            />
          ))}
      </div>

      {analysis.invalidation.length > 0 && (
        <div className="rounded-lg border border-border-subtle px-3 py-2">
          <p className="mb-1.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-ink-muted">
            <Shield className="h-3 w-3" />
            What would change this rating?
          </p>
          <ul className="space-y-1">
            {analysis.invalidation.slice(0, compact ? 2 : 4).map((c) => (
              <li key={c.id} className="text-[11px] leading-snug text-ink-secondary">
                · {c.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => setShowSignals((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink-primary"
        >
          {showSignals ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Signals ({analysis.signals.length})
        </button>
        <button
          type="button"
          onClick={() => setShowCalc((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink-primary"
        >
          {showCalc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Calc details
        </button>
      </div>

      {showSignals && (
        <ul className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg bg-surface-inset p-2">
          {analysis.signals
            .slice()
            .sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength))
            .map((s) => (
              <li key={s.id} className="text-[11px]">
                <span className={s.bullish ? 'text-emerald-400' : 'text-red-300'}>
                  {s.bullish ? '▲' : '▼'} {s.label}
                </span>
                <span className="text-ink-muted"> · str {s.strength.toFixed(2)}</span>
                <p className="text-ink-secondary">{s.summary}</p>
              </li>
            ))}
        </ul>
      )}

      {showCalc && (
        <div className="space-y-1.5 rounded-lg bg-surface-inset p-2 text-[11px] text-ink-muted">
          <p className="flex items-start gap-1">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            Prediction used as one signal: {analysis.predictionUsed ? 'yes' : 'no'}
          </p>
          {analysis.comparables && <p>Peers: {analysis.comparables.summary}</p>}
          {analysis.dataLimitations.slice(0, 4).map((d) => (
            <p key={d}>· {d}</p>
          ))}
          <p className="pt-1 text-[10px] italic">{analysis.reasoning.disclaimer}</p>
        </div>
      )}
    </div>
  );
}
