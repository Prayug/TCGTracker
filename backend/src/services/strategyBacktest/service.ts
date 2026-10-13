/**
 * Builds weekly price panels from the database and serves the Investments
 * strategy report: walk-forward backtests of each strategy plus what the
 * fair-entry screen would buy today.
 *
 * Raw cards use only the direct TCGplayer feed (`tcgcsv`) so every return is
 * measured on one consistent series, with the cheapest listing available as
 * the real cost of entry. Slabs use PriceCharting PSA 10 marks after
 * `cleanDailySeries`. Weeks that are carry-forward copies (no price moved)
 * are dropped and reported rather than counted as flat weeks.
 */
import { dbAll } from '../../db/promisified';
import { logger } from '../../utils/logger';
import { findLastLiveTcgcsvDate } from '../tcgcsvPokemon';
import { cleanDailySeries } from './cleanSeries';
import {
  BacktestSummary,
  BaseRate,
  PRICE_TIERS,
  COST_MODELS,
  MarketKind,
  Panel,
  PanelSeries,
  breakEvenPrice,
  currentPicks,
  priceAt,
  runBacktest,
  tierBaseRate,
  trailingReturn,
} from './engine';
import { ALL_STRATEGIES, askRatio, fairEntry, isFairEntry, isSpike } from './strategies';

const PANEL_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_WEEKS = 160;
const MIN_PRICE = { raw: 20, psa10: 50 } as const;
const TOP_N = 25;

interface PanelMeta {
  cardId: string | null;
  name: string | null;
  setName: string | null;
  imageSmall: string | null;
  lowConfidence?: boolean;
}

interface BuiltPanel {
  panel: Panel;
  meta: Map<string, PanelMeta>;
  builtAt: number;
  /** Weeks removed because nothing moved (carry-forward copies). */
  frozenWeeks: string[];
  /** Days of copies after the feed's last live day; 0 when current. */
  staleDays: number;
  lowConfidenceSeries: number;
  /** TCGplayer productId → series ids with their finish (raw only). */
  byProductId: Map<number, { id: string; finish: string }[]>;
}

const cache = new Map<MarketKind, BuiltPanel>();
const inflight = new Map<MarketKind, Promise<BuiltPanel>>();

const normalizeFinish = (v: string | null | undefined) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Weekly targets anchored on the latest date, each snapped to an available day within ±3. */
export function pickWeeklyDates(available: string[], maxWeeks = MAX_WEEKS): string[] {
  if (!available.length) return [];
  const set = new Set(available);
  const first = available[0];
  const picked: string[] = [];
  for (
    let target = available[available.length - 1];
    target >= first;
    target = addDays(target, -7)
  ) {
    for (const off of [0, -1, 1, -2, 2, -3, 3]) {
      const d = addDays(target, off);
      if (set.has(d) && !picked.includes(d)) {
        picked.push(d);
        break;
      }
    }
    if (picked.length >= maxWeeks) break;
  }
  return picked.sort();
}

/**
 * Drop weeks where (almost) no price changed versus the previous kept week:
 * those are carry-forward copies, not a market that stood still.
 */
export function dropFrozenWeeks(
  dates: string[],
  series: { prices: (number | null)[] }[],
  minChangedShare = 0.01
): { keep: number[]; frozen: string[] } {
  const keep: number[] = [];
  const frozen: string[] = [];
  for (let t = 0; t < dates.length; t++) {
    const prev = keep[keep.length - 1];
    if (prev === undefined) {
      keep.push(t);
      continue;
    }
    let both = 0;
    let changed = 0;
    for (const s of series) {
      const a = s.prices[prev];
      const b = s.prices[t];
      if (a == null || b == null) continue;
      both++;
      if (a !== b) changed++;
    }
    if (both > 100 && changed / both < minChangedShare) frozen.push(dates[t]);
    else keep.push(t);
  }
  return { keep, frozen };
}

async function buildRawPanel(): Promise<BuiltPanel> {
  const { lastLive, frozenDays } = await findLastLiveTcgcsvDate();
  const available = (
    await dbAll<{ date: string }>(
      `SELECT date FROM price_history WHERE source = 'tcgcsv' AND date <= ?
       GROUP BY date HAVING COUNT(*) > 1000 ORDER BY date`,
      [lastLive ?? '0000-00-00']
    )
  ).map((r) => r.date);
  const dates = pickWeeklyDates(available);

  const index = new Map<string, PanelSeries>();
  const byProductId = new Map<number, { id: string; finish: string }[]>();
  for (const [t, date] of dates.entries()) {
    const rows = await dbAll<{
      uid: string;
      price: number;
      low: number | null;
      productId: number | null;
      subTypeName: string | null;
    }>(
      `SELECT uniqueIdentifier AS uid, COALESCE(marketPrice, price) AS price, lowPrice AS low,
              productId, subTypeName
       FROM price_history WHERE source = 'tcgcsv' AND date = ? AND price > 0`,
      [date]
    );
    for (const r of rows) {
      let s = index.get(r.uid);
      if (!s) {
        if (r.productId) {
          const list = byProductId.get(r.productId) ?? [];
          list.push({ id: r.uid, finish: normalizeFinish(r.subTypeName) });
          byProductId.set(r.productId, list);
        }
        s = {
          id: r.uid,
          prices: Array(dates.length).fill(null),
          lows: Array(dates.length).fill(null),
        };
        index.set(r.uid, s);
      }
      s.prices[t] = r.price;
      // 9999 is TCGCSV's "no listing" sentinel.
      s.lows![t] = r.low != null && r.low > 0 && r.low < 9999 ? r.low : null;
    }
  }

  const all = [...index.values()];
  const { keep, frozen } = dropFrozenWeeks(dates, all);
  const series = all.map((s) => ({
    id: s.id,
    prices: keep.map((t) => s.prices[t]),
    lows: keep.map((t) => s.lows![t]),
  }));

  const metaRows = await dbAll<{
    uid: string;
    cardId: string;
    cardName: string;
    setName: string;
    imageSmall: string | null;
  }>(`SELECT uniqueIdentifier AS uid, cardId, cardName, setName, imageSmall FROM card_mappings`);
  const meta = new Map<string, PanelMeta>();
  for (const m of metaRows) {
    if (index.has(m.uid)) {
      meta.set(m.uid, {
        cardId: m.cardId,
        name: m.cardName,
        setName: m.setName,
        imageSmall: m.imageSmall,
      });
    }
  }

  return {
    panel: { market: 'raw', dates: keep.map((t) => dates[t]), series },
    meta,
    builtAt: Date.now(),
    frozenWeeks: frozen,
    staleDays: frozenDays,
    lowConfidenceSeries: 0,
    byProductId,
  };
}

async function buildSlabPanel(): Promise<BuiltPanel> {
  // Liquid, verified PSA 10s only; the long tail is mostly default estimates.
  const cards = await dbAll<{
    cardId: string;
    variantKey: string;
    cardName: string | null;
    setName: string | null;
  }>(
    `SELECT cardId, variantKey, cardName, setName FROM graded_prices
     WHERE grader = 'psa' AND grade = '10' AND COALESCE(verified, 0) = 1
       AND price >= ? AND COALESCE(soldListings, 0) >= 3
     GROUP BY cardId`,
    [MIN_PRICE.psa10 / 2]
  );
  const wanted = new Map(cards.map((c) => [c.cardId, c]));

  const rows = await dbAll<{ cardId: string; variantKey: string; date: string; price: number }>(
    `SELECT cardId, variantKey, date, price FROM graded_price_history
     WHERE grader = 'psa' AND grade = '10' AND price > 0
       AND date >= date('now', ?)
     ORDER BY cardId, date`,
    [`-${MAX_WEEKS * 7} days`]
  );
  const byCard = new Map<string, { date: string; price: number }[]>();
  for (const r of rows) {
    const c = wanted.get(r.cardId);
    if (!c || c.variantKey !== r.variantKey) continue;
    const arr = byCard.get(r.cardId) ?? [];
    arr.push({ date: r.date, price: r.price });
    byCard.set(r.cardId, arr);
  }

  const available = [...new Set(rows.map((r) => r.date))].sort();
  const dates = pickWeeklyDates(available);
  const series: PanelSeries[] = [];
  const meta = new Map<string, PanelMeta>();
  let lowConfidenceSeries = 0;
  for (const [cardId, points] of byCard) {
    const cleaned = cleanDailySeries(points);
    if (cleaned.lowConfidence) {
      lowConfidenceSeries++;
      continue;
    }
    const byDate = new Map(cleaned.points.map((p) => [p.date, p.price]));
    // Weekly value = last cleaned print on or before the week date.
    const prices: (number | null)[] = [];
    let j = 0;
    let last: number | null = null;
    const sortedDates = cleaned.points.map((p) => p.date);
    for (const d of dates) {
      while (j < sortedDates.length && sortedDates[j] <= d) last = byDate.get(sortedDates[j++])!;
      prices.push(last);
    }
    series.push({ id: cardId, prices });
    const c = wanted.get(cardId)!;
    meta.set(cardId, { cardId, name: c.cardName, setName: c.setName, imageSmall: null });
  }

  const imageRows = await dbAll<{ cardId: string; imageSmall: string | null }>(
    `SELECT cardId, MAX(imageSmall) AS imageSmall FROM card_mappings GROUP BY cardId`
  );
  for (const r of imageRows) {
    const m = meta.get(r.cardId);
    if (m) m.imageSmall = r.imageSmall;
  }

  const { keep, frozen } = dropFrozenWeeks(dates, series);
  return {
    panel: {
      market: 'psa10',
      dates: keep.map((t) => dates[t]),
      series: series.map((s) => ({ id: s.id, prices: keep.map((t) => s.prices[t]) })),
    },
    meta,
    builtAt: Date.now(),
    frozenWeeks: frozen,
    staleDays: 0,
    lowConfidenceSeries,
    byProductId: new Map(),
  };
}

async function getPanel(market: MarketKind, refresh = false): Promise<BuiltPanel> {
  const cached = cache.get(market);
  if (cached && !refresh && Date.now() - cached.builtAt < PANEL_TTL_MS) return cached;
  const running = inflight.get(market);
  if (running) return running;
  const started = Date.now();
  const p = (market === 'raw' ? buildRawPanel() : buildSlabPanel())
    .then((built) => {
      cache.set(market, built);
      logger.info('Strategy panel built', {
        market,
        weeks: built.panel.dates.length,
        series: built.panel.series.length,
        frozenWeeks: built.frozenWeeks.length,
        ms: Date.now() - started,
      });
      return built;
    })
    .finally(() => inflight.delete(market));
  inflight.set(market, p);
  return p;
}

export interface StrategyPick {
  id: string;
  cardId: string | null;
  name: string | null;
  setName: string | null;
  imageSmall: string | null;
  price: number;
  lowestListing: number | null;
  /** What you'd pay today: the higher of market and the cheapest listing. */
  entryPrice: number;
  breakEvenPrice: number;
  breakEvenPct: number;
  change4w: number | null;
  change12w: number | null;
}

export interface StrategyReport {
  market: MarketKind;
  generatedAt: string;
  horizonWeeks: number;
  minPrice: number;
  costs: (typeof COST_MODELS)[MarketKind];
  data: {
    firstDate: string | null;
    lastDate: string | null;
    weeks: number;
    series: number;
    frozenWeeks: number;
    /** Days since the feed last moved; prices after that were copies. */
    staleDays: number;
    lowConfidenceSeries: number;
  };
  notes: string[];
  strategies: Omit<BacktestSummary, 'results'>[];
  /** Fair-entry candidates today, best first. */
  picks: StrategyPick[];
  /** Cards up ≥50% in 4 weeks: historically the worst time to buy. */
  spikes: StrategyPick[];
}

function toPick(built: BuiltPanel, id: string, market: MarketKind): StrategyPick | null {
  const s = built.panel.series.find((x) => x.id === id);
  const t = built.panel.dates.length - 1;
  if (!s) return null;
  const price = priceAt(s.prices, t);
  if (price == null) return null;
  const low = s.lows ? priceAt(s.lows, t) : null;
  const entry = low != null && low > price ? low : price;
  const be = breakEvenPrice(entry, COST_MODELS[market]);
  const m = built.meta.get(id);
  return {
    id,
    cardId: m?.cardId ?? null,
    name: m?.name ?? null,
    setName: m?.setName ?? null,
    imageSmall: m?.imageSmall ?? null,
    price,
    lowestListing: low,
    entryPrice: entry,
    breakEvenPrice: Math.round(be * 100) / 100,
    breakEvenPct: be / entry - 1,
    change4w: trailingReturn(s.prices, t, 4),
    change12w: trailingReturn(s.prices, t, 12),
  };
}

export async function getStrategyReport(options: {
  market: MarketKind;
  horizonWeeks: number;
  refresh?: boolean;
}): Promise<StrategyReport> {
  const { market } = options;
  const horizonWeeks = Math.max(1, Math.min(26, Math.round(options.horizonWeeks)));
  const built = await getPanel(market, options.refresh);
  const { panel } = built;
  const minPrice = MIN_PRICE[market];
  const costs = COST_MODELS[market];

  const strategies = ALL_STRATEGIES.filter((s) => market === 'raw' || s.id !== 'fair_entry').map(
    (strategy) => {
      const { results: _results, ...summary } = runBacktest(panel, strategy, {
        horizonWeeks,
        topN: TOP_N,
        minPrice,
        costs,
        entryAtAsk: market === 'raw',
      });
      return summary;
    }
  );

  const t = panel.dates.length - 1;
  const picks =
    market === 'raw'
      ? currentPicks(panel, fairEntry, { topN: 15, minPrice })
          .map((p) => toPick(built, p.id, market))
          .filter((p): p is StrategyPick => p != null)
      : [];
  const spikes = panel.series
    .filter((s) => {
      const p = priceAt(s.prices, t);
      if (p == null || p < minPrice || !isSpike({ prices: s.prices, t })) return false;
      // A 5x+ jump in four weeks is far more often a bad print than a market.
      const r = trailingReturn(s.prices, t, 4);
      return r != null && r < 4;
    })
    .map((s) => toPick(built, s.id, market))
    .filter((p): p is StrategyPick => p != null)
    .sort((a, b) => (b.change4w ?? 0) - (a.change4w ?? 0))
    .slice(0, 8);

  const notes: string[] = [];
  if (built.staleDays > 0) {
    notes.push(
      `TCGplayer prices stopped updating after ${panel.dates[t]}; the ${built.staleDays} days since were copies of that day. Results and picks use prices up to ${panel.dates[t]}.`
    );
  }
  const formations = strategies[0]?.formations ?? 0;
  if (built.frozenWeeks.length > 0) {
    notes.push(
      `${built.frozenWeeks.length} weekly snapshots were exact copies of an earlier week and were left out.`
    );
  }
  if (formations < 8) {
    notes.push(
      `Only ${formations} test windows at a ${horizonWeeks}-week horizon. Treat results as anecdotal until more history is backfilled.`
    );
  }
  if (market === 'psa10' && built.lowConfidenceSeries > 0) {
    notes.push(
      `${built.lowConfidenceSeries} slabs were excluded because their price jumped back and forth between levels.`
    );
  }

  return {
    market,
    generatedAt: new Date(built.builtAt).toISOString(),
    horizonWeeks,
    minPrice,
    costs,
    data: {
      firstDate: panel.dates[0] ?? null,
      lastDate: panel.dates[t] ?? null,
      weeks: panel.dates.length,
      series: panel.series.length,
      frozenWeeks: built.frozenWeeks.length,
      staleDays: built.staleDays,
      lowConfidenceSeries: built.lowConfidenceSeries,
    },
    notes,
    strategies,
    picks,
    spikes,
  };
}

export interface PositionCheck {
  market: MarketKind;
  asOf: string | null;
  staleDays: number;
  price: number;
  lowestListing: number | null;
  entryPrice: number;
  breakEvenPrice: number;
  breakEvenPct: number;
  change4w: number | null;
  change12w: number | null;
  /** Std-dev of weekly returns over the last 12 weeks. */
  weeklyVolatility: number | null;
  spike: boolean;
  fairEntry: boolean;
  askRatio: number | null;
  baseRate: BaseRate | null;
  costs: (typeof COST_MODELS)[MarketKind];
}

export interface CardCheck {
  cardId: string;
  horizonWeeks: number;
  raw: PositionCheck | null;
  psa10: PositionCheck | null;
}

const baseRateCache = new Map<string, BaseRate | null>();

function weeklyVol(prices: (number | null)[], t: number, weeks = 12): number | null {
  const rets: number[] = [];
  for (let i = Math.max(1, t - weeks + 1); i <= t; i++) {
    const a = priceAt(prices, i - 1);
    const b = priceAt(prices, i);
    if (a != null && b != null) rets.push(Math.log(b / a));
  }
  if (rets.length < 4) return null;
  const m = rets.reduce((x, y) => x + y, 0) / rets.length;
  return Math.sqrt(rets.reduce((acc, r) => acc + (r - m) ** 2, 0) / (rets.length - 1));
}

function checkSeries(
  built: BuiltPanel,
  series: PanelSeries,
  horizonWeeks: number
): PositionCheck | null {
  const { panel } = built;
  const market = panel.market;
  const t = panel.dates.length - 1;
  const price = priceAt(series.prices, t);
  if (price == null) return null;
  const low = series.lows ? priceAt(series.lows, t) : null;
  const entry = low != null && low > price ? low : price;
  const costs = COST_MODELS[market];
  const be = breakEvenPrice(entry, costs);
  const ctx = { prices: series.prices, lows: series.lows, t };

  const tier = PRICE_TIERS.findIndex(([lo, hi]) => price >= lo && (hi == null || price < hi));
  const tierKey = `${market}:${built.builtAt}:${horizonWeeks}:${tier}`;
  let baseRate = baseRateCache.get(tierKey);
  if (baseRate === undefined) {
    baseRate = tierBaseRate(panel, price, { horizonWeeks, costs, entryAtAsk: market === 'raw' });
    if (baseRateCache.size > 2000) baseRateCache.clear();
    baseRateCache.set(tierKey, baseRate);
  }

  return {
    market,
    asOf: panel.dates[t] ?? null,
    staleDays: built.staleDays,
    price,
    lowestListing: low,
    entryPrice: entry,
    breakEvenPrice: Math.round(be * 100) / 100,
    breakEvenPct: be / entry - 1,
    change4w: trailingReturn(series.prices, t, 4),
    change12w: trailingReturn(series.prices, t, 12),
    weeklyVolatility: weeklyVol(series.prices, t),
    spike: isSpike(ctx),
    fairEntry: market === 'raw' && isFairEntry(ctx),
    askRatio: askRatio(ctx),
    baseRate,
    costs,
  };
}

/** Investment check for one card: raw finish (TCGplayer) and its PSA 10. */
export async function getCardCheck(options: {
  cardId: string;
  variant?: string;
  /** TCGplayer productId when the client knows it. */
  productId?: number;
  horizonWeeks?: number;
}): Promise<CardCheck> {
  const horizonWeeks = Math.max(1, Math.min(26, Math.round(options.horizonWeeks ?? 8)));
  const [rawPanel, slabPanel] = await Promise.all([getPanel('raw'), getPanel('psa10')]);

  // Catalog cards (base1-4) and TCGplayer products (tcgcsv-…) share a productId.
  const ids = await dbAll<{ productId: number | null; tcgplayerProductId: string | null }>(
    `SELECT productId, tcgplayerProductId FROM card_mappings WHERE cardId = ?`,
    [options.cardId]
  );
  const productIds = new Set<number>();
  if (options.productId) productIds.add(options.productId);
  for (const r of ids) {
    const n = Number(r.tcgplayerProductId ?? r.productId);
    if (Number.isFinite(n) && n > 0) productIds.add(n);
  }
  const wanted = normalizeFinish(options.variant);
  const candidates = [...productIds].flatMap((pid) => rawPanel.byProductId.get(pid) ?? []);
  const match = candidates.find((c) => c.finish === wanted) ?? candidates[0];
  const rawSeries = match ? rawPanel.panel.series.find((s) => s.id === match.id) : undefined;

  const slab = slabPanel.panel.series.find((s) => s.id === options.cardId);
  return {
    cardId: options.cardId,
    horizonWeeks,
    raw: rawSeries ? checkSeries(rawPanel, rawSeries, horizonWeeks) : null,
    psa10: slab ? checkSeries(slabPanel, slab, horizonWeeks) : null,
  };
}
