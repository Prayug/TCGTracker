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
  if (sampleSize === 0) return 'No qualified movers in this cohort for the window.';
  if (confidence === 'thin') {
    return `Thin sample (${sampleSize}) — treat direction as tentative.`;
  }
  if (confidence === 'low') {
    return `Small sample (${sampleSize}) — direction may shift as more prints move.`;
  }
  return null;
}

function pickExemplars(
  members: TaggedMover[],
  rotation: MoneyFlowCohort['rotation']
): MoneyFlowExemplar[] {
  const sorted = [...members].sort((a, b) => {
    if (rotation === 'out') return a.changePercent - b.changePercent;
    return Math.abs(b.changePercent) - Math.abs(a.changePercent);
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
  });

  return {
    id: cohortKey(kind, key),
    kind,
    key,
    label: labelForCohort(kind, key),
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
    dataNote: dataNoteFor(stats.sampleSize, stats.confidence),
    exemplars: pickExemplars(members, rotation),
  };
}

function buildHeadline(
  days: number,
  date: string | null,
  into: MoneyFlowCohort[],
  out: MoneyFlowCohort[],
  rawSampleSize: number,
  slabSampleSize: number
): MoneyFlowResponse['headline'] {
  const intoLabels = into.slice(0, 3).map((c) => c.label);
  const outLabels = out.slice(0, 3).map((c) => c.label);

  let summary: string;
  if (rawSampleSize + slabSampleSize === 0) {
    summary = 'Not enough qualified price history in this window to map capital rotation yet.';
  } else if (intoLabels.length === 0 && outLabels.length === 0) {
    summary = 'No clear rotation — cohorts are mixed or samples are too thin to call a flow.';
  } else if (intoLabels.length && outLabels.length) {
    summary = `${intoLabels[0]} is drawing bids while ${outLabels[0]} cools — capital rotating across the hobby.`;
  } else if (intoLabels.length) {
    summary = `Capital leaning into ${intoLabels.join(', ')}.`;
  } else {
    summary = `Capital leaking from ${outLabels.join(', ')}.`;
  }

  return {
    summary,
    intoLabels,
    outLabels,
    windowDays: days,
    asOfDate: date,
    rawSampleSize,
    slabSampleSize,
  };
}

/** Build full money-flow response from pre-tagged movers (no DB). */
export function buildMoneyFlowFromTagged(
  days: number,
  tagged: TaggedMover[],
  date: string | null = null
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

  const boardPool = [...eras, ...eraFinishes, ...specials].filter((c) => c.sampleSize > 0);
  const rotationInto = boardPool
    .filter((c) => c.rotation === 'into')
    .sort(
      (a, b) =>
        (b.medianReturnPct ?? 0) - (a.medianReturnPct ?? 0) || b.shareOfGainers - a.shareOfGainers
    )
    .slice(0, 6);
  const rotationOut = boardPool
    .filter((c) => c.rotation === 'out')
    .sort(
      (a, b) =>
        (a.medianReturnPct ?? 0) - (b.medianReturnPct ?? 0) || b.shareOfLosers - a.shareOfLosers
    )
    .slice(0, 6);

  const rawSampleSize = tagged.filter((m) => m.finish === 'raw').length;
  const slabSampleSize = tagged.filter((m) => m.finish === 'psa10').length;

  return {
    days,
    date,
    generatedAt: new Date().toISOString(),
    headline: buildHeadline(days, date, rotationInto, rotationOut, rawSampleSize, slabSampleSize),
    eras,
    finishes,
    eraFinishes,
    specials,
    rotationInto,
    rotationOut,
  };
}
