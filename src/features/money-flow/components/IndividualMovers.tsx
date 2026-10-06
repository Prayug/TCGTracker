import { useMemo, useState } from 'react';
import type { MoneyFlowMoverRow } from '@tcgtracker/shared';
import { formatMoney, formatPct, moveTone } from '../lib/format';
import type { HeatFilter } from './MoneyFlowHeatmap';

type SortKey = 'move' | 'dollar' | 'price';
type Side = 'gainers' | 'losers';

function matches(row: MoneyFlowMoverRow, filter: HeatFilter): boolean {
  if (!filter) return true;
  if (filter.era && row.era !== filter.era) return false;
  if (filter.finish && row.finish !== filter.finish) return false;
  return true;
}

export function IndividualMovers({
  gainers,
  losers,
  filter,
  windowDays,
}: {
  gainers: MoneyFlowMoverRow[];
  losers: MoneyFlowMoverRow[];
  filter: HeatFilter;
  windowDays: number;
}) {
  const [side, setSide] = useState<Side>('gainers');
  const [sort, setSort] = useState<SortKey>('dollar');

  const rows = useMemo(() => {
    const src = (side === 'gainers' ? gainers : losers).filter((r) => matches(r, filter));
    return [...src].sort((a, b) => {
      if (sort === 'price') return b.currentPrice - a.currentPrice;
      if (sort === 'move') return Math.abs(b.changePercent) - Math.abs(a.changePercent);
      return b.absDollarMove - a.absDollarMove;
    });
  }, [side, sort, gainers, losers, filter]);

  return (
    <section className="mf-term__panel" aria-label="Individual movers">
      <div className="mf-term__panel-head">
        <h2 className="mf-term__panel-title">Individual movers</h2>
        <div className="mf-term__tabs">
          <button
            type="button"
            className="mf-term__tab"
            aria-pressed={side === 'gainers'}
            onClick={() => setSide('gainers')}
          >
            Gainers
          </button>
          <button
            type="button"
            className="mf-term__tab"
            aria-pressed={side === 'losers'}
            onClick={() => setSide('losers')}
          >
            Losers
          </button>
          <button
            type="button"
            className="mf-term__tab"
            aria-pressed={sort === 'dollar'}
            onClick={() => setSort('dollar')}
          >
            $ impact
          </button>
          <button
            type="button"
            className="mf-term__tab"
            aria-pressed={sort === 'move'}
            onClick={() => setSort('move')}
          >
            % move
          </button>
          <button
            type="button"
            className="mf-term__tab"
            aria-pressed={sort === 'price'}
            onClick={() => setSort('price')}
          >
            Price
          </button>
        </div>
      </div>
      <div className="mf-term__table-wrap">
        <table className="mf-term__table">
          <thead>
            <tr>
              <th>Card</th>
              <th>Segment</th>
              <th className="is-num">{windowDays}D</th>
              <th className="is-num">Price</th>
              <th className="is-num">$ move</th>
              <th>Finish</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="mf-term__empty-cell">
                  No individual movers in this filter
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="mf-term__ex">
                      {r.imageSmall ? (
                        <img src={r.imageSmall} alt="" loading="lazy" />
                      ) : (
                        <span className="mf-term__ex-ph" />
                      )}
                      <span>
                        <span className="mf-term__ex-name">{r.productName}</span>
                        {r.setName ? <span className="mf-term__sub">{r.setName}</span> : null}
                      </span>
                    </span>
                  </td>
                  <td>{r.segmentLabel}</td>
                  <td className={`is-num is-${moveTone(r.changePercent)}`}>
                    {formatPct(r.changePercent)}
                  </td>
                  <td className="is-num">{formatMoney(r.currentPrice)}</td>
                  <td className="is-num">{formatMoney(r.absDollarMove)}</td>
                  <td>{r.finish === 'psa10' ? 'PSA 10' : 'Raw'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
