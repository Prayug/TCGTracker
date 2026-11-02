/* @refresh reset */
import { useEffect, useMemo, useState } from 'react';
import { Bookmark, RefreshCw } from 'lucide-react';
import { PageHeader, PageShell } from '../../../components/layout/PageShell';
import { Price } from '../../../components/exchange/Price';
import { PageEmptyState } from '../../../components/common/PageEmptyState';
import { useCardModal } from '../../../contexts/CardModalContext';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { DEALS_LOAD_GAVE_UP, useDeals } from '../hooks/useDeals';
import { useSavedDeals } from '../hooks/useSavedDeals';
import type { Deal, DealFeedTab } from '../types';
import { ebayRetryRemainingMs, formatEbayWait, isLiveAuction, isWaitingOnEbay } from '../types';
import { scanProgressView } from '../scanProgress';
import { DealDetail } from './DealDetail';
import { DealFeed } from './DealFeed';
import { DealFilters } from './DealFilters';
import { DealScanProgress } from './DealScanProgress';
import { DealSummary } from './DealSummary';
import { InlineNotice } from '@/components/common/InlineNotice';

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
    fullRescan,
    relaxFilters,
  } = useDeals();
  const { saved, savedIds, loading: savedLoading, toggleSave, dismiss } = useSavedDeals();
  const { openCard } = useCardModal();
  const [selected, setSelected] = useState<Deal | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(() => Date.now());
  const waitingForEbay = isWaitingOnEbay(result?.meta, now);
  const waitMs = ebayRetryRemainingMs(result?.meta, now);
  const scanning = Boolean(result?.meta.scanning);
  const quickScan = result?.meta.scanMode === 'quick';
  const scan = scanProgressView(result?.meta);
  const showScan = !result || scanning;
  const reconnecting = Boolean(!result && (loading || error));
  const gaveUp = error === DEALS_LOAD_GAVE_UP;

  useEffect(() => {
    if (!showScan) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [showScan]);

  const visibleDeals = useMemo(
    () => deals.filter((deal) => !dismissed.has(deal.listingId)),
    [deals, dismissed]
  );

  const summary = useMemo(() => {
    if (tab === 'review' || tab === 'saved' || !result) return result?.summary ?? null;
    const list = visibleDeals;
    const priced = list.filter((d) => !isLiveAuction(d));
    const discounts = priced.map((d) => d.discountPercent);
    const mid = discounts.length
      ? [...discounts].sort((a, b) => a - b)[Math.floor(discounts.length / 2)]
      : null;
    return {
      bestDeal: priced[0] ?? null,
      dealsFound: list.length,
      medianDiscount: mid,
      potentialSavings:
        Math.round(priced.reduce((sum, d) => sum + Math.max(0, d.discountAmount), 0) * 100) / 100,
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
    <PageShell wide>
      <PageHeader
        title="eBay deals"
        description="Live listings for this game compared to TCGTracker market value. If eBay rate-limits, leave this page open."
        actions={
          <div className="flex items-center gap-2">
            {!scanning && !waitingForEbay && result?.meta.ebayConfigured && (
              <button
                type="button"
                onClick={fullRescan}
                title="Walk every eBay search again instead of only listings posted since the last scan"
                className="btn-ghost"
              >
                Full rescan
              </button>
            )}
            <button
              type="button"
              onClick={refresh}
              title="Check listings posted since the last scan"
              disabled={waitingForEbay}
              className="btn-secondary"
            >
              <RefreshCw
                className={`h-4 w-4${scanning || (reconnecting && !gaveUp) ? ' animate-spin motion-reduce:animate-none' : ''}`}
                aria-hidden
              />
              {waitingForEbay
                ? `Waiting ${formatEbayWait(waitMs)}`
                : scanning
                  ? scan.searchIndex && scan.searchTotal
                    ? `${quickScan ? 'Checking new' : 'Scanning'} ${scan.searchIndex}/${scan.searchTotal}`
                    : quickScan
                      ? 'Checking new'
                      : 'Scanning'
                  : reconnecting
                    ? gaveUp
                      ? 'Retry'
                      : 'Connecting'
                    : 'Refresh'}
            </button>
          </div>
        }
      />

      {cardId && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-accent pl-3 text-[13px]">
          <p className="text-ink-secondary">
            Card watch: live eBay listings for this TCGTracker card.
          </p>
          <button type="button" onClick={clearCardWatch} className="btn-secondary h-8 text-xs">
            Back to market scan
          </button>
        </div>
      )}

      {error && visibleDeals.length > 0 && <InlineNotice>{error}</InlineNotice>}

      {summary && <DealSummary summary={summary} />}

      {showScan ? (
        <DealScanProgress
          meta={result?.meta ?? null}
          dealsFound={summary?.dealsFound ?? result?.summary.dealsFound ?? 0}
          compact={visibleDeals.length > 0}
          now={now}
          notice={!result ? error : null}
        />
      ) : result?.meta && result.meta.listingsScanned > 0 ? (
        <p className="text-sm text-ink-secondary">
          Compared {result.meta.listingsScanned.toLocaleString()} live eBay listings to TCGTracker
          market value.
        </p>
      ) : null}

      {result?.meta?.error === 'rate_limited' && !scanning && (
        <p className="text-[13px] text-warn" role="status">
          {`eBay rate-limited the scan${
            result.meta.listingsScanned
              ? ` after ${result.meta.listingsScanned.toLocaleString()} listings`
              : ''
          }. Wait a minute, then tap Refresh.`}
        </p>
      )}

      <div
        role="tablist"
        aria-label="Deal feeds"
        className="flex gap-1 overflow-x-auto border-b border-rule"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setActiveTab(item.id)}
            className={`-mb-px h-10 shrink-0 border-b-2 px-2.5 text-[13.5px] font-medium transition-colors ${
              tab === item.id
                ? 'border-ink-primary text-ink-primary'
                : 'border-transparent text-ink-muted hover:text-ink-primary'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab !== 'saved' && <DealFilters filters={filters} onChange={setFilters} />}

      {tab === 'saved' ? (
        savedLoading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent motion-reduce:animate-none" />
          </div>
        ) : saved.length === 0 ? (
          <PageEmptyState
            icon={Bookmark}
            title="No saved deals"
            message="Save a listing to keep its market snapshot. Current TCGTracker value is shown beside the price you saved."
          />
        ) : (
          <table className="ledger ledger-tight">
            <caption className="sr-only">Saved deals</caption>
            <thead>
              <tr>
                <th scope="col">Listing</th>
                <th scope="col" className="num">
                  Asking, all in
                </th>
                <th scope="col" className="num hidden sm:table-cell">
                  Market when saved
                </th>
                <th scope="col" className="num">
                  Market now
                </th>
              </tr>
            </thead>
            <tbody>
              {saved.map((row) => (
                <tr key={row.id}>
                  <th scope="row" className="text-left font-normal">
                    <a
                      href={row.listingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block max-w-[40vw] truncate font-medium hover:underline sm:max-w-[24rem]"
                    >
                      {row.cardId}
                      <span className="sr-only"> on eBay (opens in a new tab)</span>
                    </a>
                    <span className="block text-[12px] text-ink-muted">
                      {row.status} · {formatPercent(row.discountPercentSnapshot)} under market when
                      saved
                    </span>
                  </th>
                  <td className="num">
                    {formatCurrency(
                      row.listingPrice + (row.shippingPrice > 0 ? row.shippingPrice : 0)
                    )}
                  </td>
                  <td className="num hidden sm:table-cell">
                    {formatCurrency(row.marketPriceSnapshot)}
                  </td>
                  <td className="num">
                    <Price value={row.currentMarketValue} size="sm" unavailableLabel="No price" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </PageShell>
  );
}
