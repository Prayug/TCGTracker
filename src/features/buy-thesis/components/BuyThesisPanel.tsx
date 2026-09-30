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
  const [showScores, setShowScores] = useState(false);
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

  const meaning = analysis.reasoning.meaning || analysis.reasoning.headline;
  const confidenceBlurb =
    analysis.reasoning.confidenceBlurb ||
    `Confidence: ${analysis.confidence.tier} (${Math.round(analysis.confidence.score)}/100).`;

  const whyAttractive = analysis.reasoning.whyBuy.slice(0, compact ? 2 : 3);
  const risks = analysis.reasoning.whyNot.slice(0, compact ? 2 : 3);

  return (
    <div
      className={cn(
        'rounded-xl border border-border-default bg-surface-raised/80 p-4 space-y-4',
        className
      )}
    >
      {/* Hero: recommendation + meaning */}
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
          Buy thesis
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-block rounded-full border px-3 py-1 text-sm font-semibold',
              BUY_CATEGORY_COLORS[analysis.category]
            )}
          >
            {analysis.categoryLabel}
          </span>
          {analysis.currentPrice != null && (
            <span className="font-mono text-sm tabular-nums text-ink-secondary">
              ${analysis.currentPrice.toFixed(2)}
            </span>
          )}
        </div>
        <p className="mt-2.5 text-sm leading-relaxed text-ink-primary">{meaning}</p>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">{confidenceBlurb}</p>
      </div>

      {analysis.fairValue && (
        <p className="text-xs text-ink-secondary">
          Recent fair range roughly{' '}
          <span className="font-mono tabular-nums text-ink-primary">
            ${analysis.fairValue.low.toFixed(2)}–${analysis.fairValue.high.toFixed(2)}
          </span>
          <span className="text-ink-muted"> (typical ~${analysis.fairValue.mid.toFixed(2)})</span>
        </p>
      )}

      {/* Why / Risks — plain English */}
      <div className={cn('grid gap-4', compact ? 'grid-cols-1' : 'sm:grid-cols-2')}>
        <div>
          <p className="mb-2 text-[11px] font-medium text-emerald-400/90">
            Why it looks attractive
          </p>
          <ul className="space-y-2">
            {whyAttractive.map((line) => (
              <li key={line} className="text-sm leading-snug text-ink-secondary">
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-medium text-red-400/90">Risks</p>
          <ul className="space-y-2">
            {risks.map((line) => (
              <li key={line} className="text-sm leading-snug text-ink-secondary">
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {analysis.fakeOpportunityFlags.filter((f) => f.severity !== 'info').length > 0 && (
        <div className="space-y-1.5">
          {analysis.fakeOpportunityFlags
            .filter((f) => f.severity !== 'info')
            .slice(0, 2)
            .map((f) => (
              <div key={f.id} className="flex items-start gap-1.5 text-xs text-amber-300/90">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{f.message}</span>
              </div>
            ))}
        </div>
      )}

      {analysis.invalidation.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
            <Shield className="h-3.5 w-3.5" />
            What would change this rating?
          </p>
          <ul className="space-y-1.5">
            {analysis.invalidation.slice(0, compact ? 2 : 3).map((c) => (
              <li key={c.id} className="text-xs leading-snug text-ink-secondary">
                {c.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quiet secondary: scores collapsed by default */}
      <div className="border-t border-border-subtle pt-3">
        <button
          type="button"
          onClick={() => setShowScores((v) => !v)}
          className="flex w-full items-center justify-between text-left text-[11px] text-ink-muted hover:text-ink-secondary"
        >
          <span>
            Score breakdown
            <span className="ml-1.5 font-mono tabular-nums text-ink-muted/80">
              opp {Math.round(analysis.scores.opportunity)} · risk{' '}
              {Math.round(analysis.scores.risk)}
            </span>
          </span>
          {showScores ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
        {showScores && (
          <div className="mt-3 space-y-2">
            {scoreEntries().map((e) => (
              <ScoreBar
                key={e.key}
                label={e.label}
                value={analysis.scores[e.key]}
                invert={e.invert}
                hint={e.hint}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setShowSignals((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink-primary"
        >
          {showSignals ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Underlying signals
        </button>
        <button
          type="button"
          onClick={() => setShowCalc((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink-primary"
        >
          {showCalc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Data notes
        </button>
      </div>

      {showSignals && (
        <ul className="max-h-48 space-y-2 overflow-y-auto rounded-lg bg-surface-inset p-2.5">
          {analysis.signals
            .slice()
            .sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength))
            .map((s) => (
              <li key={s.id} className="text-xs leading-snug">
                <span className={s.bullish ? 'text-emerald-400' : 'text-red-300'}>
                  {s.bullish ? 'Supports buy' : 'Caution'} · {s.label}
                </span>
                <p className="mt-0.5 text-ink-secondary">{s.summary}</p>
              </li>
            ))}
        </ul>
      )}

      {showCalc && (
        <div className="space-y-1.5 rounded-lg bg-surface-inset p-2.5 text-[11px] text-ink-muted">
          <p className="flex items-start gap-1">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            Price forecast used as one input: {analysis.predictionUsed ? 'yes' : 'no'}
          </p>
          {analysis.comparables && <p>{analysis.comparables.summary}</p>}
          {analysis.dataLimitations.slice(0, 4).map((d) => (
            <p key={d}>· {d}</p>
          ))}
          <p className="pt-1 text-[10px] italic text-ink-muted/90">
            {analysis.reasoning.disclaimer}
          </p>
        </div>
      )}
    </div>
  );
}
