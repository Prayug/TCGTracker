/**
 * Pure money-flow aggregation (no DB). Used by moneyFlowService + unit tests.
 */

import {
  MONEY_FLOW_ERAS,
  MONEY_FLOW_FINISHES,
  MONEY_FLOW_SPECIALS,
  aggregateCohortReturns,
  classifyRotation,
  cohortKey,
  labelForCohort,
  round2,
  storyForCohort,
  type MoneyFlowCohort,
  type MoneyFlowEra,
  type MoneyFlowExemplar,
  type MoneyFlowFinish,
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
  if (sampleSize === 0) return 'No chase-worthy movers in this cohort for the window.';
  if (confidence === 'thin') {
    return `Only ${sampleSize} prints — treat as a hint.`;
  }
  if (confidence === 'low') {
    return `Small sample (${sampleSize}) — direction may shift.`;
  }
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
    summary =
      'Not enough chase-worthy price moves this window — try 30d, or wait for more graded/raw history.';
  } else if (intoLabels.length === 0 && outLabels.length === 0) {
    summary = 'No clear rotation yet — cohorts are mixed across eras and finishes.';
  } else if (intoLabels.length && outLabels.length) {
    summary = `Collectors are chasing ${intoLabels[0]} while ${outLabels[0]} cools.`;
  } else if (intoLabels.length) {
    summary = `Collectors are leaning into ${intoLabels.join(', ')}.`;
  } else {
    summary = `${outLabels.join(', ')} ${outLabels.length === 1 ? 'is' : 'are'} cooling off.`;
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
    eras,
    finishes,
    eraFinishes,
    specials,
    rotationInto,
    rotationOut,
  };
}
