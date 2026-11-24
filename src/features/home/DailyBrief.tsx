import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useVault } from '../../hooks/useVault';
import { useCardModal } from '../../contexts/CardModalContext';
import { cardWishlistService, type WishlistItem } from '../../services/cardWishlistService';
import { unifiedAlertService } from '../../services/unifiedAlertService';
import { PriceHistoryApi, type TopMoverEntry } from '../../services/priceHistoryApi';
import { summarizePortfolio } from '../../utils/portfolio';
import { costStatus, holdingMarketValue } from '../../utils/vaultCost';
import { formatCurrency } from '../../utils/cardDisplay';
import { moverKey, moverSubtitle, moverToCard } from '../../utils/topMovers';
import { openCommandPalette } from '../../components/common/CommandPalette';
import { CardArt } from '../../components/exchange/CardArt';
import { CardTile } from '../../components/exchange/CardTile';
import { Delta, Price } from '../../components/exchange/Price';
import { SectionHeader } from '../../components/exchange/Section';
import { Sparkline } from '../../components/exchange/Sparkline';
import { EmptyState, LoadingRows } from '../../components/exchange/States';
import { cardPath } from '../../components/exchange/paths';
import type { VaultCard } from '../../types/pokemon';
import { moveOver, partOfDay, type Move } from './briefModel';
import { cn } from '@/lib/utils';

const WINDOW_DAYS = 7;
/** Holdings move slowly; a month shows a real change where a week is often flat. */
const VAULT_DAYS = 30;
const TRACKED = 8;

/**
 * Home for a collector with holdings: a short daily brief. The collection's
 * value is stated once, in the opening line. Then what moved in the vault,
 * what needs attention, and the market's biggest moves, each as a ruled list.
 */
export function DailyBrief() {
  const { cards, game } = useVault();
  const summary = useMemo(() => summarizePortfolio(cards), [cards]);
  const today = new Date();

  return (
    <div className="space-y-10">
      <header className="border-b border-rule-strong pb-5">
        <p className="text-meta text-ink-muted">
          {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <h1 className="mt-1 font-display text-h1">Good {partOfDay(today)}</h1>
        <p className="mt-2 max-w-[68ch] text-[14.5px] text-ink-secondary">
          Your {game === 'onepiece' ? 'One Piece' : 'Pokémon'} vault holds{' '}
          {summary.copies.toLocaleString()} card{summary.copies === 1 ? '' : 's'} worth{' '}
          <Price value={summary.marketValue} size="sm" unavailableLabel="an unknown amount" /> at
          today’s market estimate
          {summary.unrealized != null ? (
            <>
              ,{' '}
              <span
                className={cn(
                  'font-mono tabular-nums',
                  summary.unrealized >= 0 ? 'text-gain' : 'text-loss'
                )}
              >
                {formatCurrency(summary.unrealized, { signed: true })}
              </span>{' '}
              on what you recorded paying
            </>
          ) : null}
          .
          {summary.unpricedEntries > 0
            ? ` ${summary.unpricedEntries} holding${summary.unpricedEntries === 1 ? ' has' : 's have'} no price and ${summary.unpricedEntries === 1 ? 'is' : 'are'} left out.`
            : ''}
        </p>
        <nav aria-label="Quick actions" className="mt-4">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[13.5px]">
            <li>
              <Link to="/vault" className="text-accent hover:underline">
                Open the vault
              </Link>
            </li>
            <li>
              <button
                type="button"
                onClick={openCommandPalette}
                className="text-accent hover:underline"
              >
                Add a card
              </button>
            </li>
            <li>
              <Link to="/scanner" className="text-accent hover:underline">
                Scan
              </Link>
            </li>
            <li>
              <Link to="/trade" className="text-accent hover:underline">
                Compare a trade
              </Link>
            </li>
            <li>
              <Link to="/grading" className="text-accent hover:underline">
                Grade
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-14">
        <VaultMoves cards={cards} />
        <Attention cards={cards} game={game} />
      </div>

      <MarketToday />
    </div>
  );
}

/* ───────────── What moved in your vault ───────────── */

const moveCache = new Map<string, Move | null>();

function useHoldingMoves(holdings: VaultCard[]) {
  const key = holdings.map((h) => h.card.id).join(',');
  const [moves, setMoves] = useState<Record<string, Move | null> | null>(() => {
    const hit = holdings.every((h) => moveCache.has(h.card.id));
    return hit
      ? Object.fromEntries(holdings.map((h) => [h.card.id, moveCache.get(h.card.id)!]))
      : null;
  });
  useEffect(() => {
    let alive = true;
    const todo = holdings.filter((h) => !moveCache.has(h.card.id));
    if (!todo.length) {
      setMoves(
        Object.fromEntries(holdings.map((h) => [h.card.id, moveCache.get(h.card.id) ?? null]))
      );
      return;
    }
    (async () => {
      // Two at a time: enough to be quick, gentle on the price service.
      for (let i = 0; i < todo.length; i += 2) {
        await Promise.all(
          todo.slice(i, i + 2).map(async (h) => {
            const c = h.card;
            const hist = await PriceHistoryApi.getPokemonCardPriceHistory({
              id: c.id,
              name: c.name,
              set: c.set,
              number: c.number,
              rarity: c.rarity,
              productId: c.tcgplayer?.productId,
              variant: c.preferredVariant,
            }).catch(() => []);
            moveCache.set(c.id, moveOver(Array.isArray(hist) ? hist : [], VAULT_DAYS));
          })
        );
        if (!alive) return;
      }
      if (alive)
        setMoves(
          Object.fromEntries(holdings.map((h) => [h.card.id, moveCache.get(h.card.id) ?? null]))
        );
    })();
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return moves;
}

function VaultMoves({ cards }: { cards: VaultCard[] }) {
  const { openCard } = useCardModal();
  const holdings = useMemo(
    () =>
      [...cards]
        .filter((c) => (c.game ?? 'pokemon') === 'pokemon' && holdingMarketValue(c) > 0)
        .sort((a, b) => holdingMarketValue(b) - holdingMarketValue(a))
        .slice(0, TRACKED),
    [cards]
  );
  const moves = useHoldingMoves(holdings);
  const rows = useMemo(() => {
    if (!moves) return [];
    return holdings
      .map((h) => ({ h, m: moves[h.card.id] }))
      .sort((a, b) => Math.abs(b.m?.pct ?? 0) - Math.abs(a.m?.pct ?? 0));
  }, [holdings, moves]);
  const unknown = rows.filter((r) => !r.m).length;

  return (
    <section aria-labelledby="vault-moves-h" className="min-w-0">
      <SectionHeader
        id="vault-moves-h"
        title="What moved in your vault"
        note={`Your ${holdings.length} most valuable holdings · ${VAULT_DAYS}-day change in market price`}
        action={{ to: '/vault?mode=holdings', label: 'All holdings' }}
      />
      {holdings.length === 0 ? (
        <EmptyState title="No priced holdings yet">
          Prices appear once a holding matches a catalog card with a market price.
        </EmptyState>
      ) : !moves ? (
        <LoadingRows rows={Math.min(5, holdings.length)} art label="Loading price history" />
      ) : (
        <>
          <ul className="divide-y divide-rule">
            {rows.map(({ h, m }) => (
              <li key={h.id}>
                <CardTile
                  card={h.card}
                  density="row"
                  onSelect={() => openCard(h.card)}
                  meta={`${h.card.set?.name ?? ''}${h.quantity > 1 ? ` · ×${h.quantity}` : ''}`}
                  figure={<Price value={holdingMarketValue(h)} size="sm" />}
                  aside={
                    <span className="flex items-center gap-2">
                      {m && Math.abs(m.pct) >= 0.05 ? (
                        <>
                          <Sparkline values={m.series} width={56} height={16} />
                          <Delta pct={m.pct} />
                        </>
                      ) : (
                        <span className="text-meta text-ink-muted">
                          {m ? 'Unchanged' : 'No price history'}
                        </span>
                      )}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
          {rows.length > 0 && rows.every(({ m }) => !m || Math.abs(m.pct) < 0.05) ? (
            <p className="mt-2 text-[11.5px] text-ink-muted">
              None of these market prices has changed in {VAULT_DAYS} days.
            </p>
          ) : null}
          {unknown > 0 ? (
            <p className="mt-2 text-[11.5px] text-ink-muted">
              {unknown} holding{unknown === 1 ? ' has' : 's have'} no price history reaching back{' '}
              {VAULT_DAYS} days.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/* ───────────── Needs attention ───────────── */

interface Item {
  key: string;
  title: string;
  detail: string;
  to: string;
  cta: string;
  tone: string;
  art?: VaultCard['card'];
}

function useAttention(cards: VaultCard[], game: 'pokemon' | 'onepiece'): Item[] {
  const [atTarget, setAtTarget] = useState<WishlistItem[]>([]);
  const [alerts, setAlerts] = useState(0);
  useEffect(() => {
    const sync = () => {
      setAtTarget(cardWishlistService.getAtTarget(game));
      setAlerts(unifiedAlertService.getUnreadDigestCount());
    };
    sync();
    window.addEventListener('tcg:wishlist-updated', sync);
    window.addEventListener('tcg:alert-digest-updated', sync);
    return () => {
      window.removeEventListener('tcg:wishlist-updated', sync);
      window.removeEventListener('tcg:alert-digest-updated', sync);
    };
  }, [game]);

  return useMemo(() => {
    const out: Item[] = [];
    if (alerts > 0)
      out.push({
        key: 'alerts',
        title: `${alerts} price alert${alerts === 1 ? '' : 's'} triggered`,
        detail: 'Cards that crossed the thresholds you set.',
        to: '/wishlist',
        cta: 'See which',
        tone: 'bg-accent',
      });
    atTarget.slice(0, 3).forEach((w) =>
      out.push({
        key: `wish-${w.id}`,
        title: `${w.card.name} is at your target`,
        detail: `At or under ${formatCurrency(w.targetPrice ?? 0)}${w.card.set?.name ? ` · ${w.card.set.name}` : ''}`,
        to: cardPath(w.card.id),
        cta: 'Review',
        tone: 'bg-gain',
        art: w.card as VaultCard['card'],
      })
    );

    const noCost = cards.filter((c) => costStatus(c) !== 'recorded');
    if (noCost.length)
      out.push({
        key: 'cost',
        title: `${noCost.length} holding${noCost.length === 1 ? '' : 's'} without a purchase price`,
        detail: `${formatCurrency(noCost.reduce((s, c) => s + holdingMarketValue(c), 0))} of value left out of profit and loss.`,
        to: '/vault?mode=holdings',
        cta: 'Add prices',
        tone: 'bg-warn',
      });

    const grade = cards
      .filter(
        (c) =>
          c.condition !== 'damaged' && !c.gradingResult && holdingMarketValue(c) / c.quantity >= 40
      )
      .sort((a, b) => holdingMarketValue(b) - holdingMarketValue(a));
    if (grade.length)
      out.push({
        key: 'grade',
        title: `${grade.length} raw card${grade.length === 1 ? '' : 's'} worth $40 or more`,
        detail: `Not photo-graded yet, starting with ${grade[0].card.name}. Check whether grading pays after fees.`,
        to: cardPath(grade[0].card.id) + '#grading',
        cta: 'Run the numbers',
        tone: 'bg-gold',
        art: grade[0].card,
      });

    const bySet = new Map<string, { name: string; total: number; ids: Set<string>; id: string }>();
    cards.forEach((c) => {
      const s = c.card.set;
      if (!s?.id || !s.total) return;
      const slot = bySet.get(s.id) ?? { name: s.name, total: s.total, ids: new Set(), id: s.id };
      slot.ids.add(c.card.number || c.card.id);
      bySet.set(s.id, slot);
    });
    const best = [...bySet.values()].sort((a, b) => b.ids.size / b.total - a.ids.size / a.total)[0];
    if (best && best.ids.size >= 3)
      out.push({
        key: 'set',
        title: `${best.name}: ${best.ids.size} of ${best.total}`,
        detail: `${Math.round((best.ids.size / best.total) * 100)}% complete by card number.`,
        to: `/sets/${encodeURIComponent(best.id)}`,
        cta: 'See what’s missing',
        tone: 'bg-ink-muted',
      });
    return out;
  }, [cards, atTarget, alerts]);
}

function Attention({ cards, game }: { cards: VaultCard[]; game: 'pokemon' | 'onepiece' }) {
  const items = useAttention(cards, game);
  return (
    <section aria-labelledby="attention-h" className="min-w-0">
      <SectionHeader id="attention-h" title="Needs your attention" />
      {items.length === 0 ? (
        <p className="py-3 text-[13.5px] text-ink-secondary">
          Nothing today. Set target prices on wishlist cards to hear when they hit.
        </p>
      ) : (
        <ul className="divide-y divide-rule">
          {items.map((it) => (
            <li key={it.key}>
              <Link to={it.to} className="group flex items-start gap-3 py-3">
                {it.art ? (
                  <span className="w-8 shrink-0">
                    <CardArt card={it.art} flat alt="" />
                  </span>
                ) : (
                  <span className="grid w-8 shrink-0 place-items-center pt-1.5" aria-hidden>
                    <span className={cn('h-2 w-2 rounded-full', it.tone)} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-ink-primary">
                    {it.title}
                  </span>
                  <span className="block text-[12.5px] text-ink-muted">{it.detail}</span>
                </span>
                <span className="shrink-0 pt-0.5 text-[12.5px] text-accent group-hover:underline">
                  {it.cta}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ───────────── Market today ───────────── */

const MIN_PRICE = 5;

function MarketToday() {
  const { openCard } = useCardModal();
  const [data, setData] = useState<{
    gainers: TopMoverEntry[];
    losers: TopMoverEntry[];
    date: string | null;
  } | null>(() => PriceHistoryApi.peekTopMovers(WINDOW_DAYS, 50));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    PriceHistoryApi.getTopMovers(WINDOW_DAYS, 50)
      .then(
        (r) => alive && setData({ gainers: r.gainers ?? [], losers: r.losers ?? [], date: r.date })
      )
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const pick = (list: TopMoverEntry[], up: boolean) => {
    const seen = new Set<string>();
    return list
      .filter((e) => {
        const k = moverKey(e);
        if (
          seen.has(k) ||
          !e.cardNumber || // singles only: sealed product moves on different news
          !(e.currentPrice >= MIN_PRICE) ||
          !Number.isFinite(e.changePercent)
        )
          return false;
        seen.add(k);
        return up ? e.changePercent > 0 : e.changePercent < 0;
      })
      .sort(
        (a, b) =>
          // Rank by dollars moved, so a $5 card doubling doesn't lead.
          Math.abs(b.currentPrice - b.previousPrice) - Math.abs(a.currentPrice - a.previousPrice)
      )
      .slice(0, 5);
  };
  const up = data ? pick(data.gainers, true) : [];
  const down = data ? pick(data.losers, false) : [];
  const asOf = data?.date
    ? new Date(data.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  const column = (title: string, rows: TopMoverEntry[]) => (
    <div className="min-w-0">
      <h3 className="text-h3 text-ink-secondary">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-3 text-[13px] text-ink-muted">Nothing over ${MIN_PRICE} moved this way.</p>
      ) : (
        <ul className="mt-1 divide-y divide-rule">
          {rows.map((e) => {
            const card = moverToCard(e);
            return (
              <li key={moverKey(e)}>
                <CardTile
                  card={card}
                  density="row"
                  onSelect={() => openCard(card)}
                  meta={moverSubtitle(e)}
                  figure={<Price value={e.currentPrice} size="sm" />}
                  aside={<Delta pct={e.changePercent} amount={e.currentPrice - e.previousPrice} />}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <section aria-labelledby="market-today-h">
      <SectionHeader
        id="market-today-h"
        title="Market this week"
        note={`Single cards over $${MIN_PRICE}, TCGplayer market price, ranked by dollars moved${asOf ? ` · as of ${asOf}` : ''}`}
        action={{ to: '/money-flow', label: 'Market overview' }}
      />
      {!data && !failed ? (
        <LoadingRows className="mt-2" rows={5} art label="Loading market movers" />
      ) : failed && !data ? (
        <p className="py-3 text-[13px] text-ink-muted">
          Market prices didn’t load. Try again later.
        </p>
      ) : (
        <div className="mt-3 grid gap-8 md:grid-cols-2">
          {column('Rising', up)}
          {column('Falling', down)}
        </div>
      )}
    </section>
  );
}
