import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PriceHistoryApi, type TopMoverEntry } from '../../services/priceHistoryApi';
import { moverKey, moverSubtitle, moverToCard } from '../../utils/topMovers';
import { useCardModal } from '../../contexts/CardModalContext';
import { useGame } from '../../contexts/GameContext';
import { CardArt } from '../../components/exchange/CardArt';
import { Delta, Price, Unavailable } from '../../components/exchange/Price';
import { cn } from '@/lib/utils';

const PERIODS = [
  { days: 1, label: '24h' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
] as const;

const MIN_PRICE = 2;

/**
 * Market snapshot: one lead mover with its art, then ruled gainer/loser
 * columns. Small-dollar noise (< $2) is excluded and the threshold is stated.
 */
export function MarketMovers() {
  const { isOnePiece } = useGame();
  const { openCard } = useCardModal();
  const [days, setDays] = useState<number>(7);
  const [data, setData] = useState<{
    gainers: TopMoverEntry[];
    losers: TopMoverEntry[];
    date: string | null;
  } | null>(() => {
    const c = PriceHistoryApi.peekTopMovers(7, 50);
    return c ? { gainers: c.gainers, losers: c.losers, date: c.date } : null;
  });
  const [loading, setLoading] = useState(!data);

  useEffect(() => {
    let alive = true;
    const cached = PriceHistoryApi.peekTopMovers(days, 50);
    if (cached) setData({ gainers: cached.gainers, losers: cached.losers, date: cached.date });
    else setLoading(true);
    PriceHistoryApi.getTopMovers(days, 50)
      .then((res) => {
        if (!alive) return;
        setData({ gainers: res.gainers ?? [], losers: res.losers ?? [], date: res.date });
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [days]);

  const { gainers, losers, lead } = useMemo(() => {
    const clean = (list: TopMoverEntry[]) => {
      const seen = new Set<string>();
      return list.filter((e) => {
        const k = moverKey(e);
        if (seen.has(k) || !(e.currentPrice >= MIN_PRICE) || !Number.isFinite(e.changePercent))
          return false;
        seen.add(k);
        return true;
      });
    };
    const g = clean(data?.gainers ?? [])
      .filter((e) => e.changePercent > 0)
      .sort((a, b) => b.changePercent - a.changePercent);
    const l = clean(data?.losers ?? [])
      .filter((e) => e.changePercent < 0)
      .sort((a, b) => a.changePercent - b.changePercent);
    // Lead: the biggest dollar mover with artwork, so the anchor is meaningful, not a $3 card doubling.
    const withArt = [...g, ...l].filter((e) => e.imageSmall || e.imageLarge);
    const leadEntry = withArt.sort(
      (a, b) =>
        Math.abs(b.currentPrice - b.previousPrice) - Math.abs(a.currentPrice - a.previousPrice)
    )[0];
    return { gainers: g.slice(0, 6), losers: l.slice(0, 6), lead: leadEntry ?? null };
  }, [data]);

  const period = PERIODS.find((p) => p.days === days)?.label ?? `${days}d`;

  return (
    <section aria-labelledby="movers-h">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule-strong pb-2">
        <div>
          <h2 id="movers-h" className="font-display text-[22px] font-medium leading-tight">
            Market movers
          </h2>
          <p className="text-meta text-ink-muted">
            {isOnePiece ? 'One Piece' : 'Pokémon'} raw Near Mint market prices · cards over $
            {MIN_PRICE}
            {data?.date
              ? ` · as of ${new Date(data.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="segmented" role="group" aria-label="Period">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                type="button"
                aria-pressed={p.days === days}
                onClick={() => setDays(p.days)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Link
            to="/money-flow"
            className="hidden text-[13px] text-accent hover:underline sm:inline"
          >
            Market overview →
          </Link>
        </div>
      </div>

      {loading && !data ? (
        <div className="mt-5 grid gap-6 lg:grid-cols-[14rem_1fr_1fr]">
          <div className="skeleton aspect-[63/88] w-full rounded-lg" />
          <div className="skeleton h-64 rounded" />
          <div className="skeleton h-64 rounded" />
        </div>
      ) : gainers.length === 0 && losers.length === 0 ? (
        <Unavailable className="mt-4" title="No market movement data right now">
          The price service did not return movers for this period. Try another period or check back
          after the next daily snapshot.
        </Unavailable>
      ) : (
        <div className="mt-5 grid gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-[13rem_minmax(0,1fr)_minmax(0,1fr)]">
          {lead ? (
            <button
              type="button"
              onClick={() => openCard(moverToCard(lead))}
              className="group col-span-full flex gap-4 text-left lg:col-span-1 lg:flex-col"
            >
              <div className="w-28 shrink-0 transition-transform duration-150 group-hover:-translate-y-0.5 lg:w-full">
                <CardArt card={moverToCard(lead)} />
              </div>
              <div className="min-w-0">
                <p className="text-meta text-ink-muted">Largest dollar move · {period}</p>
                <p className="mt-0.5 font-medium leading-snug group-hover:underline">
                  {lead.productName}
                </p>
                <p className="truncate text-meta text-ink-muted">{moverSubtitle(lead)}</p>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
                  <Price value={lead.currentPrice} size="md" />
                  <Delta pct={lead.changePercent} />
                </div>
                <p className="mt-0.5 font-mono text-[11.5px] text-ink-muted">
                  from ${lead.previousPrice.toFixed(2)}
                </p>
              </div>
            </button>
          ) : null}
          <MoverColumn
            title={`Rising · ${period}`}
            entries={gainers}
            onOpen={(e) => openCard(moverToCard(e))}
          />
          <MoverColumn
            title={`Falling · ${period}`}
            entries={losers}
            onOpen={(e) => openCard(moverToCard(e))}
          />
        </div>
      )}
    </section>
  );
}

function MoverColumn({
  title,
  entries,
  onOpen,
}: {
  title: string;
  entries: TopMoverEntry[];
  onOpen: (e: TopMoverEntry) => void;
}) {
  return (
    <div className="min-w-0">
      <h3 className="text-h3">{title}</h3>
      {entries.length === 0 ? (
        <p className="mt-2 text-meta text-ink-muted">None over the threshold.</p>
      ) : (
        <ol className="mt-1">
          {entries.map((e, i) => (
            <li key={moverKey(e)}>
              <button
                type="button"
                onClick={() => onOpen(e)}
                className={cn(
                  'grid w-full grid-cols-[1.25rem_2rem_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-rule py-2 text-left hover:bg-surface-hover/60'
                )}
              >
                <span className="font-mono text-[11.5px] text-ink-muted">{i + 1}</span>
                <span className="w-8">
                  <CardArt card={moverToCard(e)} flat />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium">{e.productName}</span>
                  <span className="block truncate text-meta text-ink-muted">
                    {moverSubtitle(e)}
                  </span>
                </span>
                <span className="text-right">
                  <Price value={e.currentPrice} size="sm" className="block" />
                  <Delta pct={e.changePercent} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
