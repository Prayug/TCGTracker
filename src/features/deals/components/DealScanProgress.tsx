import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '../../../hooks/useMotionPreferences';
import { formatScanPercent, formatUpdatedAgo, scanProgressView } from '../scanProgress';
import type { DealsMeta } from '../types';
import { ebayRetryRemainingMs, formatEbayWait } from '../types';

function ProgressTrack({
  label,
  percent,
  reduced,
}: {
  label: string;
  percent: number | null;
  reduced: boolean;
}) {
  const indeterminate = percent == null;
  return (
    <div
      className="h-1.5 overflow-hidden rounded-sm bg-surface-hover"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(percent)}
      aria-valuetext={indeterminate ? 'In progress' : formatScanPercent(percent)}
      aria-busy="true"
    >
      <div
        className={cn(
          'h-full bg-ink-primary',
          !reduced && 'transition-[width] duration-700 ease-out',
          indeterminate && !reduced && 'w-1/3 animate-pulse',
          indeterminate && reduced && 'w-1/3 opacity-70'
        )}
        style={indeterminate ? undefined : { width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

export function DealScanProgress({
  meta,
  dealsFound,
  compact = false,
  now,
  notice = null,
}: {
  meta: DealsMeta | null;
  dealsFound: number;
  compact?: boolean;
  now: number;
  notice?: string | null;
}) {
  const reduced = usePrefersReducedMotion();
  const view = scanProgressView(meta);
  const waitMs = ebayRetryRemainingMs(meta, now);
  const paused = waitMs > 2_000;
  const thisSearch =
    view.searchListingsTotal != null
      ? `${view.searchListingsSeen.toLocaleString()} of ${view.searchListingsTotal.toLocaleString()}`
      : view.searchLabel
        ? 'Counting'
        : '—';

  const status = notice
    ? notice
    : paused
      ? `eBay paused this scan. Next try in ${formatEbayWait(waitMs)}. Leave this page open.`
      : !meta
        ? 'Fetching the latest crawl status.'
        : view.searchTotal === 0
          ? 'Counting the searches for this game.'
          : !view.searchLabel
            ? `Queued. ${view.searchTotal} searches to run.`
            : view.listingsFetched > view.listingsChecked + 10
              ? `Comparing listings to market value: ${view.listingsChecked.toLocaleString()} of ${view.listingsFetched.toLocaleString()} checked.`
              : 'Deals show up below as soon as a listing beats your filters.';

  const afterThisSearch =
    view.searchTotal > 0 && view.searchIndex != null
      ? Math.max(0, view.searchTotal - view.searchIndex)
      : null;

  const facts = [
    view.searchTotal > 0 && view.searchIndex != null
      ? `Search ${view.searchIndex} of ${view.searchTotal}`
      : null,
    view.overallPercent != null ? `${formatScanPercent(view.overallPercent)} overall` : null,
    `${view.listingsChecked.toLocaleString()} listings checked`,
    view.listingsFetched > view.listingsChecked
      ? `${(view.listingsFetched - view.listingsChecked).toLocaleString()} still comparing`
      : null,
    `${dealsFound.toLocaleString()} deal${dealsFound === 1 ? '' : 's'} matched`,
    !compact && afterThisSearch != null && afterThisSearch > 0
      ? `${afterThisSearch.toLocaleString()} searches left`
      : null,
  ].filter(Boolean) as string[];

  return (
    <section
      aria-label="eBay scan progress"
      aria-live="polite"
      className="space-y-2 border-y border-rule py-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13.5px] font-medium">
          {notice ? 'Reconnecting to the scan' : paused ? 'Scan paused by eBay' : 'Scanning eBay'}
        </p>
        <p className="text-[12px] text-ink-muted">{formatUpdatedAgo(meta?.fetchedAt, now)}</p>
      </div>
      <ProgressTrack label="Whole eBay scan" percent={view.overallPercent} reduced={reduced} />
      <p className="font-mono text-[12.5px] tabular-nums text-ink-secondary">{facts.join(' · ')}</p>
      {view.searchLabel ? (
        <p className="text-[12px] text-ink-muted">
          Now searching “{view.searchLabel}”{thisSearch !== '—' ? `, ${thisSearch} listings` : ''}
          {view.searchPercent != null ? ` (${formatScanPercent(view.searchPercent)})` : ''}
        </p>
      ) : null}
      <p className={cn('text-[12.5px]', paused || notice ? 'text-warn' : 'text-ink-muted')}>
        {status}
      </p>
    </section>
  );
}
