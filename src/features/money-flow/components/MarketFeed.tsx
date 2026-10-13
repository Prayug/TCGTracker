import { useEffect, useMemo, useState } from 'react';
import type { MoneyFlowMoverRow } from '@tcgtracker/shared';
import { useCardModal } from '../../../contexts/CardModalContext';
import { moverMatchesFilter, type SegmentFilter } from '../lib/filter';
import { formatMoney, formatPct, formatSignedMoney, gradeLabel, moveTone } from '../lib/format';
import { CardThumb } from './CardThumb';

type Side = 'gainers' | 'losers';

/** Render a page at a time — the tape can hold up to 100 image rows. */
const PAGE_SIZE = 25;

export function MarketFeed({
  gainers,
  losers,
  filter,
  windowDays,
  trackedCount,
}: {
  gainers: MoneyFlowMoverRow[];
  losers: MoneyFlowMoverRow[];
  filter: SegmentFilter | null;
  windowDays: number;
  trackedCount: number;
}) {
  const [side, setSide] = useState<Side>('gainers');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const { openCard } = useCardModal();

  const rows = useMemo(() => {
    const src = side === 'gainers' ? gainers : losers;
    return src.filter((r) => moverMatchesFilter(r, filter));
  }, [side, gainers, losers, filter]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [side, filter]);

  const visibleRows = rows.slice(0, visibleCount);

  const openRow = (r: MoneyFlowMoverRow) => {
    if (!r.cardId) return;
    openCard({
      id: r.cardId,
      name: r.productName,
      images: { small: r.imageSmall || '', large: r.imageLarge || r.imageSmall || '' },
      set: { id: '', name: r.setName || '', releaseDate: '', total: 0 },
      number: '',
    });
  };

  return (
    <section className="mf__section mf__section--last" aria-label="Biggest card moves">
      <div className="mf__section-head">
        <h2 className="mf__section-title">Biggest moves</h2>
        <div className="mf__feed-tools">
          {!filter ? <p className="mf__section-aside">{trackedCount} tracked</p> : null}
          <div className="mf__windows" role="group" aria-label="Movers side">
            <button
              type="button"
              className="mf__win"
              aria-pressed={side === 'gainers'}
              onClick={() => setSide('gainers')}
            >
              Gainers
            </button>
            <button
              type="button"
              className="mf__win"
              aria-pressed={side === 'losers'}
              onClick={() => setSide('losers')}
            >
              Losers
            </button>
          </div>
        </div>
      </div>

      <div className="mf__tape">
        <div className="mf__tape-head">
          <span>#</span>
          <span>Card</span>
          <span>Set</span>
          <span>Grade</span>
          <span>Price</span>
          <span>{windowDays}D</span>
          <span>$ Move</span>
        </div>
        {rows.length === 0 ? (
          <p className="mf__empty">No individual movers in this view.</p>
        ) : (
          visibleRows.map((r, i) => {
            const tone = moveTone(r.changePercent);
            return (
              <button key={r.id} type="button" className="mf__tape-row" onClick={() => openRow(r)}>
                <span className="mf__rank">{i + 1}</span>
                <span className="mf__tape-card">
                  <CardThumb src={r.imageSmall} alt="" wide={36} />
                  <span>
                    <span className="mf__row-title">{r.productName}</span>
                    <span className="mf__row-sub mf__tape-seg">{r.segmentLabel}</span>
                  </span>
                </span>
                <span className="mf__tape-set">{r.setName || '—'}</span>
                <span className="mf__dim">{gradeLabel(r.finish)}</span>
                <span className="mf__num">{formatMoney(r.currentPrice)}</span>
                <span className={`mf__num is-${tone}`}>{formatPct(r.changePercent)}</span>
                <span className={`mf__num is-${tone}`}>
                  {formatSignedMoney(r.absDollarMove, r.changePercent)}
                </span>
              </button>
            );
          })
        )}
      </div>
      {visibleCount < rows.length ? (
        <button
          type="button"
          className="mf__clear"
          onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
        >
          Show more ({rows.length - visibleCount} left)
        </button>
      ) : null}
    </section>
  );
}
