/**
 * Walk-forward, cross-sectional strategy backtest over a weekly price panel.
 *
 * At every formation week a strategy ranks the cards it is allowed to see
 * (only prices up to that week), "buys" its top picks at market, and sells
 * them `horizonWeeks` later net of marketplace fees and shipping. The same is
 * done for every eligible card (the universe) so a strategy is judged on what
 * it adds over buying cards at random, not on the market's direction.
 *
 * Pure: no DB, no network. `service.ts` builds the panel.
 */

export type MarketKind = 'raw' | 'psa10';

export interface CostModel {
  /** Marketplace + payment fee taken from the sale price (0.1325 = 13.25%). */
  sellFeePct: number;
  /** Fixed per-sale fee (payment processing). */
  sellFixedFee: number;
  /** Shipping the seller pays on the way out. */
  sellShipping: number;
  /** Shipping/tax the buyer pays on the way in, as a flat amount. */
  buyShipping: number;
}

export const COST_MODELS: Record<MarketKind, CostModel> = {
  // TCGplayer/eBay seller fees on a raw card shipped in a tracked envelope.
  raw: { sellFeePct: 0.1325, sellFixedFee: 0.3, sellShipping: 1, buyShipping: 1 },
  // eBay fees on a slab shipped with tracking + insurance.
  psa10: { sellFeePct: 0.1325, sellFixedFee: 0.3, sellShipping: 5, buyShipping: 5 },
};

export function buyCost(price: number, costs: CostModel): number {
  return price + costs.buyShipping;
}

export function saleProceeds(price: number, costs: CostModel): number {
  return price * (1 - costs.sellFeePct) - costs.sellFixedFee - costs.sellShipping;
}

/** Round-trip return after fees: what you keep relative to what you paid. */
export function netReturn(buyPrice: number, sellPrice: number, costs: CostModel): number {
  return saleProceeds(sellPrice, costs) / buyCost(buyPrice, costs) - 1;
}

/** Price a card must reach for a round trip to break even. */
export function breakEvenPrice(buyPrice: number, costs: CostModel): number {
  return (
    (buyCost(buyPrice, costs) + costs.sellFixedFee + costs.sellShipping) / (1 - costs.sellFeePct)
  );
}

export interface PanelSeries {
  id: string;
  /** Aligned to `Panel.dates`; null where the card had no clean price that week. */
  prices: (number | null)[];
  /** Lowest listing each week, when the feed has one (raw TCGplayer only). */
  lows?: (number | null)[];
}

export interface Panel {
  market: MarketKind;
  /** Weekly formation dates, ascending (YYYY-MM-DD). */
  dates: string[];
  series: PanelSeries[];
}

/** What a strategy may look at: prices up to and including week `t`. */
export interface SignalContext {
  prices: (number | null)[];
  lows?: (number | null)[];
  t: number;
}

export interface Strategy {
  id: string;
  label: string;
  /** One sentence a collector can read. */
  description: string;
  /** Higher = more attractive. null = not a candidate this week. */
  score: (ctx: SignalContext) => number | null;
  /** Buy every candidate instead of the top N (screens rather than rankings). */
  takeAll?: boolean;
}

export interface BacktestOptions {
  horizonWeeks: number;
  /** Picks per formation week. */
  topN: number;
  /** Cards below this price at formation are ignored (fees swamp them). */
  minPrice: number;
  costs: CostModel;
  /** Forward prints more than this multiple away from entry are treated as bad data. */
  maxForwardMultiple?: number;
  /**
   * Pay max(market, lowest listing) on entry. Market price can sit below every
   * listing, and a backtest that buys there books returns nobody could get.
   */
  entryAtAsk?: boolean;
}

/** What you'd actually pay at week t. */
export function entryPrice(s: PanelSeries, t: number, atAsk: boolean): number | null {
  const market = priceAt(s.prices, t);
  if (market == null) return null;
  const low = atAsk && s.lows ? priceAt(s.lows, t) : null;
  return low != null && low > market ? low : market;
}

export interface FormationResult {
  date: string;
  picks: number;
  universe: number;
  pickMeanNet: number;
  pickMedianNet: number;
  pickHitRate: number;
  universeMeanNet: number;
  universeMedianNet: number;
  /** pickMeanNet − universeMeanNet. */
  excess: number;
}

export interface BacktestSummary {
  strategyId: string;
  label: string;
  description: string;
  market: MarketKind;
  horizonWeeks: number;
  topN: number;
  minPrice: number;
  formations: number;
  firstFormation: string | null;
  lastFormation: string | null;
  /** Share of formation weeks where picks beat the universe. */
  beatRate: number;
  meanExcess: number;
  pickMeanNet: number;
  pickMedianNet: number;
  pickHitRate: number;
  universeMeanNet: number;
  universeMedianNet: number;
  universeHitRate: number;
  /** $1 compounded over non-overlapping holding periods. */
  equity: { date: string; strategy: number; universe: number }[];
  results: FormationResult[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Price at week t (exact; strategies handle their own lookback gaps). */
export function priceAt(prices: (number | null)[], t: number): number | null {
  const p = t >= 0 && t < prices.length ? prices[t] : null;
  return p != null && Number.isFinite(p) && p > 0 ? p : null;
}

/** Trailing simple return over `weeks`, or null when either end is missing. */
export function trailingReturn(prices: (number | null)[], t: number, weeks: number): number | null {
  const now = priceAt(prices, t);
  const then = priceAt(prices, t - weeks);
  return now != null && then != null ? now / then - 1 : null;
}

export function runBacktest(
  panel: Panel,
  strategy: Strategy,
  options: BacktestOptions
): BacktestSummary {
  const { horizonWeeks, topN, minPrice, costs } = options;
  const maxMult = options.maxForwardMultiple ?? 5;
  const results: FormationResult[] = [];
  const allPickNets: number[] = [];
  const allUniverseNets: number[] = [];

  for (let t = 0; t + horizonWeeks < panel.dates.length; t++) {
    const scored: { score: number; net: number }[] = [];
    const universeNets: number[] = [];
    for (const s of panel.series) {
      const market = priceAt(s.prices, t);
      const entry = entryPrice(s, t, options.entryAtAsk ?? false);
      const exit = priceAt(s.prices, t + horizonWeeks);
      if (market == null || entry == null || exit == null || market < minPrice) continue;
      if (exit / market > maxMult || market / exit > maxMult) continue;
      const net = netReturn(entry, exit, costs);
      universeNets.push(net);
      const score = strategy.score({ prices: s.prices, lows: s.lows, t });
      if (score != null && Number.isFinite(score)) scored.push({ score, net });
    }
    if (universeNets.length < topN * 2 || scored.length < Math.min(topN, 5)) continue;

    scored.sort((a, b) => b.score - a.score);
    const picks = (strategy.takeAll ? scored : scored.slice(0, topN)).map((p) => p.net);
    allPickNets.push(...picks);
    allUniverseNets.push(...universeNets);
    const pickMeanNet = mean(picks);
    const universeMeanNet = mean(universeNets);
    results.push({
      date: panel.dates[t],
      picks: picks.length,
      universe: universeNets.length,
      pickMeanNet,
      pickMedianNet: median(picks),
      pickHitRate: picks.filter((n) => n > 0).length / picks.length,
      universeMeanNet,
      universeMedianNet: median(universeNets),
      excess: pickMeanNet - universeMeanNet,
    });
  }

  // Compound only non-overlapping holds so the curve is something you could
  // actually have earned with one pot of money.
  const equity: BacktestSummary['equity'] = [];
  let eqS = 1;
  let eqU = 1;
  let nextAllowed = '';
  for (const r of results) {
    if (r.date < nextAllowed) continue;
    eqS *= 1 + r.pickMeanNet;
    eqU *= 1 + r.universeMeanNet;
    const idx = panel.dates.indexOf(r.date);
    const exitDate = panel.dates[idx + horizonWeeks] ?? r.date;
    equity.push({ date: exitDate, strategy: eqS, universe: eqU });
    nextAllowed = exitDate;
  }

  return {
    strategyId: strategy.id,
    label: strategy.label,
    description: strategy.description,
    market: panel.market,
    horizonWeeks,
    topN,
    minPrice,
    formations: results.length,
    firstFormation: results[0]?.date ?? null,
    lastFormation: results[results.length - 1]?.date ?? null,
    beatRate: results.length ? results.filter((r) => r.excess > 0).length / results.length : 0,
    meanExcess: mean(results.map((r) => r.excess)),
    pickMeanNet: mean(allPickNets),
    pickMedianNet: median(allPickNets),
    pickHitRate: allPickNets.length
      ? allPickNets.filter((n) => n > 0).length / allPickNets.length
      : 0,
    universeMeanNet: mean(allUniverseNets),
    universeMedianNet: median(allUniverseNets),
    universeHitRate: allUniverseNets.length
      ? allUniverseNets.filter((n) => n > 0).length / allUniverseNets.length
      : 0,
    equity,
    results,
  };
}

/** Rank the latest week with a strategy; what it would buy today. */
export function currentPicks(
  panel: Panel,
  strategy: Strategy,
  options: { topN: number; minPrice: number }
): { id: string; score: number; price: number }[] {
  const t = panel.dates.length - 1;
  if (t < 0) return [];
  const out: { id: string; score: number; price: number }[] = [];
  for (const s of panel.series) {
    const price = priceAt(s.prices, t);
    if (price == null || price < options.minPrice) continue;
    const score = strategy.score({ prices: s.prices, lows: s.lows, t });
    if (score != null && Number.isFinite(score)) out.push({ id: s.id, score, price });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, options.topN);
}

export interface BaseRate {
  label: string;
  minPrice: number;
  maxPrice: number | null;
  horizonWeeks: number;
  samples: number;
  medianNet: number;
  p25Net: number;
  p75Net: number;
  /** Share of round trips that made money after costs. */
  hitRate: number;
}

export const PRICE_TIERS: [number, number | null][] = [
  [5, 20],
  [20, 50],
  [50, 150],
  [150, 500],
  [500, null],
];

const quantile = (sorted: number[], q: number) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;

/**
 * What every round trip in a price tier did historically: buy at week t (at
 * the ask when known), sell `horizonWeeks` later net of costs.
 */
export function tierBaseRate(
  panel: Panel,
  price: number,
  options: { horizonWeeks: number; costs: CostModel; entryAtAsk: boolean }
): BaseRate | null {
  const tier = PRICE_TIERS.find(([lo, hi]) => price >= lo && (hi == null || price < hi));
  if (!tier) return null;
  const [lo, hi] = tier;
  const nets: number[] = [];
  for (let t = 0; t + options.horizonWeeks < panel.dates.length; t++) {
    for (const s of panel.series) {
      const market = priceAt(s.prices, t);
      if (market == null || market < lo || (hi != null && market >= hi)) continue;
      const entry = entryPrice(s, t, options.entryAtAsk);
      const exit = priceAt(s.prices, t + options.horizonWeeks);
      if (entry == null || exit == null || exit / market > 5 || market / exit > 5) continue;
      nets.push(netReturn(entry, exit, options.costs));
    }
  }
  if (nets.length < 30) return null;
  nets.sort((a, b) => a - b);
  return {
    label: hi == null ? `$${lo}+` : `$${lo}–${hi}`,
    minPrice: lo,
    maxPrice: hi,
    horizonWeeks: options.horizonWeeks,
    samples: nets.length,
    medianNet: quantile(nets, 0.5),
    p25Net: quantile(nets, 0.25),
    p75Net: quantile(nets, 0.75),
    hitRate: nets.filter((n) => n > 0).length / nets.length,
  };
}
