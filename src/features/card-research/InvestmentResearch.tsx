import type { BuyThesisAnalysis } from '../buy-thesis/types';
import { BUY_CATEGORY_LABELS } from '../buy-thesis/types';
import { Unavailable } from '../../components/exchange/Price';
import { formatCurrency } from '../../utils/cardDisplay';
import { cn } from '@/lib/utils';

const TIER_COPY: Record<string, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

function evidenceLine(evidence: Record<string, number | string | boolean | null>): string {
  return Object.entries(evidence)
    .filter(([, v]) => v != null && v !== '')
    .slice(0, 3)
    .map(([k, v]) => {
      const label = k
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/_/g, ' ')
        .toLowerCase();
      const value =
        typeof v === 'number'
          ? Math.abs(v) < 1 && v !== 0
            ? v.toFixed(2)
            : v.toLocaleString()
          : String(v);
      return `${label}: ${value}`;
    })
    .join(' · ');
}

/**
 * Structured research instead of a paragraph: the call, the signals with
 * their evidence, what makes it uncertain, and what to check next.
 */
export function InvestmentResearch({
  thesis,
  loading,
  error,
  headline,
  finishLabel,
  disagrees,
}: {
  thesis: BuyThesisAnalysis | null;
  loading: boolean;
  error: string | null;
  headline: number | null;
  finishLabel: string;
  disagrees: boolean;
}) {
  if (loading) return <div className="skeleton mt-4 h-40 rounded" />;
  if (error || !thesis) {
    return (
      <Unavailable className="mt-4" title="No analysis for this card">
        {error ?? 'The analysis service returned nothing.'} Prices and sales above are unaffected.
      </Unavailable>
    );
  }

  const label = thesis.categoryLabel || BUY_CATEGORY_LABELS[thesis.category] || thesis.category;
  const insufficient = thesis.category === 'insufficient_data';
  const signals = [...thesis.signals].sort((a, b) => b.strength - a.strength).slice(0, 5);
  const uncertainty = [
    ...thesis.confidence.reasons,
    ...thesis.dataLimitations,
    ...thesis.fakeOpportunityFlags.map((f) => f.message),
  ].filter(Boolean);

  return (
    <div className="mt-4 space-y-6">
      {disagrees ? (
        <div className="border-l-2 border-warn bg-warn-muted px-4 py-3 text-[13.5px]" role="note">
          <p className="font-semibold text-warn">These figures describe different things</p>
          <p className="mt-1 text-ink-secondary">
            The analysis was computed from a reference price of{' '}
            <span className="font-mono">{formatCurrency(thesis.currentPrice ?? 0)}</span>, but the{' '}
            {finishLabel} market estimate above is{' '}
            <span className="font-mono">{headline ? formatCurrency(headline) : '—'}</span>. The
            analysis most likely uses the card’s default finish or a listing price. Don’t compare
            its fair-value range with this finish’s price.
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div>
          <p className="text-meta text-ink-muted">Model read</p>
          <p
            className={cn(
              'font-display text-[26px] leading-tight',
              insufficient && 'text-ink-secondary'
            )}
          >
            {label}
          </p>
          <p className="mt-1 text-meta text-ink-secondary">
            {TIER_COPY[thesis.confidence.tier] ?? thesis.confidence.tier} · score{' '}
            {Math.round(thesis.confidence.score)}/100
          </p>
          {thesis.fairValue && !disagrees ? (
            <div className="mt-4 border-t border-rule pt-2">
              <p className="text-meta text-ink-muted">Fair value range</p>
              <p className="font-mono text-[15px] tabular-nums">
                {formatCurrency(thesis.fairValue.low)} – {formatCurrency(thesis.fairValue.high)}
              </p>
              <p className="text-[11.5px] text-ink-muted">{thesis.fairValue.method}</p>
            </div>
          ) : null}
          <p className="mt-4 text-[11.5px] text-ink-muted">
            Analysed {new Date(thesis.analyzedAt).toLocaleDateString()}
            {thesis.predictionUsed ? ' · includes a model forecast' : ' · observed data only'}
          </p>
        </div>

        <div className="min-w-0 space-y-5">
          {thesis.reasoning?.headline ? (
            <p className="max-w-[68ch] text-[15px] leading-relaxed">{thesis.reasoning.headline}</p>
          ) : null}

          <div>
            <h3 className="text-h3">Signals and evidence</h3>
            {signals.length === 0 ? (
              <p className="mt-1 text-meta text-ink-muted">
                No individual signals were strong enough to report.
              </p>
            ) : (
              <ul className="mt-1">
                {signals.map((s) => (
                  <li
                    key={s.id}
                    className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2 border-b border-rule py-2"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'mt-0.5 font-mono text-[14px]',
                        s.bullish ? 'text-gain' : 'text-loss'
                      )}
                    >
                      {s.bullish ? '+' : '−'}
                    </span>
                    <div>
                      <p className="text-[13.5px]">
                        <span className="font-medium">{s.label}.</span> {s.summary}
                        <span className="sr-only">
                          {s.bullish ? ' (supports buying)' : ' (argues against)'}
                        </span>
                      </p>
                      {evidenceLine(s.evidence) ? (
                        <p className="mt-0.5 font-mono text-[11.5px] text-ink-muted">
                          {evidenceLine(s.evidence)}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-h3">Uncertainty</h3>
              {uncertainty.length === 0 ? (
                <p className="mt-1 text-meta text-ink-muted">None reported.</p>
              ) : (
                <ul className="mt-1 list-disc space-y-1 pl-4 text-[13px] text-ink-secondary">
                  {uncertainty.slice(0, 5).map((u) => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-h3">What would change the read</h3>
              {thesis.invalidation.length === 0 ? (
                <p className="mt-1 text-meta text-ink-muted">No thresholds supplied.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-[13px] text-ink-secondary">
                  {thesis.invalidation.slice(0, 4).map((i) => (
                    <li key={i.id}>{i.description}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <p className="text-[11.5px] text-ink-muted">
            {thesis.reasoning?.disclaimer ||
              'Analysis is generated from observed prices and is not financial advice.'}
          </p>
        </div>
      </div>
    </div>
  );
}
