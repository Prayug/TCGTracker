import {
  type MoneyFlowCohort,
  type MoneyFlowEra,
  type MoneyFlowFinish,
  type MoneyFlowMoverRow,
  type MoneyFlowSpecial,
} from '@tcgtracker/shared';

/** A selected market segment that narrows the movers tape. */
export interface SegmentFilter {
  cohortId: string;
  label: string;
  era?: MoneyFlowEra;
  finish?: MoneyFlowFinish;
  special?: MoneyFlowSpecial;
  /** Known members of the cohort — lets special cohorts match exactly. */
  memberCardIds: string[];
}

export function filterFromCohort(c: MoneyFlowCohort): SegmentFilter {
  return {
    cohortId: c.id,
    label: c.label,
    era: c.era,
    finish: c.finish,
    special: c.special,
    memberCardIds: c.exemplars.map((e) => e.cardId).filter((id): id is string => Boolean(id)),
  };
}

export function moverMatchesFilter(row: MoneyFlowMoverRow, f: SegmentFilter | null): boolean {
  if (!f) return true;
  if (f.era && row.era !== f.era) return false;
  if (f.finish && row.finish !== f.finish) return false;
  if (f.special) {
    // row.specials may be absent on a payload cached by an older server version.
    return (row.specials ?? []).includes(f.special);
  }
  return true;
}
