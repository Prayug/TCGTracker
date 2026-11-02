import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PriceHistoryApi, type TopMoverEntry } from '../../services/priceHistoryApi';
import { moverKey, moverSubtitle, moverToCard } from '../../utils/topMovers';
import { useCardModal } from '../../contexts/CardModalContext';
import { useGame } from '../../contexts/GameContext';
import { CardArt } from '../../components/exchange/CardArt';
import { InteractiveCardFan } from '../../components/collectible/InteractiveCardFan';
import { useIsMobileViewport } from '../../hooks/useMotionPreferences';
import { AnimatePresence, motion } from 'motion/react';
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
  const [fanSide, setFanSide] = useState<'up' | 'down'>('up');

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
        <div className="mt-5 grid gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-2">
          {lead ? (
            <MoverFanPanel
              entries={fanSide === 'up' ? gainers : losers}
              side={fanSide}
              onSide={setFanSide}
              period={period}
              onOpen={(e) => openCard(moverToCard(e))}
            />
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

/** A hand of this period's movers; the selected card's move is drawn beside it. */
function MoverFanPanel({
  entries,
  side,
  onSide,
  period,
  onOpen,
}: {
  entries: TopMoverEntry[];
  side: 'up' | 'down';
  onSide: (s: 'up' | 'down') => void;
  period: string;
  onOpen: (e: TopMoverEntry) => void;
}) {
  const mobile = useIsMobileViewport(640);
  const withArt = entries.filter((e) => e.imageSmall || e.imageLarge).slice(0, mobile ? 5 : 7);
  const [selected, setSelected] = useState<string | null>(null);
  const current = withArt.find((e) => moverKey(e) === selected) ?? withArt[0] ?? null;
  const items = withArt.map((e) => ({
    key: moverKey(e),
    card: { ...moverToCard(e), subTypeName: e.subTypeName },
    label: `${e.productName}, ${e.changePercent > 0 ? 'up' : 'down'} ${Math.abs(e.changePercent).toFixed(1)}%`,
  }));
  const max = current ? Math.max(current.currentPrice, current.previousPrice) : 1;

  return (
    <div
      data-theme="dark"
      className="atmo-stage col-span-full overflow-hidden rounded-3xl p-5 text-white sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-[20px] font-semibold">
          The hand this {period === '24h' ? 'day' : period === '7d' ? 'week' : 'month'} dealt
        </p>
        <div className="segmented" role="group" aria-label="Show">
          <button type="button" aria-pressed={side === 'up'} onClick={() => onSide('up')}>
            Rising
          </button>
          <button type="button" aria-pressed={side === 'down'} onClick={() => onSide('down')}>
            Falling
          </button>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="mt-6 text-white/70">
          No {side === 'up' ? 'rising' : 'falling'} cards with artwork this period.
        </p>
      ) : (
        <div className="mt-4 grid items-end gap-8 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <InteractiveCardFan
            items={items}
            selectedKey={current ? moverKey(current) : null}
            onSelect={setSelected}
            cardWidth={mobile ? 104 : 150}
            spread={mobile ? 34 : 44}
            className="mx-auto w-full max-w-[640px]"
          />
          <AnimatePresence mode="wait">
            {current ? (
              <motion.div
                key={moverKey(current)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22 }}
                className="pb-2"
                aria-live="polite"
              >
                <p className="text-[13px] text-white/60">{moverSubtitle(current)}</p>
                <p className="mt-1 font-display text-[clamp(1.5rem,2.6vw,2.2rem)] font-semibold leading-tight">
                  {current.productName}
                </p>
                <div className="mt-3 flex flex-wrap items-baseline gap-3">
                  <Price value={current.currentPrice} size="lg" className="text-white" />
                  <Delta pct={current.changePercent} />
                </div>
                <div className="mt-5 space-y-2" aria-hidden>
                  {[
                    ['Before', current.previousPrice, 'bg-white/35'],
                    [
                      'Now',
                      current.currentPrice,
                      current.changePercent >= 0 ? 'bg-[#3fd3a8]' : 'bg-[#ff7a6b]',
                    ],
                  ].map(([k, v, c]) => (
                    <div
                      key={k as string}
                      className="grid grid-cols-[3.5rem_minmax(0,1fr)_5.5rem] items-center gap-3 text-[12.5px]"
                    >
                      <span className="text-white/60">{k}</span>
                      <motion.span
                        className={cn('h-2.5 rounded-full', c as string)}
                        initial={{ width: 0 }}
                        animate={{ width: `${((v as number) / max) * 100}%` }}
                        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                      />
                      <span className="text-right font-mono tabular-nums">
                        ${(v as number).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[12px] text-white/50">
                  Raw Near Mint market price, {period} change. Drag across the hand or use the arrow
                  keys.
                </p>
                <button type="button" onClick={() => onOpen(current)} className="btn-tactile mt-5">
                  Open {current.productName}
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
