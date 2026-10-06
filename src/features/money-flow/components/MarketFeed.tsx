import { useMemo, useState } from 'react';
import type { MoneyFlowMoverRow } from '@tcgtracker/shared';
import { formatMoney, formatPct } from '../lib/format';
import type { MapFilter } from './MarketMap';

type Side = 'gainers' | 'losers';

export function MarketFeed({
  gainers,
  losers,
  filter,
  windowDays,
}: {
  gainers: MoneyFlowMoverRow[];
  losers: MoneyFlowMoverRow[];
  filter: MapFilter;
  windowDays: number;
}) {
  const [side, setSide] = useState<Side>('gainers');

  const rows = useMemo(() => {
    const src = side === 'gainers' ? gainers : losers;
    if (!filter) return src;
    // Filter by segment label containment when cohort filter active
    const needle = filter.label.toLowerCase();
    const filtered = src.filter(
      (r) =>
        r.segmentLabel.toLowerCase().includes(needle.split('·')[0]?.trim() || needle) ||
        needle.includes(r.era) ||
        (needle.includes('psa') && r.finish === 'psa10') ||
        (needle.includes('raw') && r.finish === 'raw')
    );
    return filtered.length ? filtered : src;
  }, [side, gainers, losers, filter]);

  return (
    <section className="mf-ed__feed" aria-label="Biggest card moves">
      <div className="mf-ed__chapter">
        <h2 className="mf-ed__chapter-title">Biggest card moves</h2>
        <div className="mf-ed__feed-toggle" role="group" aria-label="Feed side">
          <button
            type="button"
            className="mf-ed__win"
            aria-pressed={side === 'gainers'}
            onClick={() => setSide('gainers')}
          >
            Gainers
          </button>
          <button
            type="button"
            className="mf-ed__win"
            aria-pressed={side === 'losers'}
            onClick={() => setSide('losers')}
          >
            Losers
          </button>
        </div>
      </div>

      <ul className="mf-ed__tape">
        {rows.length === 0 ? (
          <li className="mf-ed__tape-empty">No individual movers in this view</li>
        ) : (
          rows.map((r) => (
            <li key={r.id} className="mf-ed__tape-row">
              <div className="mf-ed__tape-art">
                {r.imageSmall ? (
                  <img src={r.imageSmall} alt="" loading="lazy" />
                ) : (
                  <div className="mf-ed__art-ph" />
                )}
              </div>
              <div className="mf-ed__tape-main">
                <p className="mf-ed__tape-name">{r.productName}</p>
                <p className="mf-ed__tape-set">
                  {r.setName || '—'} · {r.finish === 'psa10' ? 'PSA 10' : 'Raw'} · {r.segmentLabel}
                </p>
              </div>
              <div className="mf-ed__tape-nums">
                <span className={`mf-ed__tape-pct is-${side === 'gainers' ? 'in' : 'out'}`}>
                  {formatPct(r.changePercent)}
                </span>
                <span className="mf-ed__tape-price">
                  {formatMoney(r.currentPrice)}
                  <em>
                    {windowDays}D · {formatMoney(r.absDollarMove)} move
                  </em>
                </span>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
