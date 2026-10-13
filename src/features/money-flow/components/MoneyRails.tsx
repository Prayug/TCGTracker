import type { MoneyFlowCohort } from '@tcgtracker/shared';
import type { SegmentFilter } from '../lib/filter';
import { formatPct, moveTone, printsLabel } from '../lib/format';
import { CardThumb } from './CardThumb';

function RailRow({
  cohort,
  rank,
  active,
  onPick,
}: {
  cohort: MoneyFlowCohort;
  rank: number;
  active: boolean;
  onPick: (c: MoneyFlowCohort) => void;
}) {
  const ex = cohort.exemplars[0];
  const tone = moveTone(cohort.medianReturnPct);

  return (
    <li>
      <button
        type="button"
        className={`mf__rail-row${active ? ' is-active' : ''}`}
        aria-pressed={active}
        onClick={() => onPick(cohort)}
      >
        <span className="mf__rank">{rank}</span>
        <CardThumb
          src={ex?.imageSmall}
          large={ex?.imageLarge}
          alt={ex?.productName || cohort.label}
          wide={40}
        />
        <span className="mf__rail-body">
          <span className="mf__row-title">{ex?.productName || cohort.label}</span>
          <span className="mf__row-sub">
            {cohort.label} · {printsLabel(cohort.sampleSize)}
          </span>
        </span>
        <span className={`mf__num is-${tone}`}>{formatPct(cohort.medianReturnPct)}</span>
      </button>
    </li>
  );
}

export function MoneyRails({
  into,
  out,
  onPick,
  filter,
}: {
  into: MoneyFlowCohort[];
  out: MoneyFlowCohort[];
  onPick: (c: MoneyFlowCohort) => void;
  filter: SegmentFilter | null;
}) {
  const showInto = into.slice(0, 4);
  const showOut = out.slice(0, 4);

  return (
    <section className="mf__section" aria-label="Money in and money out">
      <div className="mf__split">
        <div>
          <h2 className="mf__section-title">Money in</h2>
          {showInto.length === 0 ? (
            <p className="mf__empty">No inflow this window.</p>
          ) : (
            <ol className="mf__rail">
              {showInto.map((c, i) => (
                <RailRow
                  key={c.id}
                  cohort={c}
                  rank={i + 1}
                  active={filter?.cohortId === c.id}
                  onPick={onPick}
                />
              ))}
            </ol>
          )}
        </div>
        <div>
          <h2 className="mf__section-title">Money out</h2>
          {showOut.length === 0 ? (
            <p className="mf__empty">No outflow this window.</p>
          ) : (
            <ol className="mf__rail">
              {showOut.map((c, i) => (
                <RailRow
                  key={c.id}
                  cohort={c}
                  rank={i + 1}
                  active={filter?.cohortId === c.id}
                  onPick={onPick}
                />
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
