/**
 * Investment Opportunities — slab %-movers, similar-slab comps, buyout
 * detection, and aggregated opportunity scoring.
 *
 * Follows slabInsightsService / gradedSpreadService conventions: raw sqlite
 * all/get helpers, scoreLiquidity, ageHoursFromFetchedAt.
 */

import { getDb } from '../db/database';
import { scoreLiquidity, type LiquidityTier } from './liquidityScore';
import {
  isGradualMove,
  maxEndpointChangePctForPeriod,
  type PricePointLite,
} from './topMoversQuality';
import { applyBulkAndEconomicScoring, buildBulkAwareWhy } from './opportunityBulkScoring';

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve((rows || []) as T[]);
    });
  });

const GRADED_STALE_HOURS = 12;

function ageHoursFromFetchedAt(fetchedAt: string | null | undefined): number | null {
  if (!fetchedAt) return null;
  const ms = new Date(fetchedAt.endsWith('Z') ? fetchedAt : `${fetchedAt}Z`).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round((Date.now() - ms) / 3600000));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// ---------------------------------------------------------------------------
// Pure math helpers (unit-tested)
// ---------------------------------------------------------------------------

export const MOVER_MIN_PRICE = 20;
export const MOVER_MIN_ABS_MOVE = 5;
export const MOVER_MIN_PCT_MOVE = 8;
export const MOVER_MIN_HISTORY_POINTS = 3;

export function computeChange(
  current: number,
  prev: number
): { changeAbs: number; changePct: number } {
  const changeAbs = round2(current - prev);
  const changePct = prev > 0 ? round2(((current - prev) / prev) * 100) : 0;
  return { changeAbs, changePct };
}

/** Mover gate: min price $20, ≥3 history points, and $5 or 8% move. */
export function passesMoverThresholds(input: {
  currentPrice: number;
  prevPrice: number;
  historyPoints: number;
}): boolean {
  const { currentPrice, prevPrice, historyPoints } = input;
  if (!(currentPrice >= MOVER_MIN_PRICE) || !(prevPrice > 0)) return false;
  if (historyPoints < MOVER_MIN_HISTORY_POINTS) return false;
  const { changeAbs, changePct } = computeChange(currentPrice, prevPrice);
  return Math.abs(changeAbs) >= MOVER_MIN_ABS_MOVE || Math.abs(changePct) >= MOVER_MIN_PCT_MOVE;
}

/**
 * First meaningful character token of a card name ("Charizard ex" → "charizard").
 * Used for character-mate comps across sets.
 */
export function characterToken(cardName: string | null | undefined): string | null {
  if (!cardName) return null;
  const STOP = new Set([
    'ex',
    'gx',
    'v',
    'vmax',
    'vstar',
    'lv.x',
    'star',
    'prime',
    'break',
    'dark',
    'light',
    'shining',
    'shadow',
    'radiant',
    'galarian',
    'alolan',
    'hisuian',
    'paldean',
    'mega',
    'primal',
    'team',
    'the',
    'of',
    '&',
  ]);
  const tokens = cardName
    .toLowerCase()
    .replace(/[^a-z0-9'\- ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  for (const t of tokens) {
    if (!STOP.has(t) && t.length >= 3) return t;
  }
  return tokens[0] ?? null;
}

export interface SeriesPoint {
  date: string;
  price: number;
}

/**
 * Pearson correlation + beta of aligned day-over-day % returns.
 * `avgMovePer5Pct` reads "when the anchor moved +5%, this comp moved +X%".
 * Returns null with <5 overlapping return observations.
 */
export function moveCorrelation(
  anchor: SeriesPoint[],
  comp: SeriesPoint[]
): { correlation: number; avgMovePer5Pct: number; samples: number } | null {
  const returnsByDate = (series: SeriesPoint[]): Map<string, number> => {
    const sorted = [...series]
      .filter((p) => p.price > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    const map = new Map<string, number>();
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1].price;
      if (prev > 0) map.set(sorted[i].date, ((sorted[i].price - prev) / prev) * 100);
    }
    return map;
  };

  const a = returnsByDate(anchor);
  const b = returnsByDate(comp);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [date, ra] of a) {
    const rb = b.get(date);
    if (rb != null) {
      xs.push(ra);
      ys.push(rb);
    }
  }
  const n = xs.length;
  if (n < 5) return null;

  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const mx = mean(xs);
  const my = mean(ys);
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i] - mx) * (ys[i] - my);
    vx += (xs[i] - mx) ** 2;
    vy += (ys[i] - my) ** 2;
  }
  if (vx === 0 || vy === 0) return null;
  const correlation = cov / Math.sqrt(vx * vy);
  const beta = cov / vx;
  return {
    correlation: round2(correlation),
    avgMovePer5Pct: round2(beta * 5),
    samples: n,
  };
}

export type BuyoutPhase = 'early' | 'active' | 'late';

export interface BuyoutSignalInputs {
  /** % price change over the scan window (endpoint to endpoint). */
  spikePct: number;
  /** Current listing count observation. */
  listedCount: number | null;
  /** Listing count at (or nearest before) the window start, from graded_price_history. */
  listedCountPrev: number | null;
  /** Recent soldListings vs history baseline (>1 = accelerating). */
  velocityRatio: number | null;
  liquidityTier: LiquidityTier;
  /** Premium % now minus premium % at window start. */
  premiumPctDelta: number | null;
  /** PSA 10 population delta over the window (≤0 with expanding premium = tightening). */
  popDelta: number | null;
}

export interface BuyoutScoreResult {
  score: number;
  phase: BuyoutPhase;
  signals: string[];
  why: string;
}

/**
 * Buyout score 0–100 from stacked supply/demand signals.
 * Price spike is required context; the rest layer on top.
 */
export function computeBuyoutScore(input: BuyoutSignalInputs): BuyoutScoreResult {
  const signals: string[] = [];
  let score = 0;

  // Price spike: 15% → ~15pts, 40%+ → 30pts.
  if (input.spikePct >= 15) {
    const pts = Math.round(clamp((input.spikePct / 40) * 30, 12, 30));
    score += pts;
    signals.push(`price_spike:+${round2(input.spikePct)}%`);
  }

  // Supply drain: measured drop in recorded listing counts. No baseline (or a
  // baseline too small to be meaningful) means no signal — never inferred.
  if (
    input.listedCount != null &&
    input.listedCountPrev != null &&
    input.listedCountPrev >= 3 &&
    input.spikePct >= 15
  ) {
    const dropPct = ((input.listedCountPrev - input.listedCount) / input.listedCountPrev) * 100;
    if (dropPct >= 30) {
      const pts = Math.round(clamp((dropPct / 100) * 25, 10, 25));
      score += pts;
      signals.push(`supply_drain:${input.listedCountPrev}->${input.listedCount}_listed`);
    }
  }

  if (input.velocityRatio != null && input.velocityRatio >= 1.5) {
    score += 15;
    signals.push(`velocity:${round2(input.velocityRatio)}x_baseline`);
  }

  if (input.liquidityTier === 'thin' || input.liquidityTier === 'illiquid') {
    score += 10;
    signals.push(`thin_liquidity:${input.liquidityTier}`);
  }

  if (input.premiumPctDelta != null && input.premiumPctDelta > 5) {
    score += 10;
    signals.push(`premium_expansion:+${round2(input.premiumPctDelta)}pp`);
  }

  if (
    input.popDelta != null &&
    input.popDelta <= 0 &&
    input.premiumPctDelta != null &&
    input.premiumPctDelta > 0
  ) {
    score += 10;
    signals.push('pop_tightening');
  }

  score = clamp(Math.round(score), 0, 100);

  let phase: BuyoutPhase;
  if (input.spikePct >= 50 || (input.listedCount != null && input.listedCount <= 1)) {
    phase = 'late';
  } else if (score >= 55) {
    phase = 'active';
  } else {
    phase = 'early';
  }

  const why =
    phase === 'late'
      ? `Move looks mostly done (+${round2(input.spikePct)}%${
          input.listedCount != null ? `, ${input.listedCount} listed` : ''
        }) — chasing here is risky.`
      : phase === 'active'
        ? `Multiple buyout signals stacking (+${round2(input.spikePct)}% with ${
            signals.length
          } signals) — supply is being taken.`
        : `Early spike (+${round2(input.spikePct)}%) without full confirmation yet — watch supply.`;

  return { score, phase, signals, why };
}

export type OpportunityGrade = 'strong_buy' | 'buy' | 'watch' | 'pass';

export interface OpportunityScoreInputs {
  /** expected_90d_return (%) from slab_predictions, null when no prediction. */
  predictedReturn90d: number | null;
  /** confidence_score 0–100, null when no prediction. */
  confidence: number | null;
  /** 30d slab price % move (0 when unknown). */
  momentumPct: number;
  /** computeBuyoutScore output, 0 when not a candidate. */
  buyoutScore: number;
  /** premiumPct minus its set-median premiumPct (negative = undervalued). */
  premiumVsSetMedian: number | null;
  /** Net sentiment −1..1 from external_market_signals. */
  netSentiment: number | null;
  /** Avg 30d % move of similar slabs (set-mates). */
  compMomentumPct: number | null;
}

/**
 * Weighted opportunity score:
 * 40% prediction (confidence-weighted) / 20% momentum / 20% buyout+undervaluation /
 * 10% external sentiment / 10% comp momentum.
 * Without a prediction (e.g. One Piece), weight shifts to momentum:
 * 40% momentum / 30% buyout+undervaluation / 15% sentiment / 15% comp momentum.
 */
export function computeOpportunityScore(input: OpportunityScoreInputs): {
  score: number;
  grade: OpportunityGrade;
} {
  // Each component normalized to 0–100 (50 = neutral).
  const momentumComponent = clamp(((input.momentumPct + 20) / 50) * 100, 0, 100);
  const underval =
    input.premiumVsSetMedian != null ? clamp(50 - input.premiumVsSetMedian / 2, 0, 100) : 50;
  const buyoutUnderComponent = 0.5 * clamp(input.buyoutScore, 0, 100) + 0.5 * underval;
  const sentimentComponent =
    input.netSentiment != null
      ? clamp(((clamp(input.netSentiment, -1, 1) + 1) / 2) * 100, 0, 100)
      : 50;
  const compComponent =
    input.compMomentumPct != null ? clamp(((input.compMomentumPct + 20) / 50) * 100, 0, 100) : 50;

  let score: number;
  if (input.predictedReturn90d != null) {
    const predRaw = clamp(((input.predictedReturn90d + 20) / 60) * 100, 0, 100);
    // Low confidence pulls the prediction toward neutral.
    const conf = clamp(input.confidence ?? 0, 0, 100) / 100;
    const predComponent = 50 + (predRaw - 50) * (0.35 + 0.65 * conf);
    score =
      0.4 * predComponent +
      0.2 * momentumComponent +
      0.2 * buyoutUnderComponent +
      0.1 * sentimentComponent +
      0.1 * compComponent;
  } else {
    score =
      0.4 * momentumComponent +
      0.3 * buyoutUnderComponent +
      0.15 * sentimentComponent +
      0.15 * compComponent;
  }

  const rounded = Math.round(clamp(score, 0, 100));
  const grade: OpportunityGrade =
    rounded >= 75 ? 'strong_buy' : rounded >= 60 ? 'buy' : rounded >= 45 ? 'watch' : 'pass';
  return { score: rounded, grade };
}

// ---------------------------------------------------------------------------
// a) Slab movers
// ---------------------------------------------------------------------------

export type MoverDirection = 'up' | 'down';

export interface SlabMoverRow {
  cardId: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  imageSmall: string | null;
  currentPrice: number;
  prevPrice: number;
  changePct: number;
  changeAbs: number;
  days: number;
  soldListings: number;
  liquidityScore: number;
  liquidityTier: LiquidityTier;
  verified: boolean;
  stale: boolean;
  direction: MoverDirection;
}

interface MoverQueryRow {
  cardId: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  imageSmall: string | null;
  currentPrice: number;
  soldListings: number;
  fetchedAt: string | null;
  verified: number;
  matchScore: number | null;
  prevPrice: number | null;
  windowPoints: number | null;
  historyPoints: number | null;
}

async function queryMoverRows(days: number): Promise<MoverQueryRow[]> {
  const lookback = `-${days} days`;
  return all<MoverQueryRow>(
    `SELECT
       gp.cardId,
       gp.cardName,
       gp.setId,
       gp.setName,
       cm.imageSmall,
       gp.price AS currentPrice,
       COALESCE(gp.soldListings, 0) AS soldListings,
       gp.fetchedAt,
       COALESCE(gp.verified, 0) AS verified,
       gp.matchScore,
       (
         SELECT gph.price FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
           AND gph.price > 0 AND gph.date <= date('now', ?)
         ORDER BY gph.date DESC LIMIT 1
       ) AS prevPrice,
       (
         SELECT COUNT(DISTINCT gph.date) FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
           AND gph.price > 0 AND gph.date >= date('now', ?)
       ) AS windowPoints,
       (
         SELECT COUNT(DISTINCT gph.date) FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
       ) AS historyPoints
     FROM graded_prices gp
     LEFT JOIN card_mappings cm ON cm.cardId = gp.cardId
     WHERE UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
       AND gp.price IS NOT NULL AND gp.price >= ?
       AND COALESCE(gp.verified, 0) = 1
     GROUP BY gp.cardId`,
    [lookback, lookback, MOVER_MIN_PRICE]
  );
}

function mapMoverRow(r: MoverQueryRow, days: number): SlabMoverRow {
  const { changeAbs, changePct } = computeChange(r.currentPrice, r.prevPrice as number);
  const ageHours = ageHoursFromFetchedAt(r.fetchedAt);
  const stale = ageHours != null ? ageHours >= GRADED_STALE_HOURS : false;
  const liq = scoreLiquidity({
    soldListings: r.soldListings,
    verified: true,
    stale,
    ageHours,
    matchScore: r.matchScore,
    historyPoints: r.historyPoints,
  });
  return {
    cardId: r.cardId,
    cardName: r.cardName,
    setId: r.setId,
    setName: r.setName,
    imageSmall: r.imageSmall,
    currentPrice: round2(r.currentPrice),
    prevPrice: round2(r.prevPrice as number),
    changePct,
    changeAbs,
    days,
    soldListings: r.soldListings ?? 0,
    liquidityScore: liq.score,
    liquidityTier: liq.tier,
    verified: true,
    stale,
    direction: changeAbs >= 0 ? 'up' : 'down',
  };
}

/** "Similar cards/slabs that have gone up" — verified PSA 10 %-change movers. */
export async function getSlabMovers(options?: {
  days?: number;
  direction?: MoverDirection;
  limit?: number;
}): Promise<{ rows: SlabMoverRow[]; count: number; days: number }> {
  const days = [7, 30, 90].includes(options?.days ?? 7) ? (options?.days ?? 7) : 7;
  const limit = clamp(options?.limit ?? 20, 1, 100);
  const endpointCap = maxEndpointChangePctForPeriod(days);

  const rows = await queryMoverRows(days);
  let movers = rows
    .filter((r) =>
      passesMoverThresholds({
        currentPrice: r.currentPrice,
        prevPrice: r.prevPrice ?? 0,
        historyPoints: r.windowPoints ?? 0,
      })
    )
    .map((r) => mapMoverRow(r, days))
    // Data-cliff ceiling: +12000% "moves" are match errors, not markets.
    .filter((m) => Math.abs(m.changePct) <= endpointCap);

  if (options?.direction) {
    movers = movers.filter((m) => m.direction === options.direction);
  }
  movers.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

  // Path quality guard on the candidates that would make the cut: require a
  // gradual series (no single discontinuous cliff), same as /top-movers.
  // Scan deep — the biggest |%| candidates are often exactly the data cliffs.
  const out: SlabMoverRow[] = [];
  const maxChecks = Math.min(movers.length, Math.max(limit * 4, 200));
  for (let i = 0; i < maxChecks && out.length < limit; i++) {
    const m = movers[i];
    const series = await fetchPsa10Series(m.cardId, days);
    const points: PricePointLite[] = series.map((p) => ({ date: p.date, price: p.price }));
    if (isGradualMove(points, { cliffPct: 50, minPoints: MOVER_MIN_HISTORY_POINTS })) {
      out.push(m);
    }
  }

  return { rows: out, count: out.length, days };
}

// ---------------------------------------------------------------------------
// b) Similar slabs
// ---------------------------------------------------------------------------

export type CompClass = 'alt_grade' | 'set_mate' | 'character_mate';

export interface SimilarSlabComp {
  compClass: CompClass;
  cardId: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  imageSmall: string | null;
  grader: string;
  grade: string;
  currentPrice: number;
  change7dPct: number | null;
  change30dPct: number | null;
  premiumPct: number | null;
  correlation: number | null;
  /** "When the anchor moved +5%, this comp moved +X% on average." */
  avgMovePer5Pct: number | null;
  liquidityScore: number;
  liquidityTier: LiquidityTier;
  verified: boolean;
}

export interface SimilarSlabGroup {
  anchor: {
    cardId: string;
    cardName: string | null;
    setId: string | null;
    setName: string | null;
    imageSmall: string | null;
    rarity: string | null;
    psa10Price: number | null;
  };
  altGrades: SimilarSlabComp[];
  setMates: SimilarSlabComp[];
  characterMates: SimilarSlabComp[];
}

async function fetchPsa10Series(cardId: string, days: number): Promise<SeriesPoint[]> {
  return all<SeriesPoint>(
    `SELECT date, price FROM graded_price_history
     WHERE cardId = ? AND UPPER(grader) = 'PSA' AND grade = '10'
       AND price > 0 AND date >= date('now', ?)
     ORDER BY date ASC`,
    [cardId, `-${days} days`]
  );
}

interface CompCandidateRow {
  cardId: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  imageSmall: string | null;
  grader: string;
  grade: string;
  currentPrice: number;
  soldListings: number;
  fetchedAt: string | null;
  verified: number;
  matchScore: number | null;
  historyPoints: number | null;
  prev7: number | null;
  prev30: number | null;
  rawPrice: number | null;
}

const COMP_SELECT = `
  SELECT
    gp.cardId,
    gp.cardName,
    gp.setId,
    gp.setName,
    cm.imageSmall,
    gp.grader,
    gp.grade,
    gp.price AS currentPrice,
    COALESCE(gp.soldListings, 0) AS soldListings,
    gp.fetchedAt,
    COALESCE(gp.verified, 0) AS verified,
    gp.matchScore,
    (
      SELECT COUNT(DISTINCT gph.date) FROM graded_price_history gph
      WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = UPPER(gp.grader) AND gph.grade = gp.grade
    ) AS historyPoints,
    (
      SELECT gph.price FROM graded_price_history gph
      WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = UPPER(gp.grader) AND gph.grade = gp.grade
        AND gph.price > 0 AND gph.date <= date('now', '-7 days')
      ORDER BY gph.date DESC LIMIT 1
    ) AS prev7,
    (
      SELECT gph.price FROM graded_price_history gph
      WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = UPPER(gp.grader) AND gph.grade = gp.grade
        AND gph.price > 0 AND gph.date <= date('now', '-30 days')
      ORDER BY gph.date DESC LIMIT 1
    ) AS prev30,
    (
      SELECT c.price FROM canonical_price_history c
      INNER JOIN card_mappings m ON m.uniqueIdentifier = c.uniqueIdentifier
      WHERE m.cardId = gp.cardId
      ORDER BY c.date DESC, c.price DESC LIMIT 1
    ) AS rawPrice
  FROM graded_prices gp
  LEFT JOIN card_mappings cm ON cm.cardId = gp.cardId
`;

function mapComp(
  r: CompCandidateRow,
  compClass: CompClass,
  anchorSeries: SeriesPoint[] | null,
  compSeries: SeriesPoint[] | null
): SimilarSlabComp {
  const ageHours = ageHoursFromFetchedAt(r.fetchedAt);
  const stale = ageHours != null ? ageHours >= GRADED_STALE_HOURS : false;
  const liq = scoreLiquidity({
    soldListings: r.soldListings,
    verified: r.verified === 1,
    stale,
    ageHours,
    matchScore: r.matchScore,
    historyPoints: r.historyPoints,
  });
  const corr = anchorSeries && compSeries ? moveCorrelation(anchorSeries, compSeries) : null;
  return {
    compClass,
    cardId: r.cardId,
    cardName: r.cardName,
    setId: r.setId,
    setName: r.setName,
    imageSmall: r.imageSmall,
    grader: r.grader,
    grade: r.grade,
    currentPrice: round2(r.currentPrice),
    change7dPct: r.prev7 && r.prev7 > 0 ? computeChange(r.currentPrice, r.prev7).changePct : null,
    change30dPct:
      r.prev30 && r.prev30 > 0 ? computeChange(r.currentPrice, r.prev30).changePct : null,
    premiumPct:
      r.rawPrice && r.rawPrice > 0
        ? round2(((r.currentPrice - r.rawPrice) / r.rawPrice) * 100)
        : null,
    correlation: corr?.correlation ?? null,
    avgMovePer5Pct: corr?.avgMovePer5Pct ?? null,
    liquidityScore: liq.score,
    liquidityTier: liq.tier,
    verified: r.verified === 1,
  };
}

/** "Other types of similar slabs" — alt grades, set-mates, character-mates per anchor. */
export async function getSimilarSlabs(options: {
  cardIds?: string[];
  cardId?: string;
  days?: number;
  limit?: number;
}): Promise<{ groups: SimilarSlabGroup[]; count: number; days: number }> {
  const days = clamp(options.days ?? 30, 7, 90);
  const perClassLimit = clamp(options.limit ?? 6, 1, 20);
  const anchorIds = [
    ...new Set(
      (options.cardIds ?? (options.cardId ? [options.cardId] : []))
        .map((id) => String(id).trim())
        .filter(Boolean)
    ),
  ].slice(0, 8);
  if (anchorIds.length === 0) return { groups: [], count: 0, days };

  const groups: SimilarSlabGroup[] = [];
  const anchorSet = new Set(anchorIds);

  for (const anchorId of anchorIds) {
    const anchorInfo = await all<{
      cardId: string;
      cardName: string | null;
      matchName: string | null;
      setId: string | null;
      setName: string | null;
      imageSmall: string | null;
      rarity: string | null;
      psa10Price: number | null;
    }>(
      `SELECT cm.cardId, cm.cardName, cm.matchName, cm.setId, cm.setName, cm.imageSmall, cm.rarity,
              (
                SELECT g.price FROM graded_prices g
                WHERE g.cardId = cm.cardId AND UPPER(g.grader) = 'PSA' AND g.grade = '10'
                  AND g.price > 0
                LIMIT 1
              ) AS psa10Price
       FROM card_mappings cm WHERE cm.cardId = ? LIMIT 1`,
      [anchorId]
    );
    const anchor = anchorInfo[0];
    if (!anchor) continue;

    const anchorSeries = await fetchPsa10Series(anchorId, days);
    const hasAnchorSeries = anchorSeries.length >= 6;

    // 1. Same card, alt grader/grade
    const altRows = await all<CompCandidateRow>(
      `${COMP_SELECT}
       WHERE gp.cardId = ? AND gp.price > 0
         AND NOT (UPPER(gp.grader) = 'PSA' AND gp.grade = '10')
       ORDER BY gp.grader, CAST(gp.grade AS REAL) DESC
       LIMIT ?`,
      [anchorId, perClassLimit]
    );
    const altGrades = altRows.map((r) => mapComp(r, 'alt_grade', null, null));

    // 2. Set-mates (same set + rarity)
    const setRows = anchor.setName
      ? await all<CompCandidateRow>(
          `${COMP_SELECT}
           WHERE UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
             AND gp.price > 0 AND COALESCE(gp.verified, 0) = 1
             AND gp.cardId != ?
             AND cm.setName = ?
             AND (? IS NULL OR cm.rarity = ?)
           GROUP BY gp.cardId
           LIMIT ?`,
          [anchorId, anchor.setName, anchor.rarity, anchor.rarity, perClassLimit * 3]
        )
      : [];

    // 3. Character-mates (name token overlap, both directions by shared token)
    const token = characterToken(anchor.matchName || anchor.cardName);
    const charRows = token
      ? await all<CompCandidateRow>(
          `${COMP_SELECT}
           WHERE UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
             AND gp.price > 0 AND COALESCE(gp.verified, 0) = 1
             AND gp.cardId != ?
             AND (
               LOWER(gp.cardName) LIKE '%' || ? || '%'
               OR LOWER(IFNULL(cm.matchName, '')) LIKE '%' || ? || '%'
             )
           GROUP BY gp.cardId
           LIMIT ?`,
          [anchorId, token, token, perClassLimit * 3]
        )
      : [];

    const buildComps = async (
      rows: CompCandidateRow[],
      compClass: CompClass,
      exclude: Set<string>
    ): Promise<SimilarSlabComp[]> => {
      const deduped = rows.filter((r) => !anchorSet.has(r.cardId) && !exclude.has(r.cardId));
      // Rank by |30d move| so the most correlated-looking movers surface first.
      deduped.sort((a, b) => {
        const am = a.prev30 && a.prev30 > 0 ? Math.abs((a.currentPrice - a.prev30) / a.prev30) : 0;
        const bm = b.prev30 && b.prev30 > 0 ? Math.abs((b.currentPrice - b.prev30) / b.prev30) : 0;
        return bm - am;
      });
      const top = deduped.slice(0, perClassLimit);
      const out: SimilarSlabComp[] = [];
      for (const r of top) {
        const compSeries = hasAnchorSeries ? await fetchPsa10Series(r.cardId, days) : null;
        out.push(mapComp(r, compClass, hasAnchorSeries ? anchorSeries : null, compSeries));
      }
      return out;
    };

    const setMates = await buildComps(setRows, 'set_mate', new Set());
    const setMateIds = new Set(setMates.map((c) => c.cardId));
    const characterMates = await buildComps(charRows, 'character_mate', setMateIds);

    groups.push({ anchor, altGrades, setMates, characterMates });
  }

  return { groups, count: groups.length, days };
}

// ---------------------------------------------------------------------------
// c) Buyout scanner
// ---------------------------------------------------------------------------

export interface BuyoutRipple {
  cardId: string;
  cardName: string | null;
  setName: string | null;
  imageSmall: string | null;
  currentPrice: number;
  changePct: number;
}

export interface BuyoutCandidateRow {
  cardId: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  imageSmall: string | null;
  currentPrice: number;
  prevPrice: number;
  changePct: number;
  days: number;
  listedCount: number | null;
  /** Recorded listing count at the window start (null until history accrues). */
  listedCountPrev: number | null;
  listedLow: number | null;
  soldListings: number;
  velocityRatio: number | null;
  premiumPctDelta: number | null;
  popDelta: number | null;
  liquidityScore: number;
  liquidityTier: LiquidityTier;
  buyoutScore: number;
  phase: BuyoutPhase;
  signals: string[];
  why: string;
  /** Set-mates likely to follow — "watch these next". */
  ripples: BuyoutRipple[];
  supplyNote: string;
}

const SUPPLY_NOTE =
  'Supply drain is measured from recorded listing-count history; cards without a recorded baseline get no supply signal.';

/** "Potential buyouts of a type of slabs" — spike + supply + velocity signals. */
export async function scanBuyoutCandidates(options?: {
  days?: number;
  limit?: number;
}): Promise<{ rows: BuyoutCandidateRow[]; count: number; days: number; note: string }> {
  const days = clamp(options?.days ?? 14, 7, 60);
  const limit = clamp(options?.limit ?? 12, 1, 50);
  const lookback = `-${days} days`;

  const rows = await all<{
    cardId: string;
    cardName: string | null;
    setId: string | null;
    setName: string | null;
    imageSmall: string | null;
    currentPrice: number;
    soldListings: number;
    listedCount: number | null;
    listedCountPrev: number | null;
    listedLow: number | null;
    fetchedAt: string | null;
    matchScore: number | null;
    historyPoints: number | null;
    prevPrice: number | null;
    baselineSold: number | null;
    rawNow: number | null;
    rawPrev: number | null;
    gradedPrev: number | null;
    psa10PopNow: number | null;
    psa10PopPrev: number | null;
  }>(
    `SELECT
       gp.cardId,
       gp.cardName,
       gp.setId,
       gp.setName,
       cm.imageSmall,
       gp.price AS currentPrice,
       COALESCE(gp.soldListings, 0) AS soldListings,
       gp.listedCount,
       (
         SELECT gph.listedCount FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
           AND gph.listedCount IS NOT NULL AND gph.date <= date('now', ?)
         ORDER BY gph.date DESC LIMIT 1
       ) AS listedCountPrev,
       gp.listedLow,
       gp.fetchedAt,
       gp.matchScore,
       (
         SELECT COUNT(DISTINCT gph.date) FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
       ) AS historyPoints,
       (
         SELECT gph.price FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
           AND gph.price > 0 AND gph.date <= date('now', ?)
         ORDER BY gph.date DESC LIMIT 1
       ) AS prevPrice,
       (
         SELECT AVG(gph.soldListings) FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
           AND gph.date >= date('now', '-60 days') AND gph.date <= date('now', '-7 days')
       ) AS baselineSold,
       (
         SELECT c.price FROM canonical_price_history c
         INNER JOIN card_mappings m ON m.uniqueIdentifier = c.uniqueIdentifier
         WHERE m.cardId = gp.cardId
         ORDER BY c.date DESC, c.price DESC LIMIT 1
       ) AS rawNow,
       (
         SELECT c.price FROM canonical_price_history c
         INNER JOIN card_mappings m ON m.uniqueIdentifier = c.uniqueIdentifier
         WHERE m.cardId = gp.cardId AND c.date <= date('now', ?)
         ORDER BY c.date DESC, c.price DESC LIMIT 1
       ) AS rawPrev,
       (
         SELECT gph.price FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
           AND gph.price > 0 AND gph.date <= date('now', ?)
         ORDER BY gph.date DESC LIMIT 1
       ) AS gradedPrev,
       (
         SELECT h.psa10 FROM population_history h
         WHERE h.cardId = gp.cardId AND h.psa10 IS NOT NULL
         ORDER BY h.date DESC LIMIT 1
       ) AS psa10PopNow,
       (
         SELECT h.psa10 FROM population_history h
         WHERE h.cardId = gp.cardId AND h.psa10 IS NOT NULL AND h.date <= date('now', ?)
         ORDER BY h.date DESC LIMIT 1
       ) AS psa10PopPrev
     FROM graded_prices gp
     LEFT JOIN card_mappings cm ON cm.cardId = gp.cardId
     WHERE UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
       AND gp.price IS NOT NULL AND gp.price >= ?
       AND COALESCE(gp.verified, 0) = 1
     GROUP BY gp.cardId`,
    [lookback, lookback, lookback, lookback, lookback, MOVER_MIN_PRICE]
  );

  const endpointCap = maxEndpointChangePctForPeriod(days);
  const candidates: BuyoutCandidateRow[] = [];
  for (const r of rows) {
    if (!(r.prevPrice && r.prevPrice > 0)) continue;
    const { changePct } = computeChange(r.currentPrice, r.prevPrice);
    if (changePct < 15 || changePct > endpointCap) continue;

    // Quality guard (topMoversQuality): require a gradual path, not a data cliff.
    const series = await fetchPsa10Series(r.cardId, days);
    const points: PricePointLite[] = series.map((p) => ({ date: p.date, price: p.price }));
    if (!isGradualMove(points, { cliffPct: 50, minPoints: 3 })) continue;

    const velocityRatio =
      r.baselineSold && r.baselineSold > 0 ? round2(r.soldListings / r.baselineSold) : null;

    let premiumPctDelta: number | null = null;
    if (r.rawNow && r.rawNow > 0 && r.gradedPrev && r.rawPrev && r.rawPrev > 0) {
      const nowP = ((r.currentPrice - r.rawNow) / r.rawNow) * 100;
      const prevP = ((r.gradedPrev - r.rawPrev) / r.rawPrev) * 100;
      premiumPctDelta = round2(nowP - prevP);
    }

    const popDelta =
      r.psa10PopNow != null && r.psa10PopPrev != null ? r.psa10PopNow - r.psa10PopPrev : null;

    const ageHours = ageHoursFromFetchedAt(r.fetchedAt);
    const stale = ageHours != null ? ageHours >= GRADED_STALE_HOURS : false;
    const liq = scoreLiquidity({
      soldListings: r.soldListings,
      verified: true,
      stale,
      ageHours,
      matchScore: r.matchScore,
      historyPoints: r.historyPoints,
    });

    const scored = computeBuyoutScore({
      spikePct: changePct,
      listedCount: r.listedCount,
      listedCountPrev: r.listedCountPrev,
      velocityRatio,
      liquidityTier: liq.tier,
      premiumPctDelta,
      popDelta,
    });

    candidates.push({
      cardId: r.cardId,
      cardName: r.cardName,
      setId: r.setId,
      setName: r.setName,
      imageSmall: r.imageSmall,
      currentPrice: round2(r.currentPrice),
      prevPrice: round2(r.prevPrice),
      changePct,
      days,
      listedCount: r.listedCount,
      listedCountPrev: r.listedCountPrev,
      listedLow: r.listedLow,
      soldListings: r.soldListings ?? 0,
      velocityRatio,
      premiumPctDelta,
      popDelta,
      liquidityScore: liq.score,
      liquidityTier: liq.tier,
      buyoutScore: scored.score,
      phase: scored.phase,
      signals: scored.signals,
      why: scored.why,
      ripples: [],
      supplyNote: SUPPLY_NOTE,
    });
  }

  // Shallow-history fallback: when the lookback predates graded_price_history
  // coverage, retry on a 7d window so the scanner isn't empty for new installs.
  if (candidates.length === 0 && days > 7) {
    return scanBuyoutCandidates({ days: 7, limit });
  }

  candidates.sort((a, b) => b.buyoutScore - a.buyoutScore);
  const top = candidates.slice(0, limit);

  // Ripples: set-mates by 7d momentum — "similar slabs that could be bought out next".
  const movers7 = await getSlabMovers({ days: 7, direction: 'up', limit: 100 });
  const bySet = new Map<string, SlabMoverRow[]>();
  for (const m of movers7.rows) {
    const key = m.setName || '';
    if (!key) continue;
    const arr = bySet.get(key) ?? [];
    arr.push(m);
    bySet.set(key, arr);
  }
  for (const cand of top) {
    const mates = (bySet.get(cand.setName || '') ?? [])
      .filter((m) => m.cardId !== cand.cardId)
      .slice(0, 3);
    cand.ripples = mates.map((m) => ({
      cardId: m.cardId,
      cardName: m.cardName,
      setName: m.setName,
      imageSmall: m.imageSmall,
      currentPrice: m.currentPrice,
      changePct: m.changePct,
    }));
  }

  return { rows: top, count: top.length, days, note: SUPPLY_NOTE };
}

// ---------------------------------------------------------------------------
// d) Aggregated opportunities
// ---------------------------------------------------------------------------

export interface OpportunityRow {
  cardId: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  imageSmall: string | null;
  currentPrice: number | null;
  score: number;
  grade: OpportunityGrade;
  predictedReturn90d: number | null;
  confidence: number | null;
  momentumPct: number | null;
  /** Window used for momentum (30d, or 7d when history is shallow). */
  momentumDays: number;
  buyoutScore: number;
  netSentiment: number | null;
  compMomentumPct: number | null;
  riskScore: number | null;
  why: string;
  keySignals: string[];
}

/** "Investment opportunities" — prediction + momentum + buyout + sentiment blend. */
export async function getOpportunities(options?: {
  limit?: number;
  minScore?: number;
}): Promise<{ rows: OpportunityRow[]; count: number }> {
  const limit = clamp(options?.limit ?? 20, 1, 100);
  const minScore = clamp(options?.minScore ?? 0, 0, 100);

  const [
    predictions,
    moverResult,
    buyoutResult,
    premiumRows,
    sentimentRows,
    rawPriceRows,
    catalystRows,
  ] = await Promise.all([
    all<{
      card_id: string;
      expected_90d_return: number | null;
      confidence_score: number | null;
      risk_score: number | null;
      category: string | null;
      current_price: number | null;
      cardName: string | null;
      setId: string | null;
      setName: string | null;
      imageSmall: string | null;
    }>(
      `SELECT sp.card_id, sp.expected_90d_return, sp.confidence_score, sp.risk_score,
              sp.category, sp.current_price,
              cm.cardName, cm.setId, cm.setName, cm.imageSmall
       FROM slab_predictions sp
       LEFT JOIN card_mappings cm ON cm.cardId = sp.card_id
       WHERE sp.run_id = (SELECT MAX(id) FROM slab_prediction_runs)
         AND LOWER(sp.grader) = 'psa' AND sp.grade = '10'
       GROUP BY sp.card_id`
    ),
    // 30d momentum, falling back to 7d when graded history is too shallow.
    getSlabMovers({ days: 30, limit: 100 }).then(async (res) =>
      res.rows.length > 0 ? res : getSlabMovers({ days: 7, limit: 100 })
    ),
    scanBuyoutCandidates({ days: 14, limit: 50 }),
    all<{ cardId: string; setName: string | null; premiumPct: number }>(
      `SELECT gp.cardId, gp.setName,
              ((gp.price - raw.price) / raw.price) * 100 AS premiumPct
       FROM graded_prices gp
       INNER JOIN (
         SELECT cm.cardId AS cardId, c.price AS price
         FROM card_mappings cm
         INNER JOIN canonical_price_history c ON c.uniqueIdentifier = cm.uniqueIdentifier
         WHERE c.rowid = (
           SELECT c2.rowid FROM canonical_price_history c2
           WHERE c2.uniqueIdentifier = cm.uniqueIdentifier
           ORDER BY c2.date DESC LIMIT 1
         )
       ) raw ON raw.cardId = gp.cardId
       WHERE UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
         AND COALESCE(gp.verified, 0) = 1
         AND gp.price > 0 AND raw.price > 0`
    ),
    all<{ card_id: string; netSentiment: number | null }>(
      `SELECT card_id,
              SUM(sentiment_score * MAX(relevance_score, 1))
                / CAST(SUM(MAX(relevance_score, 1)) AS REAL) AS netSentiment
       FROM external_market_signals
       WHERE card_id IS NOT NULL
         AND (expires_at IS NULL OR expires_at >= datetime('now'))
       GROUP BY card_id`
    ),
    all<{ cardId: string; rawPrice: number }>(
      `SELECT cm.cardId, c.price AS rawPrice
       FROM card_mappings cm
       INNER JOIN canonical_price_history c ON c.uniqueIdentifier = cm.uniqueIdentifier
       WHERE c.rowid = (
         SELECT c2.rowid FROM canonical_price_history c2
         WHERE c2.uniqueIdentifier = cm.uniqueIdentifier
         ORDER BY c2.date DESC LIMIT 1
       ) AND c.price > 0`
    ),
    all<{ card_id: string; hasCatalyst: number }>(
      `SELECT card_id,
              MAX(CASE
                WHEN source_type IN ('tournament', 'ban_list')
                  OR risk_type IN ('buyout', 'reprint', 'rotation', 'supply_shock', 'upcoming_set')
                THEN 1 ELSE 0
              END) AS hasCatalyst
       FROM external_market_signals
       WHERE card_id IS NOT NULL
         AND (expires_at IS NULL OR expires_at >= datetime('now'))
       GROUP BY card_id`
    ),
  ]);

  const moversById = new Map(moverResult.rows.map((m) => [m.cardId, m]));
  const buyoutsById = new Map(buyoutResult.rows.map((b) => [b.cardId, b]));
  const sentimentById = new Map(
    sentimentRows.map((s) => [
      s.card_id,
      s.netSentiment != null ? clamp(s.netSentiment / 100, -1, 1) : null,
    ])
  );
  const rawPriceById = new Map(rawPriceRows.map((r) => [r.cardId, r.rawPrice]));
  const catalystById = new Map(catalystRows.map((c) => [c.card_id, c.hasCatalyst === 1]));

  const premiumById = new Map(premiumRows.map((p) => [p.cardId, p]));
  const premiumsBySet = new Map<string, number[]>();
  for (const p of premiumRows) {
    if (!p.setName || !Number.isFinite(p.premiumPct)) continue;
    const arr = premiumsBySet.get(p.setName) ?? [];
    arr.push(p.premiumPct);
    premiumsBySet.set(p.setName, arr);
  }
  const setMedianPremium = new Map<string, number>();
  for (const [set, arr] of premiumsBySet) {
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    setMedianPremium.set(set, s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]);
  }

  // Comp momentum: average 30d move of set-mates.
  const setMomentum = new Map<string, { sum: number; n: number }>();
  for (const m of moverResult.rows) {
    if (!m.setName) continue;
    const acc = setMomentum.get(m.setName) ?? { sum: 0, n: 0 };
    acc.sum += m.changePct;
    acc.n += 1;
    setMomentum.set(m.setName, acc);
  }

  interface CardMeta {
    cardName: string | null;
    setId: string | null;
    setName: string | null;
    imageSmall: string | null;
    currentPrice: number | null;
  }
  const universe = new Map<string, CardMeta>();
  for (const p of predictions) {
    universe.set(p.card_id, {
      cardName: p.cardName,
      setId: p.setId,
      setName: p.setName,
      imageSmall: p.imageSmall,
      currentPrice: p.current_price,
    });
  }
  for (const m of moverResult.rows) {
    if (!universe.has(m.cardId)) {
      universe.set(m.cardId, {
        cardName: m.cardName,
        setId: m.setId,
        setName: m.setName,
        imageSmall: m.imageSmall,
        currentPrice: m.currentPrice,
      });
    }
  }
  for (const b of buyoutResult.rows) {
    if (!universe.has(b.cardId)) {
      universe.set(b.cardId, {
        cardName: b.cardName,
        setId: b.setId,
        setName: b.setName,
        imageSmall: b.imageSmall,
        currentPrice: b.currentPrice,
      });
    }
  }

  const predsById = new Map(predictions.map((p) => [p.card_id, p]));
  const out: OpportunityRow[] = [];

  for (const [cardId, meta] of universe) {
    const pred = predsById.get(cardId);
    const mover = moversById.get(cardId);
    const buyout = buyoutsById.get(cardId);
    const premium = premiumById.get(cardId);
    const median = meta.setName ? setMedianPremium.get(meta.setName) : undefined;
    const premiumVsSetMedian =
      premium && median != null ? round2(premium.premiumPct - median) : null;
    const netSentiment = sentimentById.get(cardId) ?? null;
    const setAcc = meta.setName ? setMomentum.get(meta.setName) : undefined;
    // Exclude the card's own move from its set's comp momentum.
    let compMomentumPct: number | null = null;
    if (setAcc) {
      const ownMove = mover?.changePct ?? 0;
      const n = setAcc.n - (mover ? 1 : 0);
      if (n > 0) compMomentumPct = round2((setAcc.sum - (mover ? ownMove : 0)) / n);
    }

    const { score: baseScore } = computeOpportunityScore({
      predictedReturn90d: pred?.expected_90d_return ?? null,
      confidence: pred?.confidence_score ?? null,
      momentumPct: mover?.changePct ?? 0,
      buyoutScore: buyout?.buyoutScore ?? 0,
      premiumVsSetMedian,
      netSentiment,
      compMomentumPct,
    });

    const marketPrice =
      rawPriceById.get(cardId) ?? meta.currentPrice ?? mover?.currentPrice ?? null;
    const bulk = applyBulkAndEconomicScoring({
      marketPrice,
      changeAbs: mover?.changeAbs ?? null,
      changePct: mover?.changePct ?? null,
      momentumDays: moverResult.days,
      soldListings: mover?.soldListings ?? buyout?.soldListings ?? 0,
      liquidityTier: mover?.liquidityTier ?? buyout?.liquidityTier ?? null,
      buyoutScore: buyout?.buyoutScore ?? 0,
      velocityRatio: buyout?.velocityRatio ?? null,
      listedCount: buyout?.listedCount ?? null,
      listedCountPrev: buyout?.listedCountPrev ?? null,
      netSentiment,
      hasCatalyst: catalystById.get(cardId) ?? false,
      compMomentumPct,
    });

    const score = clamp(Math.round(baseScore + bulk.economicBoost - bulk.penalty), 0, 100);
    const grade: OpportunityGrade =
      score >= 75 ? 'strong_buy' : score >= 60 ? 'buy' : score >= 45 ? 'watch' : 'pass';

    const keySignals: string[] = [];
    if (pred?.expected_90d_return != null) {
      keySignals.push(`predicted_90d:${round2(pred.expected_90d_return)}%`);
    } else {
      keySignals.push('momentum_only_scoring');
    }
    if (mover) {
      keySignals.push(
        `momentum_${moverResult.days}d:${mover.changePct > 0 ? '+' : ''}${mover.changePct}%`
      );
    }
    if (buyout) keySignals.push(`buyout:${buyout.buyoutScore}`);
    if (premiumVsSetMedian != null && premiumVsSetMedian < -10) {
      keySignals.push(`undervalued_vs_set:${premiumVsSetMedian}pp`);
    }
    if (netSentiment != null && Math.abs(netSentiment) > 0.15) {
      keySignals.push(`sentiment:${netSentiment > 0 ? 'positive' : 'negative'}`);
    }
    if (compMomentumPct != null && compMomentumPct > 5) {
      keySignals.push(`set_momentum:+${compMomentumPct}%`);
    }

    if (bulk.overrideActive) {
      keySignals.push('bulk_override:demand_evidence');
    }
    if (bulk.flags.includes('trivial_abs_gain')) {
      keySignals.push('bulk_penalty:trivial_abs_gain');
    }
    if (bulk.penalty >= 15 && !bulk.overrideActive) {
      keySignals.push(`bulk_penalty:-${bulk.penalty}`);
    }
    if (bulk.economicBoost > 0) {
      keySignals.push(`economic_boost:+${bulk.economicBoost}`);
    }

    const whyParts: string[] = [];
    if (pred?.expected_90d_return != null) {
      whyParts.push(
        `Model expects ${round2(pred.expected_90d_return)}% over 90d at ${pred.confidence_score ?? 0}% confidence`
      );
    } else {
      whyParts.push('No slab prediction — scored on momentum and market structure');
    }
    if (mover) {
      whyParts.push(
        `slab ${mover.changePct > 0 ? 'up' : 'down'} ${Math.abs(mover.changePct)}% in ${moverResult.days}d`
      );
    }
    if (buyout) whyParts.push(`buyout signals (${buyout.phase})`);
    if (premiumVsSetMedian != null && premiumVsSetMedian < -10) {
      whyParts.push('premium below set median');
    }

    const baseWhy = `${whyParts.join('; ')}.`;
    const why = buildBulkAwareWhy({ marketPrice, bulk, baseWhy: baseWhy });

    out.push({
      cardId,
      cardName: meta.cardName,
      setId: meta.setId,
      setName: meta.setName,
      imageSmall: meta.imageSmall,
      currentPrice: meta.currentPrice != null ? round2(meta.currentPrice) : null,
      score,
      grade,
      predictedReturn90d:
        pred?.expected_90d_return != null ? round2(pred.expected_90d_return) : null,
      confidence: pred?.confidence_score ?? null,
      momentumPct: mover?.changePct ?? null,
      momentumDays: moverResult.days,
      buyoutScore: buyout?.buyoutScore ?? 0,
      netSentiment,
      compMomentumPct,
      riskScore: pred?.risk_score ?? null,
      why,
      keySignals,
    });
  }

  out.sort((a, b) => b.score - a.score);
  const rows = out.filter((r) => r.score >= minScore).slice(0, limit);
  return { rows, count: rows.length };
}

// ---------------------------------------------------------------------------
// e) Global external factors feed
// ---------------------------------------------------------------------------

export interface ExternalFactorsResult {
  rows: import('./investmentSignalEnrichment').InvestmentSignal[];
  actionable: import('./investmentSignalEnrichment').InvestmentSignal[];
  emerging: import('./investmentSignalEnrichment').InvestmentSignal[];
  count: number;
  byCategory: Record<string, number>;
  pulse: import('./investmentSignalEnrichment').MarketPulse;
  lastUpdated: string;
}

/** "Signals" — active external events enriched with market metrics and scoring. */
export async function getExternalFactorsGlobal(options?: {
  limit?: number;
  type?: string;
  direction?: string;
  sort?: string;
}): Promise<ExternalFactorsResult> {
  const enrichment = await import('./investmentSignalEnrichment');
  const {
    enrichInvestmentSignal,
    buildMarketPulse,
    sortInvestmentSignals,
    mapSignalCategory,
    dedupeInvestmentSignals,
    partitionSignalsByTier,
    parseReleaseDaysAgo,
  } = enrichment;
  type SignalSort = import('./investmentSignalEnrichment').SignalSort;

  const limit = clamp(options?.limit ?? 50, 1, 200);
  const params: unknown[] = [];
  let typeFilter = '';
  if (options?.type) {
    typeFilter = 'AND (s.source_type = ? OR s.risk_type = ? OR s.source_type = ?)';
    const mapped =
      options.type === 'reddit'
        ? 'social'
        : options.type === 'set_release'
          ? 'set_release'
          : options.type;
    params.push(mapped, options.type, mapped);
  }

  const rows = await all<{
    id: number;
    card_id: string | null;
    card_name: string | null;
    set_name: string | null;
    imageSmall: string | null;
    mappedCardName: string | null;
    mappedSetName: string | null;
    source_url: string | null;
    source_type: string | null;
    title: string | null;
    summary: string | null;
    sentiment_score: number | null;
    relevance_score: number | null;
    risk_type: string | null;
    created_at: string | null;
    expires_at: string | null;
    cardNetSentiment: number | null;
  }>(
    `SELECT
       s.id, s.card_id, s.card_name, s.set_name,
       cm.imageSmall,
       cm.cardName AS mappedCardName,
       cm.setName AS mappedSetName,
       s.source_url, s.source_type, s.title, s.summary,
       s.sentiment_score, s.relevance_score, s.risk_type,
       s.created_at, s.expires_at,
       (
         SELECT SUM(s2.sentiment_score * MAX(s2.relevance_score, 1))
                / CAST(SUM(MAX(s2.relevance_score, 1)) AS REAL)
         FROM external_market_signals s2
         WHERE s2.card_id = s.card_id AND s.card_id IS NOT NULL
           AND (s2.expires_at IS NULL OR s2.expires_at >= datetime('now'))
       ) AS cardNetSentiment
     FROM external_market_signals s
     LEFT JOIN card_mappings cm ON cm.cardId = s.card_id
     WHERE (s.expires_at IS NULL OR s.expires_at >= datetime('now'))
       ${typeFilter}
     GROUP BY s.id
     ORDER BY s.relevance_score DESC, s.created_at DESC
     LIMIT ?`,
    [...params, limit * 2]
  );

  const rawSignals = rows.map((r) => ({
    id: r.id,
    cardId: r.card_id,
    cardName: r.mappedCardName ?? r.card_name,
    setName: r.mappedSetName ?? r.set_name,
    imageSmall: r.imageSmall,
    sourceUrl: r.source_url,
    sourceType: r.source_type,
    title: r.title,
    summary: r.summary,
    sentiment: clamp((r.sentiment_score ?? 0) / 100, -1, 1),
    relevance: clamp((r.relevance_score ?? 0) / 100, 0, 1),
    riskType: r.risk_type,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    cardNetSentiment:
      r.cardNetSentiment != null ? round2(clamp(r.cardNetSentiment / 100, -1, 1)) : null,
  }));

  let enriched = await Promise.all(rawSignals.map((raw) => enrichInvestmentSignal(raw)));

  if (options?.direction) {
    enriched = enriched.filter((s) => s.direction === options.direction);
  }

  enriched = dedupeInvestmentSignals(enriched);

  enriched = enriched.filter((s) => {
    if (s.category !== 'set_release') return true;
    const days = enrichment.parseReleaseDaysAgo(s.eventDetail);
    if (days == null) return true;
    if (days <= 120) return true;
    return s.opportunityScore >= 50;
  });

  const sortKey = (
    ['score', 'confidence', 'newest', 'price_impact', 'volume'] as SignalSort[]
  ).includes(options?.sort as SignalSort)
    ? (options!.sort as SignalSort)
    : 'score';
  enriched = sortInvestmentSignals(enriched, sortKey);

  const analyzedLast24hRows = await all<{ c: number }>(
    `SELECT COUNT(*) AS c FROM external_market_signals
     WHERE created_at >= datetime('now', '-1 day')
       AND (expires_at IS NULL OR expires_at >= datetime('now'))`
  );
  const analyzedLast24h = analyzedLast24hRows[0]?.c ?? 0;

  const { actionable, emerging } = partitionSignalsByTier(enriched);
  const actionableSlice = actionable.slice(0, limit);
  const emergingSlice = emerging.slice(0, Math.max(limit, 30));

  const pulsePool = [...actionableSlice, ...emergingSlice.slice(0, 20)];

  const byCategory: Record<string, number> = {};
  for (const s of enriched) {
    byCategory[s.category] = (byCategory[s.category] ?? 0) + 1;
  }
  for (const r of rawSignals) {
    const cat = mapSignalCategory(r.sourceType, r.riskType);
    if (!(cat in byCategory)) byCategory[cat] = byCategory[cat] ?? 0;
  }
  // Full category counts from unfiltered fetch for filter badges
  const allCatRows = await all<{ source_type: string | null; risk_type: string | null }>(
    `SELECT source_type, risk_type FROM external_market_signals
     WHERE expires_at IS NULL OR expires_at >= datetime('now')`
  );
  const categoryCounts: Record<string, number> = {};
  for (const r of allCatRows) {
    const cat = mapSignalCategory(r.source_type, r.risk_type);
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  }

  return {
    rows: actionableSlice,
    actionable: actionableSlice,
    emerging: emergingSlice,
    count: actionableSlice.length + emergingSlice.length,
    byCategory: categoryCounts,
    pulse: buildMarketPulse(pulsePool, analyzedLast24h),
    lastUpdated: new Date().toISOString(),
  };
}
