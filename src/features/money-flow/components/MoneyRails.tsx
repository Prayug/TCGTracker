import type { MoneyFlowCohort } from '@tcgtracker/shared';
import { formatPct, formatMoney } from '../lib/format';
import type { MapFilter } from './MarketMap';

function Rail({
  title,
  cohorts,
  side,
  onPick,
}: {
  title: string;
  cohorts: MoneyFlowCohort[];
  side: 'in' | 'out';
  onPick: (c: MoneyFlowCohort) => void;
}) {
  const [hero, ...rest] = cohorts;
  return (
    <div className={`mf-ed__rail mf-ed__rail--${side}`}>
      <h3 className="mf-ed__rail-title">{title}</h3>
      {hero ? (
        <button type="button" className="mf-ed__hero" onClick={() => onPick(hero)}>
          <div className="mf-ed__hero-art">
            {hero.exemplars[0]?.imageLarge || hero.exemplars[0]?.imageSmall ? (
              <img
                src={hero.exemplars[0].imageLarge || hero.exemplars[0].imageSmall || ''}
                alt=""
              />
            ) : (
              <div className="mf-ed__art-ph" />
            )}
          </div>
          <div className="mf-ed__hero-copy">
            <p className="mf-ed__hero-seg">{hero.label}</p>
            <p className="mf-ed__hero-move">{formatPct(hero.medianReturnPct)}</p>
            {hero.exemplars[0] ? (
              <p className="mf-ed__hero-card">
                {hero.exemplars[0].productName}
                <span>
                  {formatMoney(hero.exemplars[0].currentPrice)}
                  {hero.exemplars[0].finish === 'psa10' ? ' PSA 10' : ' raw'}
                </span>
              </p>
            ) : null}
            <p className="mf-ed__hero-meta">
              {hero.breadthUpPct == null ? '—' : `${Math.round(hero.breadthUpPct)}% rising`} ·{' '}
              {hero.sampleSize} prints
            </p>
          </div>
        </button>
      ) : (
        <p className="mf-ed__rail-empty">Nothing clear this window</p>
      )}
      <ol className="mf-ed__rank">
        {rest.map((c, i) => {
          const ex = c.exemplars[0];
          return (
            <li key={c.id}>
              <button type="button" className="mf-ed__rank-row" onClick={() => onPick(c)}>
                <span className="mf-ed__rank-i">{i + 2}</span>
                {ex?.imageSmall ? (
                  <img src={ex.imageSmall} alt="" />
                ) : (
                  <span className="mf-ed__art-ph is-sm" />
                )}
                <span className="mf-ed__rank-body">
                  <span className="mf-ed__rank-seg">{c.label}</span>
                  <span className="mf-ed__rank-card">{ex?.productName || '—'}</span>
                </span>
                <span className="mf-ed__rank-pct">{formatPct(c.medianReturnPct)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
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

  return (
    <section className="mf-ed__rails" aria-label="Money moving in and out">
      <div className="mf-ed__chapter">
        <h2 className="mf-ed__chapter-title">Money moving in and out</h2>
        <p className="mf-ed__chapter-aside">Leaders by typical chase-print move</p>
      </div>
      <div className="mf-ed__rails-split">
        <Rail title="Money in" cohorts={showInto} side="in" onPick={onPick} />
        <Rail title="Money out" cohorts={showOut} side="out" onPick={onPick} />
      </div>
    </section>
  );
}
