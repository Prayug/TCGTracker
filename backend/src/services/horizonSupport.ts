import { getDb } from '../db/database';

/** Horizons we may emit. Longer ones require enough price history to be honest. */
export type HorizonDays = 7 | 30 | 90 | 180 | 365;
export type PredictionWindow = `${HorizonDays}d`;

export interface HorizonSupportStatus {
  historyDays: number;
  historyMinDate: string | null;
  historyMaxDate: string | null;
  supported: HorizonDays[];
  experimental: HorizonDays[];
  unsupported: HorizonDays[];
  /** Minimum calendar days of price history required before a horizon is "supported". */
  requirements: Record<HorizonDays, number>;
}

/** Need ≥ horizon days of span (with a small buffer) before claiming the horizon. */
export const HORIZON_HISTORY_REQUIREMENTS: Record<HorizonDays, number> = {
  7: 14,
  30: 45,
  90: 120,
  180: 220,
  365: 400,
};

const ALL_HORIZONS: HorizonDays[] = [7, 30, 90, 180, 365];

let cachedStatus: HorizonSupportStatus | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function getPriceHistorySpanDays(): Promise<{
  days: number;
  minDate: string | null;
  maxDate: string | null;
}> {
  const db = getDb();
  const row: { minDate: string | null; maxDate: string | null; days: number | null } | undefined =
    await new Promise((resolve, reject) => {
      db.get(
        `SELECT MIN(date) AS minDate, MAX(date) AS maxDate,
                CAST(julianday(MAX(date)) - julianday(MIN(date)) AS INTEGER) AS days
         FROM price_history
         WHERE source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')`,
        [],
        (err, r) => (err ? reject(err) : resolve(r as any))
      );
    });
  return {
    days: row?.days ?? 0,
    minDate: row?.minDate ?? null,
    maxDate: row?.maxDate ?? null,
  };
}

export async function getHorizonSupportStatus(force = false): Promise<HorizonSupportStatus> {
  if (!force && cachedStatus && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedStatus;
  }

  const span = await getPriceHistorySpanDays();
  const supported: HorizonDays[] = [];
  const experimental: HorizonDays[] = [];
  const unsupported: HorizonDays[] = [];

  for (const h of ALL_HORIZONS) {
    const need = HORIZON_HISTORY_REQUIREMENTS[h];
    if (span.days >= need) {
      supported.push(h);
    } else if (span.days >= Math.floor(need * 0.55)) {
      // Enough to compute a scaled estimate, but not enough for mature forward tests.
      experimental.push(h);
    } else {
      unsupported.push(h);
    }
  }

  cachedStatus = {
    historyDays: span.days,
    historyMinDate: span.minDate,
    historyMaxDate: span.maxDate,
    supported,
    experimental,
    unsupported,
    requirements: { ...HORIZON_HISTORY_REQUIREMENTS },
  };
  cachedAt = Date.now();
  return cachedStatus;
}

export function isHorizonSupported(
  status: HorizonSupportStatus,
  days: HorizonDays
): boolean {
  return status.supported.includes(days);
}

export function isHorizonExperimental(
  status: HorizonSupportStatus,
  days: HorizonDays
): boolean {
  return status.experimental.includes(days);
}

/** Map API window string → horizon days. */
export function windowToHorizonDays(window: PredictionWindow): HorizonDays {
  return Number(window.replace('d', '')) as HorizonDays;
}

/**
 * Null out expected returns / bands for horizons the DB cannot honestly support.
 * Experimental horizons are kept but callers should surface the flag.
 */
export function applyHorizonHonesty<T extends {
  expected7dReturn?: number | null;
  expected30dReturn?: number | null;
  expected90dReturn?: number | null;
  expected180dReturn?: number | null;
  expected365dReturn?: number | null;
  predicted180d?: { low: number; mid: number; high: number } | null;
  predicted365d?: { low: number; mid: number; high: number } | null;
}>(prediction: T, status: HorizonSupportStatus): T & { horizonSupport?: HorizonSupportStatus } {
  const out = { ...prediction, horizonSupport: status };
  if (status.unsupported.includes(180)) {
    out.expected180dReturn = null;
  }
  if (status.unsupported.includes(365)) {
    out.expected365dReturn = null;
  }
  return out;
}

export function invalidateHorizonSupportCache(): void {
  cachedStatus = null;
  cachedAt = 0;
}
