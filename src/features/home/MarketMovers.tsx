import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PriceHistoryApi, type TopMoverEntry } from '../../services/priceHistoryApi';
import { moverKey, moverSubtitle, moverToCard } from '../../utils/topMovers';
import { useCardModal } from '../../contexts/CardModalContext';
import { useGame } from '../../contexts/GameContext';
import { CardArt } from '../../components/exchange/CardArt';
import { InteractiveCardFan } from '../../components/collectible/InteractiveCardFan';
import { useIsMobileViewport } from '../../hooks/useMotionPreferences';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
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
  const [selected, setSelected] = useState<string | null>(null);

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
    return { gainers: g.slice(0, 12), losers: l.slice(0, 12), lead: leadEntry ?? null };
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
        <div className="mt-5 space-y-6">
          {lead ? (
            <MoverFanPanel
              entries={fanSide === 'up' ? gainers : losers}
              side={fanSide}
              onSide={(v) => {
                setFanSide(v);
                setSelected(null);
              }}
              selected={selected}
              onSelect={setSelected}
              period={period}
              onOpen={(e) => openCard(moverToCard(e))}
            />
          ) : null}
          <MoverGallery
            entries={fanSide === 'up' ? gainers : losers}
            side={fanSide}
            period={period}
            selected={selected}
            onSelect={(k) => {
              setSelected(k);
              document
                .getElementById('movers-h')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
        </div>
      )}
    </section>
  );
}

/**
 * Every mover of the chosen side as a card, not a row: art first, then the
 * move drawn as two bars. Selecting one brings it to the front of the hand.
 */
function MoverGallery({
  entries,
  side,
  period,
  selected,
  onSelect,
}: {
  entries: TopMoverEntry[];
  side: 'up' | 'down';
  period: string;
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const reduce = useReducedMotion();
  if (entries.length === 0)
    return (
      <p className="text-meta text-ink-muted">
        No {side === 'up' ? 'rising' : 'falling'} cards over the threshold this period.
      </p>
    );
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="text-h3">
          {side === 'up' ? 'Rising' : 'Falling'} · {period}
        </h3>
        <Link to="/money-flow" className="text-[13px] text-accent hover:underline">
          All of the market →
        </Link>
      </div>
      <motion.ul
        key={side}
        className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6"
        initial={reduce ? false : { opacity: 0, x: side === 'up' ? -16 : 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {(entries.length > 6 ? entries.slice(0, Math.floor(entries.length / 6) * 6) : entries).map(
          (e) => {
            const k = moverKey(e);
            const max = Math.max(e.currentPrice, e.previousPrice, 0.01);
            const active = selected === k;
            return (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => onSelect(k)}
                  aria-pressed={active}
                  aria-label={`${e.productName}, ${e.changePercent > 0 ? 'up' : 'down'} ${Math.abs(e.changePercent).toFixed(1)}% to $${e.currentPrice.toFixed(2)}. Show in the hand.`}
                  className={cn(
                    'group block w-full rounded-xl p-1.5 text-left transition-colors',
                    active ? 'bg-surface-hover ring-1 ring-ink-muted' : 'hover:bg-surface-hover/70'
                  )}
                >
                  <span className="relative block">
                    <CardArt
                      card={moverToCard(e)}
                      alt=""
                      className="transition-transform duration-200 group-hover:-translate-y-0.5"
                    />
                    <span
                      className={cn(
                        'absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-white shadow',
                        e.changePercent >= 0 ? 'bg-[#0f8a66]' : 'bg-[#c2402f]'
                      )}
                    >
                      {e.changePercent > 0 ? '+' : ''}
                      {e.changePercent.toFixed(1)}%
                    </span>
                  </span>
                  <span className="mt-2 block truncate text-[12.5px] font-medium">
                    {e.productName}
                  </span>
                  <span className="block truncate text-[11px] text-ink-muted">
                    {moverSubtitle(e)}
                  </span>
                  <span className="mt-1.5 block space-y-1" aria-hidden>
                    <span
                      className="block h-1 rounded-full bg-rule-strong"
                      style={{ width: `${(e.previousPrice / max) * 100}%` }}
                    />
                    <span
                      className={cn(
                        'block h-1 rounded-full',
                        e.changePercent >= 0 ? 'bg-gain' : 'bg-loss'
                      )}
                      style={{ width: `${(e.currentPrice / max) * 100}%` }}
                    />
                  </span>
                  <span className="mt-1 flex items-baseline justify-between font-mono text-[11px] tabular-nums">
                    <span className="text-ink-muted">${e.previousPrice.toFixed(2)}</span>
                    <span>${e.currentPrice.toFixed(2)}</span>
                  </span>
                </button>
              </li>
            );
          }
        )}
      </motion.ul>
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
  selected,
  onSelect,
}: {
  entries: TopMoverEntry[];
  side: 'up' | 'down';
  onSide: (s: 'up' | 'down') => void;
  selected: string | null;
  onSelect: (key: string | null) => void;
  period: string;
  onOpen: (e: TopMoverEntry) => void;
}) {
  const mobile = useIsMobileViewport(640);
  const all = entries.filter((e) => e.imageSmall || e.imageLarge);
  const head = all.slice(0, mobile ? 5 : 7);
  // A card picked in the gallery joins the hand if it is not already in it.
  const extra =
    selected && !head.some((e) => moverKey(e) === selected)
      ? all.find((e) => moverKey(e) === selected)
      : undefined;
  const withArt = extra ? [...head.slice(0, -1), extra] : head;
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
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3">
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
        <div className="mt-10 grid items-end gap-8 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <InteractiveCardFan
            items={items}
            selectedKey={current ? moverKey(current) : null}
            onSelect={onSelect}
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
