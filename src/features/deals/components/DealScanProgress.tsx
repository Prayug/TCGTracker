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
      className="h-2.5 overflow-hidden rounded-full bg-black/40"
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
          'h-full rounded-full bg-accent',
          !reduced && 'transition-[width] duration-700 ease-out',
          indeterminate && !reduced && 'w-1/3 animate-pulse',
          indeterminate && reduced && 'w-1/3 opacity-70'
        )}
        style={indeterminate ? undefined : { width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="min-w-0 rounded-xl bg-black/20 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">{label}</p>
      <p className="mt-1 font-mono text-base font-semibold tabular-nums text-ink-primary sm:text-lg">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-ink-secondary">{hint}</p> : null}
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
              ? `Comparing listings to market value — ${view.listingsChecked.toLocaleString()} of ${view.listingsFetched.toLocaleString()} checked.`
              : 'Deals show up below as soon as a listing beats your filters.';

  const checkedLabel = `${view.listingsChecked.toLocaleString()} checked`;
  const afterThisSearch =
    view.searchTotal > 0 && view.searchIndex != null
      ? Math.max(0, view.searchTotal - view.searchIndex)
      : null;

  if (compact) {
    return (
      <div className="card-chrome space-y-3" aria-live="polite">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                Search
              </p>
              <p className="font-mono text-2xl font-semibold tabular-nums text-ink-primary">
                {view.searchIndex ?? '—'}
                <span className="text-base font-medium text-ink-muted">
                  {' '}
                  / {view.searchTotal || '—'}
                </span>
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                This search
              </p>
              <p className="font-mono text-2xl font-semibold tabular-nums text-accent">
                {formatScanPercent(view.searchPercent)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                Overall
              </p>
              <p className="font-mono text-2xl font-semibold tabular-nums text-ink-primary">
                {formatScanPercent(view.overallPercent)}
              </p>
            </div>
          </div>
          <p className="text-xs text-ink-muted">{formatUpdatedAgo(meta?.fetchedAt, now)}</p>
        </div>
        <ProgressTrack label="Current eBay search" percent={view.searchPercent} reduced={reduced} />
        <p className={cn('text-sm', paused ? 'text-amber-400' : 'text-ink-secondary')}>
          {paused
            ? status
            : [view.searchLabel, thisSearch === '—' ? null : thisSearch, checkedLabel]
                .filter(Boolean)
                .join(' · ')}
        </p>
      </div>
    );
  }

  return (
    <div className="card-chrome space-y-5" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-muted">
            Scan progress
          </p>
          <p className="mt-2 font-mono text-5xl font-semibold tabular-nums tracking-tight text-ink-primary">
            {view.searchTotal > 0 ? (
              <>
                {view.searchIndex}
                <span className="ml-2 text-2xl font-medium text-ink-muted">
                  / {view.searchTotal}
                </span>
              </>
            ) : (
              <span className="text-ink-muted">…</span>
            )}
          </p>
          <p className="mt-1 text-sm text-ink-secondary">
            {notice
              ? 'Reconnecting'
              : view.searchTotal > 0
                ? 'Searches through live eBay listings'
                : 'Starting the scan'}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-3xl font-semibold tabular-nums text-accent">
            {formatScanPercent(view.overallPercent)}
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.12em] text-ink-muted">Overall</p>
          <p className="mt-2 text-xs text-ink-muted">{formatUpdatedAgo(meta?.fetchedAt, now)}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="font-medium uppercase tracking-[0.12em] text-ink-muted">
              This search
            </span>
            <span className="font-mono tabular-nums text-ink-secondary">
              {formatScanPercent(view.searchPercent)}
              {view.searchLabel ? ` · ${view.searchLabel}` : ''}
            </span>
          </div>
          <ProgressTrack
            label="Current eBay search"
            percent={view.searchPercent}
            reduced={reduced}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="font-medium uppercase tracking-[0.12em] text-ink-muted">
              Whole scan
            </span>
            <span className="font-mono tabular-nums text-ink-secondary">
              {formatScanPercent(view.overallPercent)}
            </span>
          </div>
          <ProgressTrack label="Whole eBay scan" percent={view.overallPercent} reduced={reduced} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Listings checked"
          value={view.listingsChecked.toLocaleString()}
          hint={
            view.listingsFetched > view.listingsChecked
              ? `${view.listingsFetched.toLocaleString()} fetched, still comparing`
              : undefined
          }
        />
        <Metric label="In this search" value={thisSearch} hint={view.searchLabel} />
        <Metric label="Deals matched" value={dealsFound.toLocaleString()} />
        <Metric
          label="After this search"
          value={afterThisSearch == null ? '—' : afterThisSearch.toLocaleString()}
        />
      </div>

      <p className={cn('text-sm', paused || notice ? 'text-amber-400' : 'text-ink-secondary')}>
        {status}
      </p>
    </div>
  );
}
