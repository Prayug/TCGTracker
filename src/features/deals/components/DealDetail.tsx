import { X } from 'lucide-react';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import type { Deal } from '../types';
import { EVIDENCE_LABELS, RISK_FLAG_LABELS } from '../types';

function formatUpdated(iso: string | null): string {
  if (!iso) return 'Unknown';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return iso;
  const hours = ms / 3600000;
  if (hours < 1) return 'Updated just now';
  if (hours < 24) return `Updated ${Math.round(hours)}h ago`;
  return `Updated ${Math.round(hours / 24)}d ago`;
}

export function DealDetail({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
        role="button"
        tabIndex={0}
        aria-label="Close deal detail"
      />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-border-default bg-surface-overlay shadow-elevated">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <h2 className="truncate text-sm font-semibold text-ink-primary">{deal.cardName}</h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-ink-muted hover:bg-surface-hover hover:text-ink-primary"
            aria-label="Close detail"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 p-4">
          {deal.listingImage && (
            <img
              src={deal.listingImage}
              alt=""
              className="mx-auto max-h-64 rounded-xl object-contain"
            />
          )}
          <a
            href={deal.listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex h-9 w-full items-center justify-center text-xs"
          >
            View on eBay
          </a>

          <section>
            <h3 className="section-label mb-2">Listing</h3>
            <p className="text-sm text-ink-secondary">{deal.listingTitle}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-ink-muted">Type</dt>
                <dd>{deal.listingType === 'auction' ? 'Auction opportunity' : 'Buy It Now'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Condition</dt>
                <dd>{deal.condition || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Seller</dt>
                <dd>
                  {deal.sellerUsername || '—'}
                  {deal.sellerFeedbackPct != null ? ` · ${deal.sellerFeedbackPct}%` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Shipping</dt>
                <dd>{deal.shipping === 0 ? 'Free' : formatCurrency(deal.shipping)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Ends</dt>
                <dd>
                  {deal.endDate
                    ? new Date(deal.endDate).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : '—'}
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 className="section-label mb-2">TCGTracker Match</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-ink-muted">Card</dt>
                <dd>{deal.cardName}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Set</dt>
                <dd>{deal.setName}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Number</dt>
                <dd>{deal.cardNumber || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Language</dt>
                <dd className="uppercase">{deal.language}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Variant</dt>
                <dd>{deal.variantKey || 'normal'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Grade</dt>
                <dd>{deal.gradeLabel}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 className="section-label mb-2">Pricing Comparison</h3>
            <div className="rounded-xl border border-border-subtle bg-surface-inset p-3">
              <p className="font-mono text-xl font-semibold text-ink-primary">
                {formatCurrency(deal.allInCost)} all-in
              </p>
              <p className="text-sm text-ink-secondary">
                {formatCurrency(deal.listingPrice)}
                {deal.shipping > 0
                  ? ` + ${formatCurrency(deal.shipping)} shipping`
                  : ' · free shipping'}
              </p>
              <p className="mt-2 text-sm">
                Market value: {formatCurrency(deal.marketValue)}
                {deal.nmMarketValue != null &&
                deal.conditionFactor != null &&
                deal.conditionFactor < 1
                  ? ` · ${deal.cardConditionLabel || 'played'} (${Math.round(deal.conditionFactor * 100)}% of NM ${formatCurrency(deal.nmMarketValue)})`
                  : ''}
              </p>
              <p className="text-xs text-ink-muted">
                Source: {deal.marketSource}
                {deal.dealCondition === 'graded' ? ` · ${deal.gradeLabel} reference` : ''}
                {deal.marketStale ? ' · stale' : ''} · {formatUpdated(deal.marketUpdatedAt)}
              </p>
              <p className="mt-2 font-medium text-gain">
                {formatCurrency(deal.discountAmount)} · {formatPercent(deal.discountPercent)} below
                market
              </p>
              {deal.listingType === 'auction' && deal.maxBid != null && (
                <p className="mt-2 text-sm text-ink-secondary">
                  Max bid for {deal.desiredAuctionMargin}% margin: {formatCurrency(deal.maxBid)}
                </p>
              )}
            </div>
          </section>

          <section>
            <h3 className="section-label mb-2">Why We Matched It</h3>
            <ul className="space-y-1 text-sm text-ink-secondary">
              {deal.matchEvidence.map((code) => (
                <li key={code}>{EVIDENCE_LABELS[code]}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-muted">
              Confidence {deal.matchConfidenceTier} ({Math.round(deal.matchConfidence * 100)}%)
            </p>
          </section>

          {deal.riskFlags.length > 0 && (
            <section>
              <h3 className="section-label mb-2">Warnings</h3>
              <ul className="space-y-1 text-sm text-amber-400">
                {deal.riskFlags.map((flag) => (
                  <li key={flag}>{RISK_FLAG_LABELS[flag]}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>
    </>
  );
}
