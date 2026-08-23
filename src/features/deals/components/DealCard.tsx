import { Bookmark, ExternalLink, X } from 'lucide-react';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import type { Deal } from '../types';
import { RISK_FLAG_LABELS } from '../types';

const CONFIDENCE_STYLES: Record<Deal['matchConfidenceTier'], string> = {
  high: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  medium: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  low: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  unresolved: 'border-border-subtle bg-surface-inset text-ink-muted',
};

function formatTimeRemaining(hours: number | null): string | null {
  if (hours == null) return null;
  if (hours < 0) return 'Ended';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m left`;
  if (hours < 24) return `${Math.round(hours)}h left`;
  return `${Math.round(hours / 24)}d left`;
}

export function DealCard({
  deal,
  saved,
  onOpen,
  onSave,
  onDismiss,
  onOpenCard,
}: {
  deal: Deal;
  saved: boolean;
  onOpen: () => void;
  onSave: () => void;
  onDismiss: () => void;
  onOpenCard: () => void;
}) {
  const remaining = formatTimeRemaining(deal.hoursRemaining);
  const visibleFlags = deal.riskFlags.slice(0, 2);

  return (
    <article className="flex flex-col rounded-xl border border-border-default bg-surface-raised p-4 text-left transition-colors hover:border-border-strong">
      <button
        type="button"
        onClick={onOpen}
        className="flex cursor-pointer items-start gap-3 text-left"
      >
        {deal.listingImage ? (
          <img
            src={deal.listingImage}
            alt=""
            className="h-24 w-[4.5rem] shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-24 w-[4.5rem] shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-inset text-[10px] text-ink-muted">
            {deal.cardName.slice(0, 2)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-medium text-ink-primary">{deal.cardName}</h3>
              <p className="truncate text-xs text-ink-muted">
                {deal.setName}
                {deal.cardNumber ? ` · ${deal.cardNumber}` : ''}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-foil/30 bg-foil/10 px-2 py-0.5 text-[10px] font-semibold text-foil">
              {deal.gradeLabel}
            </span>
          </div>

          <p className="mt-2 font-mono text-lg font-semibold tabular-nums text-ink-primary">
            {formatCurrency(deal.allInCost)} all-in
            <span className="mx-1.5 text-ink-muted">vs</span>
            <span className="text-ink-secondary">{formatCurrency(deal.marketValue)}</span>
          </p>
          <p className="text-sm font-medium text-gain">
            Save {formatCurrency(deal.discountAmount)} · {formatPercent(deal.discountPercent)} below
            market
          </p>
        </div>
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${CONFIDENCE_STYLES[deal.matchConfidenceTier]}`}
        >
          {deal.matchConfidenceTier} match
        </span>
        {deal.listingType === 'auction' ? (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
            Auction opportunity
          </span>
        ) : (
          <span className="rounded-full border border-border-subtle px-1.5 py-0.5 text-[10px] text-ink-muted">
            Buy It Now
          </span>
        )}
        {remaining && <span className="text-[10px] text-ink-muted">{remaining}</span>}
        {deal.liquidityLabel && (
          <span className="text-[10px] text-ink-muted">{deal.liquidityLabel}</span>
        )}
        {visibleFlags.map((flag) => (
          <span
            key={flag}
            className="rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400"
          >
            {RISK_FLAG_LABELS[flag]}
          </span>
        ))}
      </div>

      {deal.listingType === 'auction' && deal.maxBid != null && (
        <p className="mt-2 text-xs text-ink-secondary">
          Max bid for {deal.desiredAuctionMargin}% margin: {formatCurrency(deal.maxBid)}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={deal.listingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary h-9 px-3 text-xs"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View on eBay
        </a>
        <button type="button" onClick={onOpenCard} className="btn-secondary h-9 px-3 text-xs">
          Open Card
        </button>
        <button
          type="button"
          onClick={onSave}
          className={
            saved ? 'btn-secondary h-9 px-3 text-xs text-accent' : 'btn-secondary h-9 px-3 text-xs'
          }
          aria-pressed={saved}
        >
          <Bookmark className={`h-3.5 w-3.5 ${saved ? 'fill-current' : ''}`} />
          {saved ? 'Saved' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="btn-icon h-9 w-9"
          aria-label="Dismiss deal"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
}
