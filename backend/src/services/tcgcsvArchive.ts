/**
 * TCGCSV publishes a daily archive of every TCGplayer price file back to
 * 2024-02-08 (https://tcgcsv.com/docs → "Archives"). Our own daily sync only
 * started writing `tcgcsv` rows in Feb 2026, so these archives are the only
 * way to give backtests more than a few months of raw-card history.
 *
 * Pure helpers live here (no DB / network) so they can be unit tested; the
 * runner is `src/scripts/backfillTcgcsvArchive.ts`.
 */

export const TCGCSV_ARCHIVE_FIRST_DATE = '2024-02-08';
export const POKEMON_CATEGORY_ID = 3;

export function archiveUrl(date: string): string {
  return `https://tcgcsv.com/archive/tcgplayer/prices-${date}.ppmd.7z`;
}

/** "Reverse Holofoil", "reverseHolofoil" and "reverse-holofoil" all → "reverseholofoil". */
export function normalizeSubType(subTypeName: string | null | undefined): string {
  return String(subTypeName ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function mappingKey(productId: number, subTypeName: string | null | undefined): string {
  return `${productId}:${normalizeSubType(subTypeName)}`;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive date list from `from` to `to`, stepping `everyDays`. */
export function backfillDates(from: string, to: string, everyDays: number): string[] {
  const step = Math.max(1, Math.floor(everyDays));
  const start = from < TCGCSV_ARCHIVE_FIRST_DATE ? TCGCSV_ARCHIVE_FIRST_DATE : from;
  const out: string[] = [];
  for (let d = start; d <= to; d = addDays(d, step)) out.push(d);
  return out;
}

export interface ArchivePriceRow {
  productId: number;
  subTypeName: string;
  marketPrice: number | null;
  midPrice: number | null;
  lowPrice: number | null;
  highPrice: number | null;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Parse one `<date>/<categoryId>/<groupId>/prices` JSON file. */
export function parseArchivePricesFile(text: string): ArchivePriceRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const results = (parsed as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  const rows: ArchivePriceRow[] = [];
  for (const r of results as Record<string, unknown>[]) {
    const productId = Number(r.productId);
    if (!Number.isFinite(productId) || productId <= 0) continue;
    rows.push({
      productId,
      subTypeName: String(r.subTypeName ?? ''),
      marketPrice: num(r.marketPrice),
      midPrice: num(r.midPrice),
      lowPrice: num(r.lowPrice),
      highPrice: num(r.highPrice),
    });
  }
  return rows;
}

/** Same preference as the live sync: market, then mid. Null when unpriced. */
export function archiveRowPrice(row: ArchivePriceRow): number | null {
  return row.marketPrice ?? row.midPrice ?? null;
}
