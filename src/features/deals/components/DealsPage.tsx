/* @refresh reset */
import { useEffect, useMemo, useState } from 'react';
import { Bookmark, RefreshCw } from 'lucide-react';
import { FilterChip, PageHeader } from '../../../components/layout/PageShell';
import { PageEmptyState } from '../../../components/common/PageEmptyState';
import { useCardModal } from '../../../contexts/CardModalContext';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { useDeals } from '../hooks/useDeals';
import { useSavedDeals } from '../hooks/useSavedDeals';
import type { Deal, DealFeedTab } from '../types';
import { ebayRetryRemainingMs, formatEbayWait, isWaitingOnEbay } from '../types';
import { DealDetail } from './DealDetail';
import { DealFeed } from './DealFeed';
import { DealFilters } from './DealFilters';
import { DealSummary } from './DealSummary';

const TABS: { id: DealFeedTab; label: string }[] = [
  { id: 'best', label: 'Best Deals' },
  { id: 'raw', label: 'Raw' },
  { id: 'graded', label: 'Graded' },
  { id: 'auctions', label: 'Auctions' },
  { id: 'saved', label: 'Saved' },
  { id: 'review', label: 'Review' },
];

export function DealsPage() {
  const {
    cardId,
    clearCardWatch,
    tab,
    setActiveTab,
    filters,
    setFilters,
    result,
    deals,
    loading,
    error,
    refresh,
    relaxFilters,
  } = useDeals();
  const { saved, savedIds, loading: savedLoading, toggleSave, dismiss } = useSavedDeals();
  const { openCard } = useCardModal();
  const [selected, setSelected] = useState<Deal | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(() => Date.now());
  const waitingForEbay = isWaitingOnEbay(result?.meta, now);
  const waitMs = ebayRetryRemainingMs(result?.meta, now);

  useEffect(() => {
    if (!waitingForEbay && waitMs <= 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [waitingForEbay, result?.meta.fetchedAt, result?.meta.retryInMs]);

  const visibleDeals = useMemo(
    () => deals.filter((deal) => !dismissed.has(deal.listingId)),
    [deals, dismissed]
  );

  const summary = useMemo(() => {
    if (tab === 'review' || tab === 'saved' || !result) return result?.summary ?? null;
    const list = visibleDeals;
    const discounts = list.map((d) => d.discountPercent);
    const mid = discounts.length
      ? [...discounts].sort((a, b) => a - b)[Math.floor(discounts.length / 2)]
      : null;
    return {
      bestDeal: list[0] ?? null,
      dealsFound: list.length,
      medianDiscount: mid,
      potentialSavings:
        Math.round(list.reduce((sum, d) => sum + Math.max(0, d.discountAmount), 0) * 100) / 100,
    };
  }, [result, tab, visibleDeals]);

  const handleDismiss = async (deal: Deal) => {
    setDismissed((prev) => new Set(prev).add(deal.listingId));
    if (selected?.listingId === deal.listingId) setSelected(null);
    try {
      await dismiss(deal.listingId);
    } catch {
      /* guest users keep the local hide */
    }
  };

  const handleOpenCard = (deal: Deal) => {
    openCard({
      id: deal.cardId,
      name: deal.cardName,
      images: { small: deal.cardImage || '', large: deal.cardImage || '' },
      set: { id: deal.setId, name: deal.setName, releaseDate: '', total: 0 },
      number: deal.cardNumber || '',
      rarity: deal.rarity || undefined,
      language: deal.language === 'ja' ? 'ja' : 'en',
    });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Market"
        title="eBay Deals"
        description="Compares live eBay listings for this game to TCGTracker market value. If eBay asks us to wait, leave this page open. Refresh during a cooldown restarts the wait."
        actions={
          <button
            type="button"
            onClick={refresh}
            disabled={waitingForEbay}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-inset px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5${result?.meta.scanning ? ' animate-spin' : ''}`} />
            {waitingForEbay ? 'Waiting' : result?.meta.scanning ? 'Scanning' : 'Refresh'}
          </button>
        }
      />

      {cardId && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm">
          <p className="text-ink-secondary">
            Card watch: live eBay listings for this TCGTracker card.
          </p>
          <button type="button" onClick={clearCardWatch} className="btn-secondary h-8 text-xs">
            Back to market scan
          </button>
        </div>
      )}

      {error && visibleDeals.length > 0 && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {summary && <DealSummary summary={summary} />}

      {result?.meta && (result.meta.scanning || result.meta.listingsScanned > 0) && (
        <p className={`text-sm ${waitingForEbay ? 'text-amber-400' : 'text-ink-secondary'}`}>
          {waitingForEbay
            ? `eBay hit this app's request limit. Next try in ${formatEbayWait(waitMs)}. Leave this page open — Refresh will not unlock more calls.`
            : result.meta.scanning
              ? `Scanning every live eBay listing in this game — ${result.meta.listingsScanned.toLocaleString()} checked so far${
                  result.meta.ebayTotal && result.meta.ebayTotal < 200_000
                    ? ` of about ${result.meta.ebayTotal.toLocaleString()} reachable results`
                    : ''
                }. Deals appear as they match.`
              : `Compared ${result.meta.listingsScanned.toLocaleString()} live eBay listings to TCGTracker market value.`}
        </p>
      )}

      {result?.meta?.error === 'rate_limited' && !waitingForEbay && (
        <p className="text-sm text-amber-400">
          {result.meta.scanning
            ? 'eBay rate-limited the crawl. Backing off, then continuing from the same page.'
            : `eBay rate-limited the scan${result.meta.listingsScanned ? ` after ${result.meta.listingsScanned.toLocaleString()} listings` : ''}. Wait a minute, then tap Refresh.`}
        </p>
      )}

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border-default bg-surface-inset p-1">
        {TABS.map((item) => (
          <FilterChip key={item.id} active={tab === item.id} onClick={() => setActiveTab(item.id)}>
            {item.label}
          </FilterChip>
        ))}
      </div>

      {tab !== 'saved' && <DealFilters filters={filters} onChange={setFilters} />}

      {tab === 'saved' ? (
        savedLoading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : saved.length === 0 ? (
          <PageEmptyState
            icon={Bookmark}
            title="No saved deals"
            message="Save a listing to keep its market snapshot. Current TCGTracker value is shown beside the price you saved."
          />
        ) : (
          <div className="space-y-3">
            {saved.map((row) => (
              <div
                key={row.id}
                className="rounded-xl border border-border-default bg-surface-raised p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink-primary">{row.cardId}</p>
                    <p className="text-xs uppercase tracking-wide text-ink-muted">{row.status}</p>
                  </div>
                  <a
                    href={row.listingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary h-8 text-xs"
                  >
                    View on eBay
                  </a>
                </div>
                <p className="mt-2 text-sm text-ink-secondary">
                  Saved at {formatCurrency(row.marketPriceSnapshot)} market ·{' '}
                  {formatPercent(row.discountPercentSnapshot)} discount
                </p>
                <p className="text-sm text-ink-secondary">
                  Current:{' '}
                  {row.currentMarketValue != null ? formatCurrency(row.currentMarketValue) : '—'}
                </p>
                <p className="text-xs text-ink-muted">
                  Listed {formatCurrency(row.listingPrice)}
                  {row.shippingPrice > 0 ? ` + ${formatCurrency(row.shippingPrice)} shipping` : ''}
                </p>
              </div>
            ))}
          </div>
        )
      ) : (
        <DealFeed
          deals={visibleDeals}
          loading={loading}
          error={error}
          tab={tab}
          cardId={cardId}
          meta={result?.meta ?? null}
          savedIds={savedIds}
          onOpen={setSelected}
          onSave={(deal) => void toggleSave(deal)}
          onDismiss={(deal) => void handleDismiss(deal)}
          onOpenCard={handleOpenCard}
          onRelaxFilters={relaxFilters}
        />
      )}

      {selected && <DealDetail deal={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
