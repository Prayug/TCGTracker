import { CardCondition } from '../../types/pokemon';
import { CategoryDetails, GradingResult, normalizeScore } from '../../types/grading';
import {
  CategoryKey,
  CATEGORY_KEYS,
  categoryFromResult,
  displayCardName,
  isUnidentifiedCard,
  rankedCategories,
} from './gradingPresentation';
import { estimatePsaGradingFee, PSA_REGULAR_FLOOR } from './psaFees';

export type MarketplaceCondition = Exclude<CardCondition, 'raw'>;

export type ConfidenceBand = 'low' | 'moderate' | 'high';

export type ImpactLevel = 'severe' | 'high' | 'moderate' | 'minimal';

export type Recommendation = 'list' | 'keep-raw' | 'consider' | 'submit' | 'identify';

export type DisputeVerdict = 'looks-right' | 'not-damage';

export type DisputeReason = 'print' | 'foil' | 'glare' | 'shadow' | 'other';

export type DefectDispute = {
  defect: string;
  verdict: DisputeVerdict;
  reason?: DisputeReason;
};

export type GradeMarket = {
  raw: number | null;
  psa: Partial<Record<8 | 9 | 10, number | null>>;
};

export type ImpactRow = {
  level: ImpactLevel;
  text: string;
  original: string;
  category: CategoryKey;
  knockout: boolean;
};

export type PsaRange = { low: number; high: number };

export type PsaMass = { grade: number; pct: number };

export type GradeEconomics = {
  fee: number;
  feeTier: string;
  raw: number | null;
  psa8: number | null;
  psa9: number | null;
  psa10: number | null;
  spread9to10: number | null;
  highStakes: boolean;
  expectedSlab: number | null;
  expectedUpside: number | null;
  distribution: PsaMass[] | null;
};

export type GradeDecision = {
  identified: boolean;
  displayName: string;
  marketplace: MarketplaceCondition;
  marketplaceLabel: string;
  marketplaceAbbr: string;
  psaRange: PsaRange | null;
  psaRangeLabel: string | null;
  psaEstimateAllowed: boolean;
  refuseReason: string | null;
  knockout: boolean;
  knockoutReason: string | null;
  recommendation: Recommendation;
  recommendationTitle: string;
  recommendationBody: string;
  why: string;
  counterfactual: string | null;
  impacts: ImpactRow[];
  confidence: ConfidenceBand;
  confidenceReason: string;
  userAdjusted: boolean;
  sellerCopy: string;
  economics: GradeEconomics | null;
  showDistribution: boolean;
  surfaceUnknown: boolean;
  modelPsaRangeLabel: string | null;
};

export const MARKETPLACE_LABEL: Record<MarketplaceCondition, string> = {
  'near-mint': 'Near Mint',
  'lightly-played': 'Lightly Played',
  'moderately-played': 'Moderately Played',
  'heavily-played': 'Heavily Played',
  damaged: 'Damaged',
};

export const MARKETPLACE_ABBR: Record<MarketplaceCondition, string> = {
  'near-mint': 'NM',
  'lightly-played': 'LP',
  'moderately-played': 'MP',
  'heavily-played': 'HP',
  damaged: 'DMG',
};

const KNOCKOUT_RE = /crease|fold|tear|hole|\bstain\b|water damage|warp/;
const HEAVY_WEAR_RE = /heavy|severe|major/;
const WEAR_RE = /whiten|scratch|scuff|wear|chip|nick/;

const LEVEL_ORDER: Record<ImpactLevel, number> = {
  severe: 0,
  high: 1,
  moderate: 2,
  minimal: 3,
};

export function humanizeDefect(text: string): string {
  return text
    .replace(/\s*\(\d+\s*lines?\)/gi, '')
    .replace(/\s*\(\d+%\)/g, '')
    .replace(/\bdetected\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[.,;]+$/, '')
    .trim();
}

export function isKnockoutText(text: string): boolean {
  return KNOCKOUT_RE.test(text.toLowerCase());
}

export function confidenceBand(confidence?: number, retakeRecommended?: boolean): ConfidenceBand {
  if (retakeRecommended) return 'low';
  if (confidence == null) return 'moderate';
  if (confidence < 0.5) return 'low';
  if (confidence < 0.8) return 'moderate';
  return 'high';
}

export function snapPsaDown(grade: number): number {
  const g = normalizeScore(grade);
  if (g < 1.5) return 1;
  if (g < 2) return 1.5;
  return Math.max(1, Math.floor(g));
}

export function snapPsaUp(grade: number): number {
  const g = normalizeScore(grade);
  if (g <= 1) return 1;
  if (g <= 1.5) return 1.5;
  if (Number.isInteger(g)) return Math.min(10, g);
  return Math.min(10, Math.ceil(g));
}

export function formatPsaRange(range: PsaRange): string {
  if (range.low === range.high) return `PSA ${formatPsaGrade(range.low)}`;
  return `PSA ${formatPsaGrade(range.low)}–${formatPsaGrade(range.high)}`;
}

function formatPsaGrade(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function psaRangeFromGrade(
  grade: number,
  opts: { knockout: boolean; highScores?: boolean }
): PsaRange {
  const g = normalizeScore(grade);
  let low = snapPsaDown(g);
  let high = snapPsaUp(g);

  if (opts.knockout) {
    high = Math.min(high, 4);
    if (high < 2) high = low <= 1 ? 1.5 : 2;
    if (low > high) low = high === 1.5 ? 1 : Math.max(1, high - 1);
    if (low === high && high >= 2) low = Math.max(1, high - 1);
    return { low, high };
  }

  if (low === high) {
    if (g >= 9.5 || opts.highScores) {
      high = Math.min(10, low + 1);
    } else if (g >= 8) {
      low = Math.max(7, low - 1);
    }
  }
  return { low, high };
}

function activeDefects(data: CategoryDetails, disputes: DefectDispute[]): string[] {
  const hidden = new Set(disputes.filter((d) => d.verdict === 'not-damage').map((d) => d.defect));
  return (data.defects || []).filter((d) => !hidden.has(d));
}

function defectConfidence(original: string, data: CategoryDetails): number {
  const hit = (data.detections || []).find(
    (d) => d.label === original || original.startsWith(d.label) || original.includes(d.label)
  );
  if (hit?.confidence != null) return hit.confidence;
  const m = original.match(/\((\d+)%\)\s*$/);
  if (m) return Number(m[1]) / 100;
  return 0.88;
}

function collectImpacts(result: GradingResult, disputes: DefectDispute[]): ImpactRow[] {
  const rows: ImpactRow[] = [];
  for (const key of CATEGORY_KEYS) {
    const data = categoryFromResult(result, key);
    if (data.withheld || (key === 'surface' && result.surfaceRefused)) {
      continue;
    }
    const defects = activeDefects(data, disputes);
    if (defects.length === 0) {
      if (key === 'centering' && data.score != null && normalizeScore(data.score) >= 8.5) {
        rows.push({
          level: 'minimal',
          text: 'Centering is fine and does not matter here',
          original: '',
          category: key,
          knockout: false,
        });
      }
      continue;
    }
    for (const original of defects) {
      const lower = original.toLowerCase();
      const conf = defectConfidence(original, data);
      if (conf < 0.65) continue;
      const knockout = isKnockoutText(original) && conf >= 0.85;
      let level: ImpactLevel = 'moderate';
      if (knockout) level = 'severe';
      else if (HEAVY_WEAR_RE.test(lower) && conf >= 0.8) level = 'high';
      else if (WEAR_RE.test(lower)) level = 'moderate';
      rows.push({
        level,
        text: humanizeDefect(original),
        original,
        category: key,
        knockout,
      });
    }
  }
  rows.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.text.localeCompare(b.text));
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.original || row.text;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function marketplaceFromDefects(
  result: GradingResult,
  impacts: ImpactRow[]
): MarketplaceCondition {
  if (impacts.some((i) => i.knockout && i.level === 'severe')) return 'damaged';
  const grade = normalizeScore(result.grade);
  const heavy = impacts.some((i) => i.level === 'high' || i.level === 'severe');
  if (heavy && grade < 8) return 'heavily-played';
  if (grade < 3) return 'damaged';
  if (grade < 5) return 'heavily-played';
  if (grade < 7) return 'moderately-played';
  if (grade < 9) return 'lightly-played';
  return 'near-mint';
}

function hasBackPhoto(result: GradingResult): boolean {
  return Boolean(result.backImageUrl || result.back);
}

function psaEstimateGate(result: GradingResult): { allowed: boolean; reason: string | null } {
  if (result.retakeRecommended || result.quality?.ok === false) {
    return {
      allowed: false,
      reason:
        'Photo quality is too low for a PSA estimate. Retake on a dark mat, unsleeved, with even light.',
    };
  }
  if ((result.confidence ?? 1) < 0.5) {
    return {
      allowed: false,
      reason:
        'Photo quality is too low for a PSA estimate. Retake with sharper focus and less glare.',
    };
  }
  if (!hasBackPhoto(result)) {
    return {
      allowed: false,
      reason: 'No back photo — listing condition only. A PSA estimate needs both sides.',
    };
  }
  return { allowed: true, reason: null };
}

function highCategoryScores(result: GradingResult): boolean {
  return CATEGORY_KEYS.every((key) => {
    const data = categoryFromResult(result, key);
    if (data.withheld || data.score == null) return false;
    return normalizeScore(data.score) >= 9;
  });
}

function hypotheticalGradeWithoutKnockouts(
  result: GradingResult,
  impacts: ImpactRow[]
): number | null {
  const knockoutCats = new Set(impacts.filter((i) => i.knockout).map((i) => i.category));
  if (knockoutCats.size === 0) return null;
  const remaining = CATEGORY_KEYS.filter((k) => !knockoutCats.has(k))
    .map((k) => {
      const data = categoryFromResult(result, k);
      if (data.withheld || data.score == null) return null;
      return normalizeScore(data.score);
    })
    .filter((n): n is number => n != null);
  if (remaining.length === 0) return null;
  return Math.min(...remaining);
}

function ownerDistribution(grade: number, knockout: boolean): PsaMass[] {
  if (knockout || grade < 7) return [];
  const g = normalizeScore(grade);
  if (g >= 9.5) {
    return [
      { grade: 9, pct: 38 },
      { grade: 10, pct: 48 },
      { grade: 8, pct: 14 },
    ];
  }
  if (g >= 9) {
    return [
      { grade: 8, pct: 22 },
      { grade: 9, pct: 52 },
      { grade: 10, pct: 18 },
      { grade: 7, pct: 8 },
    ];
  }
  if (g >= 8) {
    return [
      { grade: 7, pct: 18 },
      { grade: 8, pct: 54 },
      { grade: 9, pct: 22 },
      { grade: 10, pct: 6 },
    ];
  }
  return [
    { grade: 6, pct: 20 },
    { grade: 7, pct: 55 },
    { grade: 8, pct: 25 },
  ];
}

function expectedFromMass(
  mass: PsaMass[],
  psa: GradeMarket['psa'],
  raw: number | null
): number | null {
  let acc = 0;
  let weight = 0;
  for (const row of mass) {
    const key = row.grade as 8 | 9 | 10;
    const price = key === 8 || key === 9 || key === 10 ? psa[key] : null;
    if (price != null && price > 0) {
      acc += price * (row.pct / 100);
      weight += row.pct / 100;
    }
  }
  if (weight < 0.4) return null;
  if (raw != null && acc / weight < raw * 0.5) {
    // incomplete curve; don't invent a slab value below junk-raw
  }
  return acc / weight;
}

function buildEconomics(
  result: GradingResult,
  knockout: boolean,
  psaRange: PsaRange | null,
  market: GradeMarket | null | undefined
): GradeEconomics | null {
  const psa8 = market?.psa[8] ?? null;
  const psa9 = market?.psa[9] ?? null;
  const psa10 = market?.psa[10] ?? null;
  const raw = market?.raw ?? null;
  const declared = psa10 || psa9 || psa8 || raw || 100;
  const { fee, tier } = estimatePsaGradingFee(declared);
  const spread9to10 = psa9 != null && psa10 != null && psa10 > 0 && psa9 > 0 ? psa10 - psa9 : null;
  const highStakes =
    (spread9to10 != null && spread9to10 >= 400) ||
    (psa10 != null && raw != null && psa10 - raw >= 500);

  const mass =
    psaRange && psaRange.low >= 8 && !knockout ? ownerDistribution(result.grade, knockout) : null;
  const expectedSlab = mass && market ? expectedFromMass(mass, market.psa, raw) : null;
  const expectedUpside = expectedSlab != null && raw != null ? expectedSlab - raw - fee : null;

  return {
    fee,
    feeTier: tier,
    raw,
    psa8,
    psa9,
    psa10,
    spread9to10,
    highStakes,
    expectedSlab,
    expectedUpside,
    distribution: mass && mass.length > 0 ? mass : null,
  };
}

function recommend(input: {
  identified: boolean;
  knockout: boolean;
  marketplace: MarketplaceCondition;
  psaRange: PsaRange | null;
  psaEstimateAllowed: boolean;
  economics: GradeEconomics | null;
}): { recommendation: Recommendation; title: string; body: string } {
  const { identified, knockout, marketplace, psaRange, psaEstimateAllowed, economics } = input;
  const listLike = marketplace === 'damaged' || marketplace === 'heavily-played';
  const fee = economics?.fee ?? PSA_REGULAR_FLOOR;

  if (knockout || (psaRange && psaRange.high < 7) || (!psaEstimateAllowed && listLike)) {
    const title = listLike ? `List as ${MARKETPLACE_LABEL[marketplace]}` : 'Keep this raw';
    return {
      recommendation: listLike ? 'list' : 'keep-raw',
      title: `Do not submit · ${title}`,
      body: `PSA ${economics?.feeTier ?? 'Regular'} is about ${formatUsd(fee)}. This copy cannot reach the grades where a slab usually pays.`,
    };
  }

  if (!identified) {
    return {
      recommendation: 'identify',
      title: 'Identify this card',
      body: 'Condition is in a range where grading can matter. Match the catalog card to see live PSA comps against the fee.',
    };
  }

  if (!psaEstimateAllowed) {
    return {
      recommendation: listLike ? 'list' : 'keep-raw',
      title: listLike ? `List as ${MARKETPLACE_LABEL[marketplace]}` : 'Keep this raw',
      body: 'Fix the photos before treating this as a PSA submission candidate.',
    };
  }

  const upside = economics?.expectedUpside;
  if (upside != null && upside >= 80) {
    return {
      recommendation: 'submit',
      title: 'Worth submitting',
      body: `Expected slab value after the ${formatUsd(fee)} ${economics?.feeTier} fee looks positive versus selling raw now.`,
    };
  }
  if (upside != null && upside >= 0) {
    return {
      recommendation: 'consider',
      title: 'Worth considering',
      body: 'The spread is modest after fees. Confirm surface in the photos before you spend the wait.',
    };
  }
  if (upside != null) {
    return {
      recommendation: 'keep-raw',
      title: 'Keep this raw',
      body: `After a ${formatUsd(fee)} fee, expected graded value does not beat selling this copy raw.`,
    };
  }

  if (psaRange && psaRange.low >= 9 && economics?.psa10) {
    return {
      recommendation: 'consider',
      title: 'Worth considering',
      body: 'Condition looks strong enough that the PSA 10 spread may matter. Check the comps below.',
    };
  }

  if (psaRange && psaRange.high >= 8 && !economics?.psa8 && !economics?.psa9 && !economics?.psa10) {
    return {
      recommendation: 'consider',
      title: 'Condition is in range — comps missing',
      body: 'We could not load live PSA prices for this card. Do not submit until you check current 8/9/10 comps against the fee.',
    };
  }

  return {
    recommendation: 'keep-raw',
    title: 'Keep this raw',
    body: 'Professional grading is unlikely to add value on this copy.',
  };
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

export function buildSellerCopy(decision: GradeDecision): string {
  const lines = [
    `${decision.displayName} — ${decision.marketplaceLabel} (${decision.marketplaceAbbr})`,
    '',
    'Detected:',
  ];
  const defects = decision.impacts.filter((i) => i.level !== 'minimal').slice(0, 5);
  if (defects.length === 0) {
    lines.push('• No major issues flagged in photos');
  } else {
    for (const row of defects) {
      lines.push(`• ${row.text}`);
    }
  }
  lines.push('');
  lines.push(
    'Seller notes based on photos — not a professional grade. PSA, BGS, and CGC can differ.'
  );
  return lines.join('\n');
}

export function buildGradeDecision(
  result: GradingResult,
  options?: {
    identified?: boolean;
    market?: GradeMarket | null;
    disputes?: DefectDispute[];
  }
): GradeDecision {
  const disputes = options?.disputes ?? [];
  const identified = options?.identified ?? !isUnidentifiedCard(result.cardName);
  const displayName = displayCardName(result.cardName);
  const userAdjusted = disputes.some((d) => d.verdict === 'not-damage');
  const impacts = collectImpacts(result, disputes);
  const knockoutRow = impacts.find((i) => i.knockout);
  const knockout = Boolean(knockoutRow);
  const marketplace = marketplaceFromDefects(result, impacts);
  const surfaceUnknown = Boolean(result.surfaceRefused || result.surfaceRetakeRecommended);
  const gate = psaEstimateGate(result);
  const backendRange = result.psaRange;
  let psaRange = gate.allowed
    ? backendRange
      ? knockout
        ? {
            low: Math.min(backendRange.low, 4),
            high: Math.min(Math.max(backendRange.high, backendRange.low), 4),
          }
        : backendRange
      : psaRangeFromGrade(result.grade, {
          knockout,
          highScores: highCategoryScores(result),
        })
    : null;
  if (psaRange && surfaceUnknown && !knockout) {
    psaRange = {
      low: Math.max(1, psaRange.low - 1),
      high: Math.min(10, psaRange.high + 1),
    };
  }
  const band = confidenceBand(result.confidence, result.retakeRecommended || surfaceUnknown);
  const economics = buildEconomics(result, knockout, psaRange, options?.market);
  const rec = recommend({
    identified,
    knockout,
    marketplace,
    psaRange,
    psaEstimateAllowed: gate.allowed,
    economics,
  });

  const limiter = rankedCategories(result)[0];
  const why = knockoutRow
    ? `${knockoutRow.text} is why this copy cannot grade higher.`
    : limiter
      ? `${limiter.label} is the weakest category.`
      : 'No major issues detected.';

  const hypo = hypotheticalGradeWithoutKnockouts(result, impacts);
  const counterfactual =
    knockout && hypo != null
      ? `Without the ${knockoutRow?.text.toLowerCase() ?? 'knockout defect'}, other wear would still likely cap this around ${formatPsaRange(psaRangeFromGrade(hypo, { knockout: false }))}.`
      : null;

  let confidenceReason: string;
  if (result.retakeRecommended) {
    confidenceReason = 'Low confidence — retake before using this for a listing or a submission.';
  } else if (surfaceUnknown) {
    confidenceReason =
      result.quality?.surfaceMessage ||
      'Surface is unknown from this photo (glare, sleeve, or lighting). Retake surface photos to narrow the estimate.';
  } else if (!hasBackPhoto(result)) {
    confidenceReason = 'Moderate confidence. Front only; surface on the back is unknown.';
  } else if (band === 'moderate') {
    confidenceReason =
      'Moderate confidence. Surface findings may include glare, print texture, or holofoil.';
  } else {
    confidenceReason = 'High confidence in the photos — still an estimate, not a PSA grade.';
  }

  const decision: GradeDecision = {
    identified,
    displayName,
    marketplace,
    marketplaceLabel: MARKETPLACE_LABEL[marketplace],
    marketplaceAbbr: MARKETPLACE_ABBR[marketplace],
    psaRange,
    psaRangeLabel: psaRange ? formatPsaRange(psaRange) : null,
    psaEstimateAllowed: gate.allowed,
    refuseReason: gate.reason,
    knockout,
    knockoutReason: knockoutRow?.text ?? null,
    recommendation: rec.recommendation,
    recommendationTitle: rec.title,
    recommendationBody: rec.body,
    why,
    counterfactual,
    impacts,
    confidence: band,
    confidenceReason,
    userAdjusted,
    sellerCopy: '',
    economics,
    showDistribution: Boolean(
      economics?.highStakes &&
        economics.distribution &&
        gate.allowed &&
        psaRange &&
        psaRange.low >= 8
    ),
    surfaceUnknown,
    modelPsaRangeLabel: psaRange ? formatPsaRange(psaRange) : null,
  };
  decision.sellerCopy = buildSellerCopy(decision);
  return decision;
}

export function vaultConditionFromDecision(decision: GradeDecision): CardCondition {
  return decision.marketplace;
}

export function marketFromPrices(
  raw: number | null | undefined,
  prices?: Array<{ grader: string; grade: string; price: number | null }> | null
): GradeMarket {
  const find = (g: string): number | null => {
    const hit = prices?.find(
      (p) => p.grader.toLowerCase() === 'psa' && p.grade === g && p.price != null && p.price > 0
    );
    return hit?.price ?? null;
  };
  return {
    raw: raw != null && raw > 0 ? raw : null,
    psa: { 8: find('8'), 9: find('9'), 10: find('10') },
  };
}

export function disputeDefect(
  existing: DefectDispute[],
  defect: string,
  verdict: DisputeVerdict,
  reason?: DisputeReason
): DefectDispute[] {
  const rest = existing.filter((d) => d.defect !== defect);
  return [...rest, { defect, verdict, reason }];
}
