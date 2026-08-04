import { getDb } from '../db/database';
import { getLatestCanonicalPriceByCardId } from './canonicalPriceService';
import { scoreLiquidity, type LiquidityTier } from './liquidityScore';

export interface GradedSpreadRow {
  cardId: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  grader: string;
  grade: string;
  gradedPrice: number;
  rawPrice: number | null;
  premium: number | null;
  premiumPct: number | null;
  soldListings: number;
  fetchedAt: string | null;
  verified?: boolean;
  stale?: boolean;
  ageHours?: number | null;
  /** After-fee PSA 10 net (raw + Regular-tier fee estimate) when both prices exist */
  netAfterFee?: number | null;
  gradingFee?: number | null;
  matchScore?: number | null;
  historyPoints?: number | null;
  liquidityScore?: number | null;
  liquidityTier?: LiquidityTier | null;
  liquidityLabel?: string | null;
}

const GRADED_STALE_HOURS = 12;

function ageHoursFromFetchedAt(fetchedAt: string | null | undefined): number | null {
  if (!fetchedAt) return null;
  const ms = new Date(fetchedAt.endsWith('Z') ? fetchedAt : `${fetchedAt}Z`).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round((Date.now() - ms) / 3600000));
}

function freshness(fetchedAt: string | null | undefined, verified?: number | null) {
  const ageHours = ageHoursFromFetchedAt(fetchedAt);
  return {
    verified: verified == null ? undefined : Number(verified) === 1,
    ageHours,
    stale: ageHours != null ? ageHours >= GRADED_STALE_HOURS : undefined,
  };
}

/** Mirror of gradeWorthinessService Regular-floor fee (Value tiers paused). */
function estimatePsaFee(declaredValue: number): number {
  const v = Math.max(0, Number(declaredValue) || 0);
  let baseFee: number;
  if (v <= 1499) baseFee = 79.99;
  else if (v <= 2999) baseFee = 149;
  else if (v <= 4999) baseFee = 299;
  else baseFee = 599;
  const insurance = v > 499 ? (v - 499) * 0.02 : 0;
  return Math.round((baseFee + insurance) * 100) / 100;
}

function withFeeNet(row: GradedSpreadRow): GradedSpreadRow {
  if (row.rawPrice == null || !(row.rawPrice > 0) || !(row.gradedPrice > 0)) {
    return withLiquidity({ ...row, netAfterFee: null, gradingFee: null });
  }
  const gradingFee = estimatePsaFee(row.gradedPrice);
  return withLiquidity({
    ...row,
    gradingFee,
    netAfterFee: Math.round((row.gradedPrice - row.rawPrice - gradingFee) * 100) / 100,
  });
}

function withLiquidity(row: GradedSpreadRow): GradedSpreadRow {
  const liq = scoreLiquidity({
    soldListings: row.soldListings,
    verified: row.verified,
    stale: row.stale,
    ageHours: row.ageHours,
    matchScore: row.matchScore,
    historyPoints: row.historyPoints,
  });
  return {
    ...row,
    liquidityScore: liq.score,
    liquidityTier: liq.tier,
    liquidityLabel: liq.label,
  };
}

export interface GradedSpreadSummary {
  cardId: string;
  cardName: string | null;
  rawPrice: number | null;
  spreads: GradedSpreadRow[];
  psa10PremiumPct: number | null;
  bestPremiumPct: number | null;
}

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve((rows || []) as T[]);
    });
  });

/**
 * Graded vs raw market spreads for a card (PSA/CGC/BGS premiums).
 */
export async function getGradedSpreadsForCard(cardId: string): Promise<GradedSpreadSummary> {
  const graded = await all<{
    cardId: string;
    cardName: string | null;
    setId: string | null;
    setName: string | null;
    grader: string;
    grade: string;
    price: number;
    soldListings: number;
    fetchedAt: string | null;
    verified: number | null;
  }>(
    `SELECT cardId, cardName, setId, setName, grader, grade, price, soldListings, fetchedAt,
            COALESCE(verified, 0) AS verified
     FROM graded_prices
     WHERE cardId = ? AND price IS NOT NULL AND price > 0
     ORDER BY grader, CAST(grade AS REAL) DESC`,
    [cardId]
  );

  const canonical = await getLatestCanonicalPriceByCardId(cardId);
  const rawPrice = canonical?.price ?? null;

  const spreads: GradedSpreadRow[] = graded.map((g) => {
    const premium = rawPrice && rawPrice > 0 ? g.price - rawPrice : null;
    const premiumPct =
      rawPrice && rawPrice > 0 && premium !== null ? (premium / rawPrice) * 100 : null;
    const fresh = freshness(g.fetchedAt, g.verified);
    return withFeeNet({
      cardId: g.cardId,
      cardName: g.cardName,
      setId: g.setId,
      setName: g.setName,
      grader: g.grader,
      grade: g.grade,
      gradedPrice: g.price,
      rawPrice,
      premium,
      premiumPct,
      soldListings: g.soldListings ?? 0,
      fetchedAt: g.fetchedAt,
      ...fresh,
    });
  });

  const psa10 = spreads.find(
    (s) => s.grader.toUpperCase() === 'PSA' && String(s.grade) === '10'
  );
  const bestPremiumPct = spreads.reduce<number | null>((best, s) => {
    if (s.premiumPct == null) return best;
    if (best == null || s.premiumPct > best) return s.premiumPct;
    return best;
  }, null);

  return {
    cardId,
    cardName: graded[0]?.cardName ?? null,
    rawPrice,
    spreads,
    psa10PremiumPct: psa10?.premiumPct ?? null,
    bestPremiumPct,
  };
}

/**
 * Top PSA 10 premiums across the graded_prices table (cards with raw quotes).
 */
export async function getTopGradedPremiums(
  limit = 50,
  options?: { tradeableOnly?: boolean }
): Promise<GradedSpreadRow[]> {
  const rows = await all<{
    cardId: string;
    cardName: string | null;
    setId: string | null;
    setName: string | null;
    grader: string;
    grade: string;
    gradedPrice: number;
    soldListings: number;
    fetchedAt: string | null;
    verified: number | null;
    matchScore: number | null;
    historyPoints: number | null;
    rawPrice: number | null;
  }>(
    `SELECT
       gp.cardId, gp.cardName, gp.setId, gp.setName, gp.grader, gp.grade,
       gp.price AS gradedPrice, gp.soldListings, gp.fetchedAt,
       COALESCE(gp.verified, 0) AS verified,
       gp.matchScore,
       (
         SELECT COUNT(DISTINCT gph.date) FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
       ) AS historyPoints,
       (
         SELECT c.price FROM canonical_price_history c
         INNER JOIN card_mappings cm ON cm.uniqueIdentifier = c.uniqueIdentifier
         WHERE cm.cardId = gp.cardId
         ORDER BY c.date DESC LIMIT 1
       ) AS rawPrice
     FROM graded_prices gp
     WHERE UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
       AND gp.price IS NOT NULL AND gp.price > 0
     ORDER BY gp.price DESC
     LIMIT ?`,
    [Math.min(limit * 4, 600)]
  );

  let mapped = rows
    .filter((r) => r.rawPrice && r.rawPrice > 0)
    .map((r) => {
      const premium = r.gradedPrice - (r.rawPrice as number);
      const premiumPct = (premium / (r.rawPrice as number)) * 100;
      const fresh = freshness(r.fetchedAt, r.verified);
      return withFeeNet({
        cardId: r.cardId,
        cardName: r.cardName,
        setId: r.setId,
        setName: r.setName,
        grader: r.grader,
        grade: r.grade,
        gradedPrice: r.gradedPrice,
        rawPrice: r.rawPrice,
        premium,
        premiumPct,
        soldListings: r.soldListings ?? 0,
        fetchedAt: r.fetchedAt,
        matchScore: r.matchScore,
        historyPoints: r.historyPoints,
        ...fresh,
      });
    })
    .sort((a, b) => (b.premiumPct ?? 0) - (a.premiumPct ?? 0));

  if (options?.tradeableOnly) {
    const tradeable = mapped.filter((r) => (r.liquidityScore ?? 0) >= 45);
    if (tradeable.length > 0) mapped = tradeable;
  }

  return mapped.slice(0, limit);
}

/**
 * PSA 10 spreads for a batch of card ids (watchlist / vault glue).
 */
export async function getPsa10SpreadsForCards(cardIds: string[]): Promise<GradedSpreadRow[]> {
  const ids = [...new Set(cardIds.map((id) => String(id).trim()).filter(Boolean))].slice(0, 100);
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => '?').join(',');
  const rows = await all<{
    cardId: string;
    cardName: string | null;
    setId: string | null;
    setName: string | null;
    grader: string;
    grade: string;
    gradedPrice: number;
    soldListings: number;
    fetchedAt: string | null;
    verified: number | null;
    rawPrice: number | null;
  }>(
    `SELECT
       gp.cardId, gp.cardName, gp.setId, gp.setName, gp.grader, gp.grade,
       gp.price AS gradedPrice, gp.soldListings, gp.fetchedAt,
       COALESCE(gp.verified, 0) AS verified,
       (
         SELECT c.price FROM canonical_price_history c
         INNER JOIN card_mappings cm ON cm.uniqueIdentifier = c.uniqueIdentifier
         WHERE cm.cardId = gp.cardId
         ORDER BY c.date DESC LIMIT 1
       ) AS rawPrice
     FROM graded_prices gp
     WHERE UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
       AND gp.price IS NOT NULL AND gp.price > 0
       AND gp.cardId IN (${placeholders})`,
    ids
  );

  return rows.map((r) => {
    const rawPrice = r.rawPrice != null && r.rawPrice > 0 ? r.rawPrice : null;
    const premium = rawPrice != null ? r.gradedPrice - rawPrice : null;
    const premiumPct = rawPrice != null && premium != null ? (premium / rawPrice) * 100 : null;
    const fresh = freshness(r.fetchedAt, r.verified);
    return withFeeNet({
      cardId: r.cardId,
      cardName: r.cardName,
      setId: r.setId,
      setName: r.setName,
      grader: r.grader,
      grade: r.grade,
      gradedPrice: r.gradedPrice,
      rawPrice,
      premium,
      premiumPct,
      soldListings: r.soldListings ?? 0,
      fetchedAt: r.fetchedAt,
      ...fresh,
    });
  });
}

export interface PremiumMoverRow {
  cardId: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  gradedPrice: number;
  rawPrice: number;
  premiumPct: number;
  premiumPctPrev: number;
  premiumPctDelta: number;
  days: number;
  soldListings: number;
  verified: boolean;
  stale: boolean;
  ageHours: number | null;
  direction: 'expanding' | 'compressing';
  liquidityScore?: number;
  liquidityTier?: LiquidityTier;
  liquidityLabel?: string;
}

/**
 * PSA 10 premium % change over `days` (graded history vs raw history).
 */
export async function getTopPremiumMovers(options?: {
  days?: number;
  limit?: number;
}): Promise<PremiumMoverRow[]> {
  const days = Math.min(Math.max(options?.days ?? 30, 7), 90);
  const limit = Math.min(Math.max(options?.limit ?? 12, 1), 50);
  const lookback = `-${days} days`;

  const rows = await all<{
    cardId: string;
    cardName: string | null;
    setId: string | null;
    setName: string | null;
    gradedNow: number;
    gradedPrev: number | null;
    soldListings: number;
    fetchedAt: string | null;
    verified: number | null;
    matchScore: number | null;
    historyPoints: number | null;
    rawNow: number | null;
    rawPrev: number | null;
  }>(
    `SELECT
       gp.cardId,
       gp.cardName,
       gp.setId,
       gp.setName,
       gp.price AS gradedNow,
       COALESCE(gp.soldListings, 0) AS soldListings,
       gp.fetchedAt,
       COALESCE(gp.verified, 0) AS verified,
       gp.matchScore,
       (
         SELECT COUNT(DISTINCT gph.date) FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
       ) AS historyPoints,
       (
         SELECT gph.price
         FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId
           AND UPPER(gph.grader) = 'PSA'
           AND gph.grade = '10'
           AND gph.price IS NOT NULL AND gph.price > 0
           AND gph.date <= date('now', ?)
         ORDER BY gph.date DESC
         LIMIT 1
       ) AS gradedPrev,
       (
         SELECT c.price FROM canonical_price_history c
         INNER JOIN card_mappings cm ON cm.uniqueIdentifier = c.uniqueIdentifier
         WHERE cm.cardId = gp.cardId
         ORDER BY c.date DESC LIMIT 1
       ) AS rawNow,
       (
         SELECT c.price FROM canonical_price_history c
         INNER JOIN card_mappings cm ON cm.uniqueIdentifier = c.uniqueIdentifier
         WHERE cm.cardId = gp.cardId
           AND c.date <= date('now', ?)
         ORDER BY c.date DESC LIMIT 1
       ) AS rawPrev
     FROM graded_prices gp
     WHERE UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
       AND gp.price IS NOT NULL AND gp.price > 0
       AND COALESCE(gp.verified, 0) = 1`,
    [lookback, lookback]
  );

  const movers: PremiumMoverRow[] = [];
  for (const r of rows) {
    if (!(r.rawNow && r.rawNow > 0) || !(r.rawPrev && r.rawPrev > 0)) continue;
    if (!(r.gradedPrev && r.gradedPrev > 0)) continue;
    const premiumPct = ((r.gradedNow - r.rawNow) / r.rawNow) * 100;
    const premiumPctPrev = ((r.gradedPrev - r.rawPrev) / r.rawPrev) * 100;
    const premiumPctDelta = premiumPct - premiumPctPrev;
    if (!Number.isFinite(premiumPctDelta) || Math.abs(premiumPctDelta) < 5) continue;
    const fresh = freshness(r.fetchedAt, r.verified);
    const liq = scoreLiquidity({
      soldListings: r.soldListings,
      verified: fresh.verified === true,
      stale: fresh.stale === true,
      ageHours: fresh.ageHours,
      matchScore: r.matchScore,
      historyPoints: r.historyPoints,
    });
    movers.push({
      cardId: r.cardId,
      cardName: r.cardName,
      setId: r.setId,
      setName: r.setName,
      gradedPrice: r.gradedNow,
      rawPrice: r.rawNow,
      premiumPct,
      premiumPctPrev,
      premiumPctDelta,
      days,
      soldListings: r.soldListings ?? 0,
      verified: fresh.verified === true,
      stale: fresh.stale === true,
      ageHours: fresh.ageHours,
      direction: premiumPctDelta >= 0 ? 'expanding' : 'compressing',
      liquidityScore: liq.score,
      liquidityTier: liq.tier,
      liquidityLabel: liq.label,
    });
  }

  movers.sort((a, b) => Math.abs(b.premiumPctDelta) - Math.abs(a.premiumPctDelta));
  return movers.slice(0, limit);
}

export interface CrossGraderArbRow {
  cardId: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  psa10: number;
  altGrader: string;
  altGrade: string;
  altPrice: number;
  spread: number;
  spreadPct: number;
  soldListings: number;
  verified: boolean;
  stale: boolean;
  ageHours: number | null;
  liquidityScore?: number;
  liquidityTier?: LiquidityTier;
  liquidityLabel?: string;
}

/**
 * PSA 10 vs CGC/BGS/SGC 10 price gaps on the same card.
 */
export async function getCrossGraderArbs(limit = 12): Promise<CrossGraderArbRow[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const rows = await all<{
    cardId: string;
    cardName: string | null;
    setId: string | null;
    setName: string | null;
    psa10: number;
    soldListings: number;
    fetchedAt: string | null;
    verified: number | null;
    matchScore: number | null;
    historyPoints: number | null;
    cgc10: number | null;
    cgcPristine: number | null;
    bgs10: number | null;
    bgsBlack: number | null;
    sgc10: number | null;
  }>(
    `SELECT
       psa.cardId,
       psa.cardName,
       psa.setId,
       psa.setName,
       psa.price AS psa10,
       COALESCE(psa.soldListings, 0) AS soldListings,
       psa.fetchedAt,
       COALESCE(psa.verified, 0) AS verified,
       psa.matchScore,
       (
         SELECT COUNT(DISTINCT gph.date) FROM graded_price_history gph
         WHERE gph.cardId = psa.cardId AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
       ) AS historyPoints,
       (
         SELECT g.price FROM graded_prices g
         WHERE g.cardId = psa.cardId AND UPPER(g.grader) = 'CGC' AND g.grade = '10'
           AND g.price IS NOT NULL AND g.price > 0
         LIMIT 1
       ) AS cgc10,
       (
         SELECT g.price FROM graded_prices g
         WHERE g.cardId = psa.cardId AND UPPER(g.grader) = 'CGC' AND lower(g.grade) LIKE '%pristine%'
           AND g.price IS NOT NULL AND g.price > 0
         LIMIT 1
       ) AS cgcPristine,
       (
         SELECT g.price FROM graded_prices g
         WHERE g.cardId = psa.cardId AND UPPER(g.grader) = 'BGS' AND g.grade = '10'
           AND g.price IS NOT NULL AND g.price > 0
         LIMIT 1
       ) AS bgs10,
       (
         SELECT g.price FROM graded_prices g
         WHERE g.cardId = psa.cardId AND UPPER(g.grader) = 'BGS' AND lower(g.grade) LIKE '%black%'
           AND g.price IS NOT NULL AND g.price > 0
         LIMIT 1
       ) AS bgsBlack,
       (
         SELECT g.price FROM graded_prices g
         WHERE g.cardId = psa.cardId AND UPPER(g.grader) = 'SGC' AND g.grade = '10'
           AND g.price IS NOT NULL AND g.price > 0
         LIMIT 1
       ) AS sgc10
     FROM graded_prices psa
     WHERE UPPER(psa.grader) = 'PSA' AND psa.grade = '10'
       AND psa.price IS NOT NULL AND psa.price > 0
       AND COALESCE(psa.verified, 0) = 1`
  );

  const arbs: CrossGraderArbRow[] = [];
  for (const r of rows) {
    const alts: { grader: string; grade: string; price: number }[] = [];
    if (r.cgc10 && r.cgc10 > 0) alts.push({ grader: 'CGC', grade: '10', price: r.cgc10 });
    if (r.cgcPristine && r.cgcPristine > 0) {
      alts.push({ grader: 'CGC', grade: '10 pristine', price: r.cgcPristine });
    }
    if (r.bgsBlack && r.bgsBlack > 0) {
      alts.push({ grader: 'BGS', grade: '10 black', price: r.bgsBlack });
    } else if (r.bgs10 && r.bgs10 > 0) {
      alts.push({ grader: 'BGS', grade: '10', price: r.bgs10 });
    }
    if (r.sgc10 && r.sgc10 > 0) alts.push({ grader: 'SGC', grade: '10', price: r.sgc10 });
    if (alts.length === 0) continue;

    // Largest absolute gap vs PSA 10
    let best = alts[0];
    let bestAbs = Math.abs(r.psa10 - best.price);
    for (const alt of alts.slice(1)) {
      const abs = Math.abs(r.psa10 - alt.price);
      if (abs > bestAbs) {
        best = alt;
        bestAbs = abs;
      }
    }
    const spread = r.psa10 - best.price;
    const spreadPct = (spread / r.psa10) * 100;
    if (Math.abs(spreadPct) < 3) continue;
    const fresh = freshness(r.fetchedAt, r.verified);
    const liq = scoreLiquidity({
      soldListings: r.soldListings,
      verified: fresh.verified === true,
      stale: fresh.stale === true,
      ageHours: fresh.ageHours,
      matchScore: r.matchScore,
      historyPoints: r.historyPoints,
    });
    arbs.push({
      cardId: r.cardId,
      cardName: r.cardName,
      setId: r.setId,
      setName: r.setName,
      psa10: r.psa10,
      altGrader: best.grader,
      altGrade: best.grade,
      altPrice: best.price,
      spread,
      spreadPct,
      soldListings: r.soldListings ?? 0,
      verified: fresh.verified === true,
      stale: fresh.stale === true,
      ageHours: fresh.ageHours,
      liquidityScore: liq.score,
      liquidityTier: liq.tier,
      liquidityLabel: liq.label,
    });
  }

  arbs.sort((a, b) => Math.abs(b.spreadPct) - Math.abs(a.spreadPct));
  return arbs.slice(0, safeLimit);
}
