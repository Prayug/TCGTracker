import { useState } from 'react';
import type { MoneyFlowCohort, MoneyFlowEra, MoneyFlowWindowDays } from '@tcgtracker/shared';
import { MONEY_FLOW_ERA_LABELS } from '@tcgtracker/shared';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { useMoneyFlow } from '../hooks/useMoneyFlow';
import { filterFromCohort, type SegmentFilter } from '../lib/filter';
import '../money-flow.css';
import { EraEditorial } from './EraEditorial';
import { FinishContinuum } from './FinishContinuum';
import { MarketFeed } from './MarketFeed';
import { MarketMap } from './MarketMap';
import { MoneyRails } from './MoneyRails';
import { OpeningStrip } from './OpeningStrip';

export function MoneyFlowPage() {
  const [days, setDays] = useState<MoneyFlowWindowDays>(7);
  const [filter, setFilter] = useState<SegmentFilter | null>(null);
  const { data, loading, refreshing, error } = useMoneyFlow(days);

  const onPickCohort = (c: MoneyFlowCohort) => {
    setFilter((prev) => (prev?.cohortId === c.id ? null : filterFromCohort(c)));
  };

  const onSelectEra = (era: MoneyFlowEra) => {
    const label = MONEY_FLOW_ERA_LABELS[era];
    setFilter((prev) =>
      prev?.cohortId === `era:${era}`
        ? null
        : { cohortId: `era:${era}`, label, era, memberCardIds: [] }
    );
  };

  return (
    <div className="mf">
      {loading && !data ? (
        <div className="flex min-h-[50vh] items-center justify-center" aria-busy="true">
          <LoadingSpinner />
        </div>
      ) : error && !data ? (
        <div className="mf__status flex min-h-[50vh] items-center justify-center text-center">
          {error}
        </div>
      ) : !data ? (
        <div className="mf__status flex min-h-[50vh] items-center justify-center text-center">
          No data yet.
        </div>
      ) : (
        <>
          <OpeningStrip data={data} days={days} onDaysChange={setDays} refreshing={refreshing} />
          <MarketMap
            eraFinishes={data.eraFinishes}
            specials={data.specials}
            filter={filter}
            onFilter={setFilter}
          />
          <MoneyRails
            into={data.rotationInto}
            out={data.rotationOut}
            onPick={onPickCohort}
            filter={filter}
          />
          <EraEditorial eras={data.eras} eraFinishes={data.eraFinishes} onSelectEra={onSelectEra} />
          <FinishContinuum finishes={data.finishes} />
          <MarketFeed
            gainers={data.topGainers}
            losers={data.topLosers}
            filter={filter}
            windowDays={days}
            trackedCount={data.summary.trackedCount}
          />
        </>
      )}
    </div>
  );
}

export default MoneyFlowPage;
