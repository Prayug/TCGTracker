/* @refresh reset */
import { useEffect, useMemo, useState } from 'react';
import { Bookmark, RefreshCw, Search } from 'lucide-react';
import { FilterChip } from '@/components/layout/PageShell';
import { PageEmptyState } from '../../../components/common/PageEmptyState';
import { InlineNotice } from '@/components/common/InlineNotice';
import { useCardModal } from '../../../contexts/CardModalContext';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { DEALS_LOAD_GAVE_UP } from '../../deals/hooks/useDeals';
import { useSavedDeals } from '../../deals/hooks/useSavedDeals';
import { DealDetail } from '../../deals/components/DealDetail';
import { DealFeed } from '../../deals/components/DealFeed';
import { DealFilters } from '../../deals/components/DealFilters';
import { DealScanProgress } from '../../deals/components/DealScanProgress';
import { DealSummary } from '../../deals/components/DealSummary';
import { scanProgressView } from '../../deals/scanProgress';
import type { Deal, DealFeedTab } from '../../deals/types';
import {
  ebayRetryRemainingMs,
  formatEbayWait,
  isLiveAuction,
  isWaitingOnEbay,
} from '../../deals/types';
import { useInvestmentLook } from '../hooks/useInvestmentLook';

const TABS: { id: DealFeedTab; label: string }[] = [
  { id: 'best', label: 'Best picks' },
  { id: 'raw', label: 'Raw' },
  { id: 'graded', label: 'Graded' },
  { id: 'auctions', label: 'Auctions' },
  { id: 'saved', label: 'Saved' },
  { id: 'review', label: 'Review' },
];

export function InvestmentLookPanel({ active }: { active: boolean }) {
  const {
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
  } = useInvestmentLook(active);
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
  const showScan = active && (!result || scanning);
  const reconnecting = Boolean(active && !result && (loading || error));
  const gaveUp = error === DEALS_LOAD_GAVE_UP;
  const noTargets = result?.meta.candidateStrategy === 'no_investment_targets';

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

  const rawTargets = result?.targets.filter((target) => target.kind === 'raw').length ?? 0;
  const slabTargets = result?.targets.filter((target) => target.kind === 'slab').length ?? 0;

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <p className="text-sm text-ink-secondary">
            Live eBay listings for cards the fair-entry strategy would buy and PSA 10 slabs scored
            watch or better. A listing at or under TCGTracker market is enough — Deals starts at a
            12% discount.
          </p>
          {result && !noTargets && (rawTargets > 0 || slabTargets > 0) && (
            <p className="text-xs text-ink-muted">
              Searching {rawTargets} fair-entry {rawTargets === 1 ? 'card' : 'cards'}
              {slabTargets > 0
                ? ` and ${slabTargets} PSA 10 ${slabTargets === 1 ? 'slab' : 'slabs'}`
                : ''}
              . Each row links to its eBay listing.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!scanning && !waitingForEbay && result?.meta.ebayConfigured && !noTargets && (
            <button
              type="button"
              onClick={fullRescan}
              title="Search the researched cards again"
              className="rounded-lg px-2 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink-secondary"
            >
              Full rescan
            </button>
          )}
          <button
            type="button"
            onClick={refresh}
            title="Check these cards on eBay again"
            disabled={waitingForEbay || noTargets}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-inset px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5${scanning || (reconnecting && !gaveUp) ? ' animate-spin' : ''}`}
            />
            {waitingForEbay
              ? `Waiting ${formatEbayWait(waitMs)}`
              : scanning
                ? scan.searchIndex && scan.searchTotal
                  ? `${quickScan ? 'Checking new' : 'Scanning'} ${scan.searchIndex}/${scan.searchTotal}`
                  : 'Reading research'
                : reconnecting
                  ? gaveUp
                    ? 'Retry'
                    : 'Connecting'
                  : 'Refresh'}
          </button>
        </div>
      </div>

      {error && visibleDeals.length > 0 && <InlineNotice>{error}</InlineNotice>}

      {summary && !noTargets && <DealSummary summary={summary} />}

      {noTargets ? (
        <PageEmptyState
          icon={Search}
          title="No researched cards for this game"
          message="Fair-entry picks and PSA 10 opportunity scores come from the Pokemon catalog. This game has no named cards to search on eBay."
        />
      ) : (
        <>
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
              Compared {result.meta.listingsScanned.toLocaleString()} live eBay listings on the
              researched cards to TCGTracker market value.
            </p>
          ) : null}

          {result?.meta?.error === 'rate_limited' && !scanning && (
            <p className="text-sm text-neon-amber">
              {`eBay rate-limited the scan${
                result.meta.listingsScanned
                  ? ` after ${result.meta.listingsScanned.toLocaleString()} listings`
                  : ''
              }. Wait a minute, then tap Refresh.`}
            </p>
          )}

          <div className="flex gap-1 overflow-x-auto rounded-xl border border-border-default bg-surface-inset p-1">
            {TABS.map((item) => (
              <FilterChip
                key={item.id}
                active={tab === item.id}
                onClick={() => setActiveTab(item.id)}
              >
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
                title="No saved listings"
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
                        <p className="text-xs uppercase tracking-wide text-ink-muted">
                          {row.status}
                        </p>
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
                      {row.currentMarketValue != null
                        ? formatCurrency(row.currentMarketValue)
                        : '—'}
                    </p>
                    <p className="text-xs text-ink-muted">
                      Listed {formatCurrency(row.listingPrice)}
                      {row.shippingPrice > 0
                        ? ` + ${formatCurrency(row.shippingPrice)} shipping`
                        : ''}
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
              meta={result?.meta ?? null}
              savedIds={savedIds}
              onOpen={setSelected}
              onSave={(deal) => void toggleSave(deal)}
              onDismiss={(deal) => void handleDismiss(deal)}
              onOpenCard={handleOpenCard}
              onRelaxFilters={relaxFilters}
            />
          )}
        </>
      )}

      {selected && <DealDetail deal={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
