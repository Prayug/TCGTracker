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
  /** Raw feed identity (uid) or slab series key. Used to collapse duplicate series. */
  uniqueIdentifier?: string | null;
};

/** Ranked tape length — analysis still uses the full universe. */
export const MONEY_FLOW_TAPE_LIMIT = 100;

function moverIdentity(m: TaggedMover): string {
  if (m.finish === 'psa10') {
    return `psa10:${m.exemplar.cardId || m.exemplar.productName}`;
  }
  if (m.uniqueIdentifier) return `raw:${m.uniqueIdentifier}`;
  return `raw:${m.exemplar.cardId || m.exemplar.productName}:${m.exemplar.setId || m.exemplar.setName || ''}`;
}

/** One PSA 10 series per card; one raw series per uniqueIdentifier. Keep the larger $|move|. */
export function dedupeMoneyFlowUniverse(tagged: TaggedMover[]): TaggedMover[] {
  const best = new Map<string, TaggedMover>();
  for (const m of tagged) {
    const key = moverIdentity(m);
    const prev = best.get(key);
    if (!prev || Math.abs(m.dollarMove) > Math.abs(prev.dollarMove)) {
      best.set(key, m);
    }
  }
  return [...best.values()];
}

function dataNoteFor(sampleSize: number, confidence: MoneyFlowCohort['confidence']): string | null {
  if (sampleSize === 0) return 'n=0';
  if (confidence === 'thin' || confidence === 'low') return `n=${sampleSize}`;
  return null;
}

function impactRank(m: TaggedMover, rotation: MoneyFlowCohort['rotation']): number {
  if (rotation === 'out') return m.changePercent;
  // Signed, not abs — an 'into'/'neutral' cohort's face card should be a gainer,
  // not whichever member moved the most regardless of direction.
  return -(m.changePercent * Math.sqrt(Math.max(m.currentPrice, 1)));
}

function pickExemplars(
  members: TaggedMover[],
  rotation: MoneyFlowCohort['rotation']
): MoneyFlowExemplar[] {
  const ranked = [...members].sort((a, b) => impactRank(a, rotation) - impactRank(b, rotation));
  // Face the cohort with a real thumb when the $ leader has no art (JP prints, unmapped uids).
  const ordered = [
    ...ranked.filter((m) => m.exemplar.imageSmall || m.exemplar.imageLarge),
    ...ranked.filter((m) => !m.exemplar.imageSmall && !m.exemplar.imageLarge),
  ];
  const seen = new Set<string>();
  const out: MoneyFlowExemplar[] = [];
  for (const m of ordered) {
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
    summary = 'No data.';
  } else if (intoLabels.length === 0 && outLabels.length === 0) {
    summary = 'No rotation.';
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

function faceKey(c: MoneyFlowCohort, exIndex = 0): string {
  const ex = c.exemplars[exIndex];
  return (ex?.cardId || ex?.productName || '').trim().toLowerCase();
}

function withUnusedFace(c: MoneyFlowCohort, used: Set<string>): MoneyFlowCohort | null {
  const idx = c.exemplars.findIndex((_, i) => {
    const k = faceKey(c, i);
    return k.length > 0 && !used.has(k);
  });
  if (idx < 0) return null;
  const face = c.exemplars[idx]!;
  used.add(faceKey(c, idx));
  if (idx === 0) return c;
  return { ...c, exemplars: [face, ...c.exemplars.filter((_, i) => i !== idx)] };
}

/**
 * Prefer era×finish and specials over parent eras. One card face per row.
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

  const childEras = new Set(
    scored.filter((c) => c.kind === 'era_finish' && c.era).map((c) => c.era as string)
  );
  const picked: MoneyFlowCohort[] = [];
  const usedFaces = new Set<string>();

  for (const c of scored) {
    if (picked.length >= 3) break;
    if (c.kind === 'era' && childEras.has(c.key)) continue;
    if (picked.some((p) => p.label === c.label || p.id === c.id)) continue;
    const unique = withUnusedFace(c, usedFaces);
    if (!unique) continue;
    picked.push(unique);
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
  taggedInput: TaggedMover[],
  date: string | null = null,
  filteredOutCount = 0
): MoneyFlowResponse {
  const tagged = dedupeMoneyFlowUniverse(taggedInput);
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
  const { topGainers, topLosers } = pickIndividualMovers(tagged, MONEY_FLOW_TAPE_LIMIT);

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
  const strongest = [...scored].sort(
    (a, b) => (b.medianReturnPct ?? 0) - (a.medianReturnPct ?? 0)
  )[0];
  const weakest = [...scored].sort(
    (a, b) => (a.medianReturnPct ?? 0) - (b.medianReturnPct ?? 0)
  )[0];

  return {
    chasedSharePct,
    cooledSharePct,
    medianMovePct: median(tagged.filter((m) => m.changePercent !== 0).map((m) => m.changePercent)),
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
        Math.abs(c.medianReturnPct ?? 0) * Math.sqrt(c.sampleSize) +
        Math.abs(c.netDollarMove) / 500;
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
    imageLarge: m.exemplar.imageLarge,
    cardId: m.exemplar.cardId,
    setName: m.exemplar.setName,
    finish: m.finish,
    era: m.era,
    segmentLabel: segmentLabelFor(m),
    specials: m.specials,
  });

  const byAbsDollar = [...tagged].sort((a, b) => Math.abs(b.dollarMove) - Math.abs(a.dollarMove));
  const seenG = new Set<string>();
  const seenL = new Set<string>();
  const gainers = byAbsDollar
    .filter((m) => m.changePercent > 0)
    .filter((m) => {
      const key = moverIdentity(m);
      if (seenG.has(key)) return false;
      seenG.add(key);
      return true;
    })
    .slice(0, limit)
    .map(toRow);
  const losers = byAbsDollar
    .filter((m) => m.changePercent < 0)
    .filter((m) => {
      const key = moverIdentity(m);
      if (seenL.has(key)) return false;
      seenL.add(key);
      return true;
    })
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
      text: `${rotationInto[0].label} ${formatSigned(rotationInto[0].medianReturnPct)} · ${rotationOut[0].label} ${formatSigned(rotationOut[0].medianReturnPct)}.`,
    });
  } else if (rotationInto[0]) {
    out.push({
      id: 'rotation-in',
      text: `${rotationInto[0].label} ${formatSigned(rotationInto[0].medianReturnPct)}.`,
    });
  } else if (rotationOut[0]) {
    out.push({
      id: 'rotation-out',
      text: `${rotationOut[0].label} ${formatSigned(rotationOut[0].medianReturnPct)}.`,
    });
  }

  const breadthLeader = [...specials, ...eraFinishes]
    .filter((c) => c.sampleSize >= 5 && c.breadthUpPct != null)
    .sort((a, b) => (b.breadthUpPct ?? 0) - (a.breadthUpPct ?? 0))[0];
  if (breadthLeader) {
    out.push({
      id: 'breadth',
      text: `${breadthLeader.label} ${Math.round(breadthLeader.breadthUpPct ?? 0)}% up · n=${breadthLeader.sampleSize}.`,
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
      text: `${summary.risingCount} up / ${summary.fallingCount} down · median ${formatSigned(summary.medianMovePct)} · ${summary.trackedCount} tracked.`,
    });
  }

  return out.slice(0, 4);
}

function formatSigned(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}
