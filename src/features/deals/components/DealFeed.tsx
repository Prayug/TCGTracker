/* @refresh reset */
import { Percent } from 'lucide-react';
import { PageEmptyState } from '../../../components/common/PageEmptyState';
import type { Deal, DealFeedTab, DealsMeta } from '../types';
import { ebayRetryRemainingMs, formatEbayWait, isWaitingOnEbay } from '../types';
import { DealCard } from './DealCard';

export function DealFeed({
  deals,
  loading,
  error,
  tab,
  cardId,
  meta,
  savedIds,
  onOpen,
  onSave,
  onDismiss,
  onOpenCard,
  onRelaxFilters,
}: {
  deals: Deal[];
  loading: boolean;
  error?: string | null;
  tab: DealFeedTab;
  cardId?: string;
  meta: DealsMeta | null;
  savedIds: Set<string>;
  onOpen: (deal: Deal) => void;
  onSave: (deal: Deal) => void;
  onDismiss: (deal: Deal) => void;
  onOpenCard: (deal: Deal) => void;
  onRelaxFilters: () => void;
}) {
  if (loading && deals.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error && deals.length === 0) {
    return (
      <PageEmptyState
        icon={Percent}
        title="Could not load eBay deals"
        message="The marketplace scan failed. Try Refresh in a few seconds. Cached deals stay on the page when we already have them."
      />
    );
  }

  if (meta && !meta.ebayConfigured) {
    return (
      <PageEmptyState
        icon={Percent}
        title="eBay is not connected"
        message="Deals need the existing eBay Browse credentials. No listings are shown until the Browse API is available."
      />
    );
  }

  if (
    deals.length === 0 &&
    !meta?.scanning &&
    (meta?.error === 'unavailable' || meta?.error === 'rate_limited')
  ) {
    return (
      <PageEmptyState
        icon={Percent}
        title={
          meta.error === 'rate_limited'
            ? 'eBay rate-limited the scan'
            : 'eBay is temporarily unavailable'
        }
        message={
          meta.error === 'rate_limited'
            ? 'The crawl hit eBay’s request cap before listings could be compared. Wait about a minute, then tap Refresh.'
            : 'TCGTracker could not reach live listings. Try Refresh in a few minutes. Cached deals are shown when available.'
        }
      />
    );
  }

  if (deals.length === 0) {
    if (tab === 'review') {
      return (
        <PageEmptyState
          icon={Percent}
          title="Nothing to review"
          message="Suspicious, unusually cheap, or low-confidence matches appear here instead of the main feed."
        />
      );
    }
    if (tab === 'auctions') {
      return (
        <PageEmptyState
          icon={Percent}
          title="No auction opportunities right now"
          message="Auction bids are not treated as guaranteed deals. Listings that still look under market will show a suggested max bid."
        />
      );
    }
    if (tab === 'graded') {
      return (
        <PageEmptyState
          icon={Percent}
          title="No graded deals right now"
          message="Graded listings are only shown when TCGTracker has an exact company and grade price — a PSA 9 is never compared to a PSA 10."
          action={
            <button type="button" onClick={onRelaxFilters} className="btn-secondary">
              Lower minimum discount
            </button>
          }
        />
      );
    }
    if (meta?.candidateStrategy === 'card_not_found') {
      return (
        <PageEmptyState
          icon={Percent}
          title="This card is not in the current game catalog"
          message="Switch games or pick a card from Browse. Card watch only searches the selected game."
        />
      );
    }
    if (cardId) {
      return (
        <PageEmptyState
          icon={Percent}
          title="No live listings for this card"
          message="No current eBay listings matched this TCGTracker card at your filters."
          action={
            <button type="button" onClick={onRelaxFilters} className="btn-secondary">
              Lower minimum discount
            </button>
          }
        />
      );
    }
    if (meta?.scanning) {
      if (isWaitingOnEbay(meta)) {
        const wait = formatEbayWait(ebayRetryRemainingMs(meta));
        return (
          <PageEmptyState
            icon={Percent}
            title="eBay request limit reached"
            message={`eBay blocked further Browse calls for this app key. TCGTracker will try again in ${wait}. Leave this page open. Refresh will not help.`}
          />
        );
      }
      return (
        <PageEmptyState
          icon={Percent}
          title="Scanning all live eBay listings"
          message={
            meta.listingsScanned
              ? `${meta.listingsScanned.toLocaleString()} listings checked so far. The crawl pages through every result eBay returns for this game — not a 150-item sample.`
              : 'Paging through the full eBay catalog for this game. Matching deals will show up here as they are found.'
          }
        />
      );
    }
    return (
      <PageEmptyState
        icon={Percent}
        title="No deals meet your filters right now"
        message={
          meta?.listingsScanned
            ? `Compared ${meta.listingsScanned.toLocaleString()} live eBay listings to TCGTracker market value. None cleared the match and discount bar. Lower the minimum discount if you want weaker matches.`
            : 'Live listings are compared to TCGTracker market value. Lower the minimum discount if you want a wider set of matches.'
        }
        action={
          <button type="button" onClick={onRelaxFilters} className="btn-secondary">
            Lower minimum discount
          </button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {deals.map((deal) => (
        <DealCard
          key={deal.listingId}
          deal={deal}
          saved={savedIds.has(deal.listingId) || Boolean(deal.saved)}
          onOpen={() => onOpen(deal)}
          onSave={() => onSave(deal)}
          onDismiss={() => onDismiss(deal)}
          onOpenCard={() => onOpenCard(deal)}
        />
      ))}
    </div>
  );
}
