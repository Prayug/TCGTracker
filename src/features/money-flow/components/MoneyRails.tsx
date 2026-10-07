import type { MoneyFlowCohort } from '@tcgtracker/shared';
import { formatPct, formatMoney } from '../lib/format';
import type { MapFilter } from './MarketMap';

function RankRow({
  cohort,
  rank,
  onPick,
}: {
  cohort: MoneyFlowCohort;
  rank: number;
  onPick: (c: MoneyFlowCohort) => void;
}) {
  const ex = cohort.exemplars[0];
  return (
    <li>
      <button type="button" className="mf-ed__mag-row" onClick={() => onPick(cohort)}>
        <span className="mf-ed__mag-num">{rank}</span>
        {ex?.imageSmall ? (
          <img
            src={ex.imageSmall}
            alt={ex.productName || cohort.label}
            className="mf-ed__mag-thumb"
          />
        ) : (
          <span className="mf-ed__mag-thumb mf-ed__art-ph" aria-hidden />
        )}
        <span className="mf-ed__mag-body">
          <span className="mf-ed__mag-seg">{cohort.label}</span>
          <span className="mf-ed__mag-card">
            {ex?.productName || `${cohort.sampleSize} prints`}
            {ex ? ` · ${formatMoney(ex.currentPrice)}` : ''}
          </span>
        </span>
        <span className="mf-ed__mag-pct">{formatPct(cohort.medianReturnPct)}</span>
      </button>
    </li>
  );
}

/**
 * Magazine ranking — one hero for money-in, then a single ordered list.
 * Cooling entries follow as ranks (not a mirrored second card module).
 */
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
  const [hero, ...intoRest] = showInto;
  const ex = hero?.exemplars[0];

  let rank = 2;

  return (
    <section className="mf-ed__rails" aria-label="Leaders and laggards">
      <div className="mf-ed__chapter">
        <h2 className="mf-ed__chapter-title">Who is pulling capital</h2>
      </div>

      {hero ? (
        <button type="button" className="mf-ed__hero" onClick={() => onPick(hero)}>
          <div className="mf-ed__hero-art">
            {ex?.imageLarge || ex?.imageSmall ? (
              <img src={ex.imageLarge || ex.imageSmall || ''} alt={ex.productName || hero.label} />
            ) : (
              <div className="mf-ed__art-ph" />
            )}
          </div>
          <div className="mf-ed__hero-copy">
            <p className="mf-ed__hero-rank">1</p>
            <p className="mf-ed__hero-seg">{hero.label}</p>
            <p className="mf-ed__hero-deck">
              {ex?.productName ?? hero.label}
              {ex ? (
                <span>
                  {formatMoney(ex.currentPrice)}
                  {ex.finish === 'psa10' ? ' · PSA 10' : ' · raw'}
                  {ex.setName ? ` · ${ex.setName}` : ''}
                </span>
              ) : null}
            </p>
            <p className="mf-ed__hero-read">
              Median {formatPct(hero.medianReturnPct)}
              {hero.breadthUpPct != null
                ? ` · ${Math.round(hero.breadthUpPct)}% of prints rising`
                : ''}{' '}
              across {hero.sampleSize} tracked
            </p>
          </div>
        </button>
      ) : (
        <p className="mf-ed__rail-empty">No clear money-in leader this window.</p>
      )}

      {intoRest.length > 0 ? (
        <ol className="mf-ed__mag-list" start={2}>
          {intoRest.map((c) => {
            const n = rank++;
            return <RankRow key={c.id} cohort={c} rank={n} onPick={onPick} />;
          })}
        </ol>
      ) : null}

      {showOut.length > 0 ? (
        <div className="mf-ed__cooling">
          <p className="mf-ed__cooling-label">Cooling — capital leaving</p>
          <ol className="mf-ed__mag-list mf-ed__mag-list--cool" start={1}>
            {showOut.map((c, i) => (
              <RankRow key={c.id} cohort={c} rank={i + 1} onPick={onPick} />
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
