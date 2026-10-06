import { useState } from 'react';
import type { MoneyFlowCohort, MoneyFlowEra, MoneyFlowWindowDays } from '@tcgtracker/shared';
import { useMoneyFlow } from '../hooks/useMoneyFlow';
import '../money-flow.css';
import { EraEditorial } from './EraEditorial';
import { FinishContinuum } from './FinishContinuum';
import { MarketFeed } from './MarketFeed';
import { MarketMap, type MapFilter } from './MarketMap';
import { MoneyRails } from './MoneyRails';
import { OpeningStrip } from './OpeningStrip';

export function MoneyFlowPage() {
  const [days, setDays] = useState<MoneyFlowWindowDays>(7);
  const [filter, setFilter] = useState<MapFilter>(null);
  const { data, loading, refreshing, error } = useMoneyFlow(days);

  const onPickCohort = (c: MoneyFlowCohort) => {
    setFilter((prev) => (prev?.cohortId === c.id ? null : { cohortId: c.id, label: c.label }));
  };

  const onSelectEra = (era: MoneyFlowEra) => {
    const label = era === 'mid' ? 'Mid-era' : era === 'vintage' ? 'Vintage' : 'Modern';
    setFilter((prev) => (prev?.label === label ? null : { cohortId: `era:${era}`, label }));
  };

  return (
    <div className="mf-ed">
      {loading && !data ? (
        <div className="mf-ed__loading" aria-busy="true">
          Loading market tape…
        </div>
      ) : error && !data ? (
        <div className="mf-ed__loading">{error}</div>
      ) : !data ? (
        <div className="mf-ed__loading">No data yet.</div>
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
            filter={filter}
            onPick={onPickCohort}
          />
          <EraEditorial eras={data.eras} eraFinishes={data.eraFinishes} onSelectEra={onSelectEra} />
          <FinishContinuum finishes={data.finishes} />
          <MarketFeed
            gainers={data.topGainers}
            losers={data.topLosers}
            filter={filter}
            windowDays={days}
          />
          {data.insights[0] ? <p className="mf-ed__footnote">{data.insights[0].text}</p> : null}
        </>
      )}
    </div>
  );
}

export default MoneyFlowPage;
