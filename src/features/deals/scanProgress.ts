import type { DealsMeta } from './types';

export interface ScanProgressView {
  /** 1-based index of the search in progress. Null until the plan is known. */
  searchIndex: number | null;
  searchTotal: number;
  /** 0–100 fill of the current search. Null until eBay reports how many listings it has. */
  searchPercent: number | null;
  /** 0–100 of the whole crawl. Null until the plan is known. */
  overallPercent: number | null;
  searchLabel: string | null;
  listingsChecked: number;
  listingsFetched: number;
  searchListingsSeen: number;
  searchListingsTotal: number | null;
}

export function scanProgressView(meta: DealsMeta | null | undefined): ScanProgressView {
  const listingsChecked = meta?.listingsScanned ?? 0;
  const listingsFetched = meta?.listingsFetched ?? 0;
  const searchTotal = Math.max(0, meta?.queriesTotal ?? 0);
  const done = Math.max(0, Math.min(meta?.queriesDone ?? 0, searchTotal));
  const seen = Math.max(0, meta?.queryOffset ?? 0);
  const reachable = meta?.queryReachable ?? null;
  const searchLabel = meta?.queryLabel ?? null;

  if (!meta || searchTotal <= 0) {
    return {
      searchIndex: null,
      searchTotal: 0,
      searchPercent: null,
      overallPercent: null,
      searchLabel,
      listingsChecked,
      listingsFetched,
      searchListingsSeen: seen,
      searchListingsTotal: reachable,
    };
  }

  const slice = reachable != null && reachable > 0 ? Math.min(1, seen / reachable) : 0;
  const inProgress = meta.scanning && done < searchTotal;
  const overall = ((done + (inProgress ? slice : 0)) / searchTotal) * 100;
  const searchPercent =
    !inProgress || reachable == null || reachable <= 0
      ? inProgress
        ? null
        : 100
      : Math.min(100, (seen / reachable) * 100);

  return {
    searchIndex: inProgress ? done + 1 : searchTotal,
    searchTotal,
    searchPercent,
    overallPercent: Math.min(100, overall),
    searchLabel,
    listingsChecked,
    listingsFetched,
    searchListingsSeen: seen,
    searchListingsTotal: reachable != null && reachable > 0 ? reachable : null,
  };
}

export function formatScanPercent(percent: number | null): string {
  if (percent == null || !Number.isFinite(percent)) return '—';
  const clamped = Math.min(100, Math.max(0, percent));
  if (clamped > 0 && clamped < 10) {
    const tenths = Math.round(clamped * 10) / 10;
    return Number.isInteger(tenths) ? `${tenths}%` : `${tenths.toFixed(1)}%`;
  }
  return `${Math.round(clamped)}%`;
}

export function formatUpdatedAgo(iso: string | undefined, now: number): string {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const sec = Math.max(0, Math.round((now - then) / 1000));
  if (sec < 5) return 'Updated just now';
  if (sec < 60) return `Updated ${sec}s ago`;
  const min = Math.floor(sec / 60);
  return min === 1 ? 'Updated 1 min ago' : `Updated ${min} min ago`;
}
