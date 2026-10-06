/**
 * Pure money-flow aggregation (no DB). Used by moneyFlowService + unit tests.
 */

import {
  MONEY_FLOW_ERA_LABELS,
  MONEY_FLOW_ERAS,
  MONEY_FLOW_FINISH_LABELS,
  MONEY_FLOW_FINISHES,
  MONEY_FLOW_SPECIALS,
  aggregateCohortReturns,
  classifyRotation,
  cohortKey,
  labelForCohort,
  median,
  round2,
  storyForCohort,
  type MoneyFlowBreadthBucket,
  type MoneyFlowCohort,
  type MoneyFlowEra,
  type MoneyFlowExemplar,
  type MoneyFlowFinish,
  type MoneyFlowInsight,
  type MoneyFlowMarketSummary,
  type MoneyFlowMoverRow,
  type MoneyFlowResponse,
  type MoneyFlowSpecial,
} from '@tcgtracker/shared';

export type TaggedMover = {
  changePercent: number;
  currentPrice: number;
  previousPrice: number;
  dollarMove: number;
  era: MoneyFlowEra;
  finish: MoneyFlowFinish;
  specials: MoneyFlowSpecial[];
  exemplar: MoneyFlowExemplar;
};

function dataNoteFor(sampleSize: number, confidence: MoneyFlowCohort['confidence']): string | null {
  if (sampleSize === 0) return 'No chase prints in this group.';
  if (confidence === 'thin') return `Only ${sampleSize} prints — hint, not a call.`;
  if (confidence === 'low') return `${sampleSize} prints — small sample.`;
  return null;
}

function pickExemplars(
  members: TaggedMover[],
  rotation: MoneyFlowCohort['rotation']
): MoneyFlowExemplar[] {
  const sorted = [...members].sort((a, b) => {
    if (rotation === 'out') return a.changePercent - b.changePercent;
    // Prefer higher dollar impact among strong movers
    const aScore = Math.abs(a.changePercent) * Math.sqrt(Math.max(a.currentPrice, 1));
    const bScore = Math.abs(b.changePercent) * Math.sqrt(Math.max(b.currentPrice, 1));
    return bScore - aScore;
  });
  const seen = new Set<string>();
  const out: MoneyFlowExemplar[] = [];
  for (const m of sorted) {
    const key = m.exemplar.cardId || m.exemplar.productName;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m.exemplar);
    if (out.length >= 3) break;
  }
  return out;
}

function buildCohort(
  kind: MoneyFlowCohort['kind'],
  key: string,
  members: TaggedMover[],
  totalGainers: number,
  totalLosers: number,
  extras: Partial<Pick<MoneyFlowCohort, 'era' | 'finish' | 'special'>> = {}
): MoneyFlowCohort {
  const returns = members.map((m) => m.changePercent);
  const dollars = members.map((m) => m.dollarMove);
  const stats = aggregateCohortReturns(returns, dollars);
  const upMembers = members.filter((m) => m.changePercent > 0).length;
  const downMembers = members.filter((m) => m.changePercent < 0).length;
  const shareOfGainers = totalGainers > 0 ? round2(upMembers / totalGainers) : 0;
  const shareOfLosers = totalLosers > 0 ? round2(downMembers / totalLosers) : 0;
  const rotation = classifyRotation({
    shareOfGainers,
    shareOfLosers,
    medianReturnPct: stats.medianReturnPct,
    sampleSize: stats.sampleSize,
    confidence: stats.confidence,
    breadthUpPct: stats.breadthUpPct,
  });
  const exemplars = pickExemplars(members, rotation);
  const label = labelForCohort(kind, key);

  return {
    id: cohortKey(kind, key),
    kind,
    key,
    label,
    ...extras,
    sampleSize: stats.sampleSize,
    medianReturnPct: stats.medianReturnPct,
    trimmedMeanReturnPct: stats.trimmedMeanReturnPct,
    breadthUpPct: stats.breadthUpPct,
    upCount: stats.upCount,
    downCount: stats.downCount,
    confidence: stats.confidence,
    shareOfGainers,
    shareOfLosers,
    netDollarMove: stats.netDollarMove,
    rotation,
    story: storyForCohort({
      label,
      rotation,
      medianReturnPct: stats.medianReturnPct,
      breadthUpPct: stats.breadthUpPct,
      sampleSize: stats.sampleSize,
      confidence: stats.confidence,
      exemplarName: exemplars[0]?.productName ?? null,
    }),
    dataNote: dataNoteFor(stats.sampleSize, stats.confidence),
    exemplars,
  };
}

function buildHeadline(
  days: number,
  date: string | null,
  into: MoneyFlowCohort[],
  out: MoneyFlowCohort[],
  rawSampleSize: number,
  slabSampleSize: number,
  filteredOutCount: number
): MoneyFlowResponse['headline'] {
  const intoLabels = into.slice(0, 3).map((c) => c.label);
  const outLabels = out.slice(0, 3).map((c) => c.label);

  let summary: string;
  if (rawSampleSize + slabSampleSize === 0) {
    summary = 'No chase movers this window.';
  } else if (intoLabels.length === 0 && outLabels.length === 0) {
    summary = 'No clear rotation.';
  } else if (intoLabels.length && outLabels.length) {
    summary = `${intoLabels[0]} up · ${outLabels[0]} down`;
  } else if (intoLabels.length) {
    summary = `Into ${intoLabels.join(', ')}`;
  } else {
    summary = `Out of ${outLabels.join(', ')}`;
  }

  return {
    summary,
    intoLabels,
    outLabels,
    windowDays: days,
    asOfDate: date,
    rawSampleSize,
    slabSampleSize,
    filteredOutCount,
  };
}

/**
 * Prefer specific era×finish and specials over redundant parent eras on the board.
 * Caps at 3 per side so the story stays scannable.
 */
function pickRotationBoard(
  eras: MoneyFlowCohort[],
  eraFinishes: MoneyFlowCohort[],
  specials: MoneyFlowCohort[],
  side: 'into' | 'out'
): MoneyFlowCohort[] {
  const want = side;
  const scored = [...eraFinishes, ...specials, ...eras]
    .filter((c) => c.sampleSize > 0 && c.rotation === want)
    .sort((a, b) => {
      const med = (c: MoneyFlowCohort) => c.medianReturnPct ?? 0;
      if (side === 'into') return med(b) - med(a) || b.shareOfGainers - a.shareOfGainers;
      return med(a) - med(b) || b.shareOfLosers - a.shareOfLosers;
    });

  const picked: MoneyFlowCohort[] = [];
  const coveredEras = new Set<string>();

  for (const c of scored) {
    if (picked.length >= 3) break;
    if (c.kind === 'era') {
      // Skip parent era if we already have an era×finish for it
      if (coveredEras.has(c.key)) continue;
    }
    if (c.kind === 'era_finish' && c.era) {
      coveredEras.add(c.era);
    }
    // Avoid near-duplicate labels
    if (picked.some((p) => p.label === c.label)) continue;
    picked.push(c);
  }

  // Fallback when nothing clears rotation: strongest leaning era×finish
  if (picked.length === 0) {
    const leaners = [...eraFinishes]
      .filter((c) => c.sampleSize >= 5 && c.medianReturnPct != null)
      .filter((c) =>
        side === 'into'
          ? (c.medianReturnPct as number) >= 1.5
          : (c.medianReturnPct as number) <= -1.5
      )
      .sort((a, b) =>
        side === 'into'
          ? (b.medianReturnPct ?? 0) - (a.medianReturnPct ?? 0)
          : (a.medianReturnPct ?? 0) - (b.medianReturnPct ?? 0)
      )
      .slice(0, 2)
      .map((c) => ({
        ...c,
        rotation: side,
        story: storyForCohort({
          label: c.label,
          rotation: side,
          medianReturnPct: c.medianReturnPct,
          breadthUpPct: c.breadthUpPct,
          sampleSize: c.sampleSize,
          confidence: c.confidence,
          exemplarName: c.exemplars[0]?.productName ?? null,
        }),
      }));
    return leaners;
  }

  return picked;
}

/** Build full money-flow response from pre-tagged movers (no DB). */
export function buildMoneyFlowFromTagged(
  days: number,
  tagged: TaggedMover[],
  date: string | null = null,
  filteredOutCount = 0
): MoneyFlowResponse {
  const totalGainers = tagged.filter((m) => m.changePercent > 0).length;
  const totalLosers = tagged.filter((m) => m.changePercent < 0).length;

  const eras = MONEY_FLOW_ERAS.map((era) =>
    buildCohort(
      'era',
      era,
      tagged.filter((m) => m.era === era),
      totalGainers,
      totalLosers,
      { era }
    )
  );

  const finishes = MONEY_FLOW_FINISHES.map((finish) =>
    buildCohort(
      'finish',
      finish,
      tagged.filter((m) => m.finish === finish),
      totalGainers,
      totalLosers,
      { finish }
    )
  );

  const eraFinishes: MoneyFlowCohort[] = [];
  for (const era of MONEY_FLOW_ERAS) {
    for (const finish of MONEY_FLOW_FINISHES) {
      eraFinishes.push(
        buildCohort(
          'era_finish',
          `${era}|${finish}`,
          tagged.filter((m) => m.era === era && m.finish === finish),
          totalGainers,
          totalLosers,
          { era, finish }
        )
      );
    }
  }

  const specials = MONEY_FLOW_SPECIALS.map((special) =>
    buildCohort(
      'special',
      special,
      tagged.filter((m) => m.specials.includes(special)),
      totalGainers,
      totalLosers,
      { special }
    )
  );

  const rotationInto = pickRotationBoard(eras, eraFinishes, specials, 'into');
  const rotationOut = pickRotationBoard(eras, eraFinishes, specials, 'out');

  const rawSampleSize = tagged.filter((m) => m.finish === 'raw').length;
  const slabSampleSize = tagged.filter((m) => m.finish === 'psa10').length;

  const summary = buildMarketSummary(tagged, rotationInto, rotationOut);
  const breadthBuckets = buildBreadthBuckets(tagged);
  const insights = buildInsights({
    rotationInto,
    rotationOut,
    eras,
    finishes,
    specials,
    eraFinishes,
    summary,
  });
  const mostActive = pickMostActive([...eraFinishes, ...specials, ...eras], 6);
  const { topGainers, topLosers } = pickIndividualMovers(tagged, 12);

  return {
    days,
    date,
    generatedAt: new Date().toISOString(),
    headline: buildHeadline(
      days,
      date,
      rotationInto,
      rotationOut,
      rawSampleSize,
      slabSampleSize,
      filteredOutCount
    ),
    summary,
    breadthBuckets,
    insights,
    eras,
    finishes,
    eraFinishes,
    specials,
    rotationInto,
    rotationOut,
    mostActive,
    topGainers,
    topLosers,
  };
}

function segmentLabelFor(m: TaggedMover): string {
  return `${MONEY_FLOW_ERA_LABELS[m.era]} · ${MONEY_FLOW_FINISH_LABELS[m.finish]}`;
}

function buildMarketSummary(
  tagged: TaggedMover[],
  into: MoneyFlowCohort[],
  out: MoneyFlowCohort[]
): MoneyFlowMarketSummary {
  const risingCount = tagged.filter((m) => m.changePercent > 0).length;
  const fallingCount = tagged.filter((m) => m.changePercent < 0).length;
  const flatCount = tagged.length - risingCount - fallingCount;
  const intoWeight = into.reduce((s, c) => s + Math.abs(c.medianReturnPct ?? 0), 0);
  const outWeight = out.reduce((s, c) => s + Math.abs(c.medianReturnPct ?? 0), 0);
  const total = intoWeight + outWeight;
  const chasedSharePct = total > 0 ? round2((intoWeight / total) * 100) : risingCount > 0 ? 50 : 0;
  const cooledSharePct = total > 0 ? round2(100 - chasedSharePct) : fallingCount > 0 ? 50 : 0;

  const scored = [...into, ...out].filter((c) => c.sampleSize > 0 && c.medianReturnPct != null);
  const strongest = [...scored].sort((a, b) => (b.medianReturnPct ?? 0) - (a.medianReturnPct ?? 0))[0];
  const weakest = [...scored].sort((a, b) => (a.medianReturnPct ?? 0) - (b.medianReturnPct ?? 0))[0];

  return {
    chasedSharePct,
    cooledSharePct,
    medianMovePct: median(tagged.map((m) => m.changePercent)),
    risingCount,
    fallingCount,
    flatCount,
    trackedCount: tagged.length,
    strongestLabel: strongest?.label ?? null,
    strongestMovePct: strongest?.medianReturnPct ?? null,
    weakestLabel: weakest?.label ?? null,
    weakestMovePct: weakest?.medianReturnPct ?? null,
  };
}

const BREADTH_SPECS: Array<{
  key: string;
  label: string;
  minPct: number | null;
  maxPct: number | null;
}> = [
  { key: 'lt_n10', label: '<−10%', minPct: null, maxPct: -10 },
  { key: 'n10_n5', label: '−10–5%', minPct: -10, maxPct: -5 },
  { key: 'n5_0', label: '−5–0%', minPct: -5, maxPct: 0 },
  { key: '0_5', label: '0–5%', minPct: 0, maxPct: 5 },
  { key: '5_10', label: '5–10%', minPct: 5, maxPct: 10 },
  { key: 'gt_10', label: '10%+', minPct: 10, maxPct: null },
];

function buildBreadthBuckets(tagged: TaggedMover[]): MoneyFlowBreadthBucket[] {
  const n = tagged.length || 1;
  return BREADTH_SPECS.map((spec) => {
    const count = tagged.filter((m) => {
      const v = m.changePercent;
      const geMin = spec.minPct == null || v >= spec.minPct;
      const ltMax = spec.maxPct == null || v < spec.maxPct;
      return geMin && ltMax;
    }).length;
    return {
      key: spec.key,
      label: spec.label,
      minPct: spec.minPct,
      maxPct: spec.maxPct,
      count,
      sharePct: round2((count / n) * 100),
    };
  });
}

function pickMostActive(cohorts: MoneyFlowCohort[], limit: number): MoneyFlowCohort[] {
  return [...cohorts]
    .filter((c) => c.sampleSize > 0 && c.medianReturnPct != null)
    .sort((a, b) => {
      const score = (c: MoneyFlowCohort) =>
        Math.abs(c.medianReturnPct ?? 0) * Math.sqrt(c.sampleSize) + Math.abs(c.netDollarMove) / 500;
      return score(b) - score(a);
    })
    .slice(0, limit);
}

function pickIndividualMovers(
  tagged: TaggedMover[],
  limit: number
): { topGainers: MoneyFlowMoverRow[]; topLosers: MoneyFlowMoverRow[] } {
  const toRow = (m: TaggedMover, idx: number): MoneyFlowMoverRow => ({
    id: `${m.exemplar.cardId || m.exemplar.productName}-${m.finish}-${idx}`,
    productName: m.exemplar.productName,
    changePercent: m.changePercent,
    currentPrice: m.currentPrice,
    previousPrice: m.previousPrice,
    absDollarMove: Math.abs(m.dollarMove),
    imageSmall: m.exemplar.imageSmall,
    cardId: m.exemplar.cardId,
    setName: m.exemplar.setName,
    finish: m.finish,
    era: m.era,
    segmentLabel: segmentLabelFor(m),
  });

  const byAbsDollar = [...tagged].sort((a, b) => Math.abs(b.dollarMove) - Math.abs(a.dollarMove));
  const gainers = byAbsDollar
    .filter((m) => m.changePercent > 0)
    .slice(0, limit)
    .map(toRow);
  const losers = byAbsDollar
    .filter((m) => m.changePercent < 0)
    .slice(0, limit)
    .map(toRow);
  return { topGainers: gainers, topLosers: losers };
}

function buildInsights(input: {
  rotationInto: MoneyFlowCohort[];
  rotationOut: MoneyFlowCohort[];
  eras: MoneyFlowCohort[];
  finishes: MoneyFlowCohort[];
  specials: MoneyFlowCohort[];
  eraFinishes: MoneyFlowCohort[];
  summary: MoneyFlowMarketSummary;
}): MoneyFlowInsight[] {
  const out: MoneyFlowInsight[] = [];
  const { rotationInto, rotationOut, finishes, specials, eraFinishes, summary } = input;

  if (rotationInto[0] && rotationOut[0]) {
    out.push({
      id: 'rotation',
      text: `${rotationInto[0].label} leads money in (${formatSigned(rotationInto[0].medianReturnPct)}); ${rotationOut[0].label} leads money out (${formatSigned(rotationOut[0].medianReturnPct)}).`,
    });
  } else if (rotationInto[0]) {
    out.push({
      id: 'rotation-in',
      text: `Capital concentrates into ${rotationInto[0].label} at ${formatSigned(rotationInto[0].medianReturnPct)}.`,
    });
  } else if (rotationOut[0]) {
    out.push({
      id: 'rotation-out',
      text: `Cooling concentrates in ${rotationOut[0].label} at ${formatSigned(rotationOut[0].medianReturnPct)}.`,
    });
  }

  const breadthLeader = [...specials, ...eraFinishes]
    .filter((c) => c.sampleSize >= 5 && c.breadthUpPct != null)
    .sort((a, b) => (b.breadthUpPct ?? 0) - (a.breadthUpPct ?? 0))[0];
  if (breadthLeader) {
    out.push({
      id: 'breadth',
      text: `${breadthLeader.label} has the strongest breadth — ${Math.round(breadthLeader.breadthUpPct ?? 0)}% of prints rising (n=${breadthLeader.sampleSize}).`,
    });
  }

  const raw = finishes.find((c) => c.key === 'raw');
  const psa = finishes.find((c) => c.key === 'psa10');
  if (raw?.medianReturnPct != null && psa?.medianReturnPct != null) {
    const spread = round2(psa.medianReturnPct - raw.medianReturnPct);
    out.push({
      id: 'spread',
      text:
        spread >= 0
          ? `PSA 10 leads raw by ${formatSigned(spread)} (PSA 10 ${formatSigned(psa.medianReturnPct)} vs raw ${formatSigned(raw.medianReturnPct)}).`
          : `Raw leads PSA 10 by ${formatSigned(-spread)} (raw ${formatSigned(raw.medianReturnPct)} vs PSA 10 ${formatSigned(psa.medianReturnPct)}).`,
    });
  }

  if (summary.trackedCount > 0 && summary.medianMovePct != null) {
    out.push({
      id: 'tape',
      text: `Tape: ${summary.risingCount} rising / ${summary.fallingCount} falling · median ${formatSigned(summary.medianMovePct)} across ${summary.trackedCount} chase prints.`,
    });
  }

  return out.slice(0, 4);
}

function formatSigned(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}
