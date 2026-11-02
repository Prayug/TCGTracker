import { Bookmark, ExternalLink, X } from 'lucide-react';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { Basis } from '../../../components/exchange/Price';
import type { Deal } from '../types';
import { RISK_FLAG_LABELS, isLiveAuction } from '../types';
import { cn } from '@/lib/utils';
import { PriceRuler } from './PriceRuler';

const CONFIDENCE_LABEL: Record<Deal['matchConfidenceTier'], string> = {
  high: 'Strong match',
  medium: 'Likely match',
  low: 'Weak match, check the listing',
  unresolved: 'Unconfirmed match',
};

function formatTimeRemaining(hours: number | null): string | null {
  if (hours == null) return null;
  if (hours < 0) return 'Ended';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m left`;
  if (hours < 24) return `${Math.round(hours)}h left`;
  return `${Math.round(hours / 24)}d left`;
}

/**
 * One eBay listing next to our market estimate. The listing figure is an
 * asking price or current bid, never a sale; the market figure carries its
 * source and date.
 */
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
  const live = isLiveAuction(deal);

  return (
    <article className="grid grid-cols-[5.5rem_minmax(0,1fr)] sm:grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 border-b border-rule py-4">
      <button
        type="button"
        onClick={onOpen}
        className="self-start overflow-hidden rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-label={`Details for ${deal.cardName} listing`}
      >
        {deal.listingImage ? (
          <img
            src={deal.listingImage}
            alt=""
            loading="lazy"
            className="aspect-[3/4] w-full bg-surface-inset object-cover"
          />
        ) : deal.cardImage ? (
          <span className="relative block">
            <img
              src={deal.cardImage}
              alt=""
              loading="lazy"
              className="aspect-[5/7] w-full object-contain"
            />
            <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[10px] text-white">
              Reference art
            </span>
          </span>
        ) : (
          <span className="grid aspect-[3/4] w-full place-items-center border border-dashed border-border-strong text-[11px] text-ink-muted">
            No photo
          </span>
        )}
      </button>

      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onOpen}
              className="block max-w-full truncate text-left text-[14.5px] font-medium hover:underline"
            >
              {deal.cardName}
            </button>
            <p className="truncate text-[12px] text-ink-muted">
              {deal.setName}
              {deal.cardNumber ? ` · ${deal.cardNumber}` : ''} · {deal.gradeLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink-primary"
            aria-label={`Dismiss ${deal.cardName} deal`}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          <div>
            <dt className="text-meta text-ink-muted">{live ? 'Current bid' : 'Asking, all in'}</dt>
            <dd className="font-mono text-[17px] tabular-nums">
              {formatCurrency(live ? deal.listingPrice : deal.allInCost)}
            </dd>
            {!live && deal.shipping > 0 ? (
              <dd className="text-[11.5px] text-ink-muted">
                {formatCurrency(deal.listingPrice)} + {formatCurrency(deal.shipping)} shipping
              </dd>
            ) : null}
          </div>
          <div>
            <dt className="text-meta text-ink-muted">Market estimate</dt>
            <dd className="font-mono text-[17px] tabular-nums text-ink-secondary">
              {formatCurrency(deal.marketValue)}
            </dd>
            <dd>
              <Basis
                kind={deal.marketSource}
                asOf={deal.marketUpdatedAt}
                stale={deal.marketStale}
                className="text-[11.5px]"
              />
            </dd>
          </div>
        </dl>

        <PriceRuler
          ask={live ? deal.listingPrice : deal.allInCost}
          market={deal.marketValue}
          askLabel={live ? 'Bid' : 'Ask'}
          showSaving={!live}
        />

        {!live ? (
          <p className="text-[13px] font-medium text-gain">
            {formatCurrency(deal.discountAmount)} ({formatPercent(deal.discountPercent)}) under the
            market estimate
          </p>
        ) : null}
        {deal.listingType === 'auction' && deal.maxBid != null ? (
          <p className="mt-1 text-[12.5px] text-ink-secondary">
            Bid up to {formatCurrency(deal.maxBid)} to keep a {deal.desiredAuctionMargin}% margin
          </p>
        ) : null}

        <p className="mt-2 text-[12px] text-ink-muted">
          <span
            className={cn(
              deal.matchConfidenceTier === 'low' || deal.matchConfidenceTier === 'unresolved'
                ? 'text-warn'
                : undefined
            )}
          >
            {CONFIDENCE_LABEL[deal.matchConfidenceTier]}
          </span>
          {' · '}
          {deal.listingType === 'auction' ? (live ? 'Live auction' : 'Auction') : 'Buy It Now'}
          {remaining ? ` · ${remaining}` : ''}
          {deal.liquidityLabel ? ` · ${deal.liquidityLabel}` : ''}
        </p>
        {visibleFlags.length ? (
          <ul className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-warn">
            {visibleFlags.map((flag) => (
              <li key={flag}>{RISK_FLAG_LABELS[flag]}</li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href={deal.listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary h-9"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            View on eBay
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <button type="button" onClick={onOpenCard} className="btn-secondary h-9">
            Card details
          </button>
          <button
            type="button"
            onClick={onSave}
            className={cn('btn-ghost h-9', saved && 'text-accent')}
            aria-pressed={saved}
          >
            <Bookmark className={cn('h-4 w-4', saved && 'fill-current')} aria-hidden />
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
    </article>
  );
}
