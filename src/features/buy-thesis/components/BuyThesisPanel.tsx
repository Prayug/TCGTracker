import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { fetchBuyThesis } from '../../../services/buyThesisApi';
import { BUY_CATEGORY_COLORS, type BuyThesisAnalysis } from '../types';
import { cn } from '@/lib/utils';

interface Props {
  cardId: string | null | undefined;
  compact?: boolean;
  className?: string;
}

export function BuyThesisPanel({ cardId, compact = false, className }: Props) {
  const [analysis, setAnalysis] = useState<BuyThesisAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNerdy, setShowNerdy] = useState(false);

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
            ? 'Not enough market history for a read yet'
            : (err as Error)?.message || 'Could not load buy advice';
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
        <p className="text-xs text-ink-muted">Checking whether this is worth buying…</p>
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

  const friendAnswer = analysis.reasoning.meaning || analysis.reasoning.headline;
  const trustLine =
    analysis.reasoning.confidenceBlurb || 'Thin sales history — take with a grain of salt.';
  const why = analysis.reasoning.whyBuy.slice(0, compact ? 2 : 3);
  const risks = analysis.reasoning.whyNot.slice(0, compact ? 2 : 3);
  const mindChangers = analysis.invalidation.slice(0, compact ? 2 : 3);

  return (
    <div
      className={cn(
        'rounded-xl border border-border-default bg-surface-raised/80 p-4 space-y-4',
        className
      )}
    >
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
          Worth buying now?
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
            <span className="text-sm text-ink-secondary">~${analysis.currentPrice.toFixed(2)}</span>
          )}
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-primary">{friendAnswer}</p>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">{trustLine}</p>
      </div>

      <div className={cn('grid gap-4', compact ? 'grid-cols-1' : 'sm:grid-cols-2')}>
        <div>
          <p className="mb-2 text-[11px] font-medium text-emerald-400/90">Why collectors like it</p>
          <ul className="space-y-2.5">
            {why.map((line) => (
              <li key={line} className="text-sm leading-snug text-ink-secondary">
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-medium text-red-400/90">Why you might wait</p>
          <ul className="space-y-2.5">
            {risks.map((line) => (
              <li key={line} className="text-sm leading-snug text-ink-secondary">
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {analysis.fakeOpportunityFlags.filter(
        (f) => f.severity === 'critical' || f.severity === 'warn'
      ).length > 0 && (
        <div className="space-y-1.5">
          {analysis.fakeOpportunityFlags
            .filter((f) => f.severity === 'critical' || f.severity === 'warn')
            .slice(0, 2)
            .map((f) => (
              <div key={f.id} className="flex items-start gap-1.5 text-xs text-amber-300/90">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{f.message}</span>
              </div>
            ))}
        </div>
      )}

      {mindChangers.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-medium text-ink-muted">What would change my mind</p>
          <ul className="space-y-1.5">
            {mindChangers.map((c) => (
              <li key={c.id} className="text-xs leading-snug text-ink-secondary">
                {c.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-border-subtle pt-2">
        <button
          type="button"
          onClick={() => setShowNerdy((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink-secondary"
        >
          {showNerdy ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Under the hood
        </button>
        {showNerdy && (
          <div className="mt-2 space-y-2 rounded-lg bg-surface-inset p-2.5 text-[11px] text-ink-muted">
            <p className="flex items-start gap-1">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Numbers we used (for the curious): opportunity{' '}
              {Math.round(analysis.scores.opportunity)}, risk {Math.round(analysis.scores.risk)},
              liquidity {Math.round(analysis.scores.liquidity)}.
            </p>
            {analysis.fairValue && (
              <p>
                Recent typical price neighborhood ~${analysis.fairValue.mid.toFixed(2)} ($
                {analysis.fairValue.low.toFixed(2)}–${analysis.fairValue.high.toFixed(2)}).
              </p>
            )}
            {analysis.dataLimitations.slice(0, 3).map((d) => (
              <p key={d}>· {d}</p>
            ))}
            <p className="pt-1 text-[10px] italic">{analysis.reasoning.disclaimer}</p>
          </div>
        )}
      </div>
    </div>
  );
}
