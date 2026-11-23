import type { Opportunity, OpportunityGrade } from '../types';

export const GRADE_LABEL: Record<OpportunityGrade, string> = {
  strong_buy: 'Strong buy',
  buy: 'Buy',
  watch: 'Watch',
  pass: 'Pass',
};

/** Text colour per grade: movement colours for buy/pass, warn for watch. */
export const GRADE_TONE: Record<OpportunityGrade, string> = {
  strong_buy: 'text-gain',
  buy: 'text-gain',
  watch: 'text-warn',
  pass: 'text-ink-muted',
};

/**
 * The grade to show. Mirrors the backend guard so an older backend can't put
 * "Strong buy" next to a negative 90-day forecast.
 */
export function displayGrade(o: Pick<Opportunity, 'grade' | 'predictedReturn90d'>): {
  grade: OpportunityGrade;
  capped: boolean;
} {
  const negative = o.predictedReturn90d != null && o.predictedReturn90d < 0;
  if (negative && (o.grade === 'strong_buy' || o.grade === 'buy'))
    return { grade: 'watch', capped: true };
  return { grade: o.grade, capped: false };
}

const pct = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n * 10) / 10)}%`;

/**
 * Two or three plain-language reasons behind a score, built from the row's
 * own figures rather than its internal signal keys. Ordered by what a
 * collector would want to know first: why a grade was held back, what the
 * model expects, what the price has done, then market structure.
 */
export function opportunityReasons(o: Opportunity, max = 3): string[] {
  const out: string[] = [];
  const { capped } = displayGrade(o);
  const keys = o.keySignals ?? [];
  if (capped || keys.some((k) => k.startsWith('grade_capped')))
    out.push('Held at Watch: the 90-day forecast points down');

  if (o.predictedReturn90d != null) {
    const conf = o.confidence != null ? ` (${Math.round(o.confidence)}% confidence)` : '';
    out.push(`Model expects ${pct(o.predictedReturn90d)} over 90 days${conf}`);
  } else {
    out.push('No forecast for this card; scored on price movement and listings');
  }

  if (o.momentumPct != null && Math.abs(o.momentumPct) >= 1) {
    out.push(
      `Graded price ${o.momentumPct > 0 ? 'up' : 'down'} ${pct(Math.abs(o.momentumPct)).replace('+', '')} in ${o.momentumDays} days`
    );
  }
  if (o.buyoutScore >= 50) out.push('Cheap listings are thinning out');
  if (o.compMomentumPct != null && o.compMomentumPct > 5)
    out.push(`Rest of the set up ${pct(o.compMomentumPct).replace('+', '')}`);
  if (keys.some((k) => k.startsWith('undervalued_vs_set')))
    out.push('Graded premium is below the set’s usual');
  if (o.netSentiment != null && Math.abs(o.netSentiment) > 0.15)
    out.push(`Recent news leans ${o.netSentiment > 0 ? 'positive' : 'negative'}`);

  return out.slice(0, max);
}
