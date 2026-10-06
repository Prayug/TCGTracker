import { useMemo, useState } from 'react';
import type { MoneyFlowCohort, MoneyFlowEra, MoneyFlowWindowDays } from '@tcgtracker/shared';
import { useMoneyFlow } from '../hooks/useMoneyFlow';
import '../money-flow.css';
import { BreadthBuckets } from './BreadthBuckets';
import { EraPerformance } from './EraPerformance';
import { IndividualMovers } from './IndividualMovers';
import { MarketHeader } from './MarketHeader';
import { MarketInsights } from './MarketInsights';
import { MarketSummary } from './MarketSummary';
import { MoneyFlowHeatmap, type HeatFilter } from './MoneyFlowHeatmap';
import { MoverTable } from './MoverTable';
import { RawVsGraded } from './RawVsGraded';
import { SpecialPrintMomentum } from './SpecialPrintMomentum';

export function MoneyFlowPage() {
  const [days, setDays] = useState<MoneyFlowWindowDays>(7);
  const [filter, setFilter] = useState<HeatFilter>(null);
  const { data, loading, refreshing, error } = useMoneyFlow(days);

  const filteredActive = useMemo(() => data?.mostActive ?? [], [data]);

  const onSelectCohort = (c: MoneyFlowCohort) => {
    setFilter({
      era: c.era,
      finish: c.finish,
      cohortId: c.id,
    });
  };

  const onSelectEra = (era: MoneyFlowEra) => {
    setFilter((prev) => (prev?.era === era && !prev.finish ? null : { era }));
  };

  return (
    <div className="mf-term">
      <MarketHeader data={data} days={days} onDaysChange={setDays} refreshing={refreshing} />

      {loading && !data ? (
        <div className="mf-term__skeleton" aria-busy="true" aria-label="Loading money flow">
          <div className="mf-term__skel" />
          <div className="mf-term__skel is-tall" />
        </div>
      ) : error && !data ? (
        <div className="mf-term__empty">{error}</div>
      ) : !data ? (
        <div className="mf-term__empty">No data yet.</div>
      ) : (
        <>
          <MarketSummary summary={data.summary} />

          <div className="mf-term__grid-2">
            <MoneyFlowHeatmap
              eraFinishes={data.eraFinishes}
              eras={data.eras}
              filter={filter}
              onFilter={setFilter}
            />
            <div className="mf-term__stack">
              <BreadthBuckets buckets={data.breadthBuckets} />
              <MarketInsights insights={data.insights} />
            </div>
          </div>

          <MoverTable
            into={data.rotationInto}
            out={data.rotationOut}
            active={filteredActive}
            filter={filter}
            onSelect={onSelectCohort}
            windowDays={days}
          />

          <EraPerformance
            eras={data.eras}
            eraFinishes={data.eraFinishes}
            filter={filter}
            onSelect={onSelectEra}
          />

          <div className="mf-term__grid-2">
            <SpecialPrintMomentum specials={data.specials} />
            <RawVsGraded finishes={data.finishes} />
          </div>

          <IndividualMovers
            gainers={data.topGainers}
            losers={data.topLosers}
            filter={filter}
            windowDays={days}
          />
        </>
      )}
    </div>
  );
}

export default MoneyFlowPage;
