import type { MoneyFlowCohort } from '@tcgtracker/shared';
import { formatPct, formatMoney } from '../lib/format';
import type { MapFilter } from './MarketMap';

function Feature({
  cohort,
  kicker,
  onPick,
}: {
  cohort: MoneyFlowCohort;
  kicker: string;
  onPick: (c: MoneyFlowCohort) => void;
}) {
  const ex = cohort.exemplars[0];
  return (
    <button type="button" className="mf-ed__feature" onClick={() => onPick(cohort)}>
      <div className="mf-ed__feature-art">
        {ex?.imageLarge || ex?.imageSmall ? (
          <img src={ex.imageLarge || ex.imageSmall || ''} alt="" />
        ) : (
          <div className="mf-ed__art-ph" />
        )}
      </div>
      <div className="mf-ed__feature-copy">
        <p className="mf-ed__feature-kicker">{kicker}</p>
        <p className="mf-ed__feature-seg">{cohort.label}</p>
        <p className="mf-ed__feature-move">{formatPct(cohort.medianReturnPct)}</p>
        {ex ? (
          <p className="mf-ed__feature-card">
            {ex.productName}
            <span>
              {formatMoney(ex.currentPrice)}
              {ex.finish === 'psa10' ? ' · PSA 10' : ' · raw'}
              {ex.setName ? ` · ${ex.setName}` : ''}
            </span>
          </p>
        ) : null}
        <p className="mf-ed__feature-meta">
          {cohort.breadthUpPct == null
            ? '—'
            : `${Math.round(cohort.breadthUpPct)}% of prints rising`}{' '}
          across {cohort.sampleSize} tracked
        </p>
      </div>
    </button>
  );
}

function RankList({
  cohorts,
  startAt,
  onPick,
}: {
  cohorts: MoneyFlowCohort[];
  startAt: number;
  onPick: (c: MoneyFlowCohort) => void;
}) {
  if (cohorts.length === 0) return null;
  return (
    <ol className="mf-ed__mag-list" start={startAt}>
      {cohorts.map((c, i) => {
        const ex = c.exemplars[0];
        return (
          <li key={c.id}>
            <button type="button" className="mf-ed__mag-row" onClick={() => onPick(c)}>
              <span className="mf-ed__mag-num">{startAt + i}</span>
              {ex?.imageSmall ? (
                <img src={ex.imageSmall} alt="" className="mf-ed__mag-thumb" />
              ) : null}
              <span className="mf-ed__mag-body">
                <span className="mf-ed__mag-seg">{c.label}</span>
                <span className="mf-ed__mag-card">
                  {ex?.productName || `${c.sampleSize} prints`}
                </span>
              </span>
              <span className="mf-ed__mag-pct">{formatPct(c.medianReturnPct)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function MoneyRails({
  into,
  out,
  filter,
  onPick,
}: {
  into: MoneyFlowCohort[];
  out: MoneyFlowCohort[];
  filter: MapFilter;
  onPick: (c: MoneyFlowCohort) => void;
}) {
  const intoRows = filter
    ? into.filter((c) => c.id === filter.cohortId || c.label === filter.label)
    : into;
  const outRows = filter
    ? out.filter((c) => c.id === filter.cohortId || c.label === filter.label)
    : out;
  const showInto = intoRows.length ? intoRows : into;
  const showOut = outRows.length ? outRows : out;
  const [intoHero, ...intoRest] = showInto;
  const [outHero, ...outRest] = showOut;

  return (
    <section className="mf-ed__rails" aria-label="Leaders and laggards">
      <div className="mf-ed__chapter">
        <h2 className="mf-ed__chapter-title">Leaders and laggards</h2>
      </div>

      {intoHero ? (
        <Feature cohort={intoHero} kicker="Leading the tape" onPick={onPick} />
      ) : (
        <p className="mf-ed__rail-empty">No clear money-in leader this window.</p>
      )}
      <RankList cohorts={intoRest} startAt={2} onPick={onPick} />

      {outHero ? (
        <div className="mf-ed__laggard">
          <Feature cohort={outHero} kicker="Cooling off" onPick={onPick} />
          <RankList cohorts={outRest} startAt={2} onPick={onPick} />
        </div>
      ) : null}
    </section>
  );
}
