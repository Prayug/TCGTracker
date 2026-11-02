import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useVault } from '../../hooks/useVault';
import { useCardModal } from '../../contexts/CardModalContext';
import { useSetReleaseDates } from '../../hooks/useSetReleaseDates';
import { cardWishlistService, type WishlistItem } from '../../services/cardWishlistService';
import { unifiedAlertService } from '../../services/unifiedAlertService';
import {
  allocateBy,
  byEraWith,
  bySet,
  concentration,
  summarizePortfolio,
} from '../../utils/portfolio';
import { costStatus, holdingMarketValue } from '../../utils/vaultCost';
import { formatCurrency } from '../../utils/cardDisplay';
import { openCommandPalette } from '../../components/common/CommandPalette';
import { CardArt } from '../../components/exchange/CardArt';
import { CoverageMeter } from '../../components/exchange/CoverageMeter';
import { Delta, Price } from '../../components/exchange/Price';
import { HolographicCard } from '../../components/collectible/HolographicCard';
import type { VaultCard } from '../../types/pokemon';
import { cn } from '@/lib/utils';

const ERA_COLORS: Record<string, string> = {
  Vintage: '#c4892b',
  'Mid-era': '#1fb38a',
  Modern: '#2f56e6',
  Unknown: '#8d93a0',
};
const SET_COLORS = ['#2f56e6', '#e3a73a', '#1fb38a', '#a06cf0', '#8d93a0'];

/**
 * The signed-in home: what was added lately on a stage of its own, the
 * collection's figures in a compact panel beside it, a strip of the four
 * everyday actions, and opportunities drawn from the user's own cards.
 */
export function CollectionDashboard() {
  const { cards, activity, game } = useVault();
  const setDates = useSetReleaseDates(game === 'pokemon');
  const summary = useMemo(() => summarizePortfolio(cards), [cards]);
  const recent = useMemo(
    () =>
      [...cards]
        .filter((c) => c.purchaseDate)
        .sort((a, b) => Date.parse(b.purchaseDate) - Date.parse(a.purchaseDate))
        .slice(0, 6),
    [cards]
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-[clamp(1.5rem,2.4vw,2rem)] font-semibold tracking-[-0.02em]">
          Today in your collection
        </h2>
        <Link to="/vault" className="text-[13px] text-accent hover:underline">
          Open the vault · {summary.entries} holdings
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <RecentStage recent={recent} activity={activity} />
        <Performance cards={cards} setDates={setDates} />
      </div>

      <QuickActions />
      <Opportunities cards={cards} game={game} />
    </div>
  );
}

/* ───────────── Recent additions on a stage ───────────── */

function RecentStage({
  recent,
  activity,
}: {
  recent: VaultCard[];
  activity: ReturnType<typeof useVault>['activity'];
}) {
  const { openCard } = useCardModal();
  const reduce = useReducedMotion();
  const [pick, setPick] = useState(0);
  const active = recent[Math.min(pick, recent.length - 1)];
  if (!active) return null;
  const value = holdingMarketValue(active);
  const status = costStatus(active);
  const added = new Date(active.purchaseDate);
  const lastEvent = activity[0];

  return (
    <section
      data-theme="dark"
      aria-labelledby="recent-h"
      className="atmo-stage relative overflow-hidden rounded-3xl p-5 text-white sm:p-7"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3
          id="recent-h"
          className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-white/60"
        >
          Latest additions
        </h3>
        {lastEvent ? (
          <p className="text-[12px] text-white/50">
            Last change {new Date(lastEvent.at).toLocaleDateString()}
            {lastEvent.cardName ? ` · ${lastEvent.cardName}` : ''}
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid items-center gap-6 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
        <div className="mx-auto w-40 sm:w-full">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active.id}
              initial={reduce ? false : { opacity: 0, y: 14, rotate: -2 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
              transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <HolographicCard
                card={active.card}
                level="showcase"
                size="large"
                onSelect={() => openCard(active.card)}
                label={`Inspect ${active.card.name}`}
              />
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="min-w-0" aria-live="polite">
          <p className="text-[13px] text-white/60">
            {active.card.set?.name}
            {active.card.number ? ` · #${active.card.number}` : ''}
          </p>
          <p className="mt-0.5 font-display text-[clamp(1.6rem,3vw,2.3rem)] font-semibold leading-tight tracking-[-0.02em]">
            {active.card.name}
          </p>
          <p className="mt-3 font-mono text-[28px] font-medium tabular-nums">
            {value > 0 ? formatCurrency(value) : 'Not priced'}
            {active.quantity > 1 ? (
              <span className="ml-2 text-[14px] text-white/55">×{active.quantity}</span>
            ) : null}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[12.5px]">
            <div>
              <dt className="text-white/50">Added</dt>
              <dd>{Number.isNaN(added.getTime()) ? 'No date' : added.toLocaleDateString()}</dd>
            </div>
            <div>
              <dt className="text-white/50">Paid</dt>
              <dd>
                {status === 'recorded' ? (
                  formatCurrency(active.purchasePrice * active.quantity)
                ) : status === 'unverified' ? (
                  <span className="text-[#f0bd55]">Unverified</span>
                ) : (
                  <span className="text-white/60">Not recorded</span>
                )}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => openCard(active.card)}
            className="mt-5 inline-flex h-9 items-center rounded-full bg-white px-4 text-[13px] font-medium text-[#0b0e14] hover:bg-white/90"
          >
            Inspect card
          </button>
        </div>
      </div>

      {recent.length > 1 ? (
        <ul
          className="scrollbar-none -mx-1 mt-6 flex gap-2 overflow-x-auto px-1 pb-1"
          aria-label="Recently added holdings"
        >
          {recent.map((vc, i) => (
            <li key={vc.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setPick(i)}
                aria-pressed={vc.id === active.id}
                aria-label={`Show ${vc.card.name}`}
                className={cn(
                  'block w-12 rounded-[6px] transition-[transform,opacity] duration-200',
                  vc.id === active.id
                    ? '-translate-y-1 opacity-100 ring-2 ring-white'
                    : 'opacity-60 hover:opacity-100'
                )}
              >
                <CardArt card={vc.card} flat alt="" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/* ───────────── Compact performance ───────────── */

function Performance({
  cards,
  setDates,
}: {
  cards: VaultCard[];
  setDates: ReadonlyMap<string, string>;
}) {
  const summary = useMemo(() => summarizePortfolio(cards), [cards]);
  const conc = useMemo(() => concentration(cards, 5), [cards]);
  const eraKey = useMemo(() => byEraWith(setDates), [setDates]);
  const eras = useMemo(() => allocateBy(cards, eraKey, 4), [cards, eraKey]);
  const sets = useMemo(() => allocateBy(cards, bySet, 4), [cards]);

  return (
    <section
      aria-labelledby="perf-h"
      className="rounded-3xl border border-border-default bg-surface-raised p-5 sm:p-6"
    >
      <h3 id="perf-h" className="text-[13px] font-medium text-ink-secondary">
        Collection value
      </h3>
      <Price
        value={summary.marketValue}
        size="xl"
        className="mt-1 block"
        unavailableLabel="Not priced yet"
      />
      <p className="mt-1 text-meta text-ink-muted">
        Market estimate · {summary.copies.toLocaleString()} cards
        {summary.unpricedEntries > 0 ? ` · ${summary.unpricedEntries} unpriced` : ''}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
        <div className="border-t border-rule pt-2">
          <dt className="text-meta text-ink-muted">Unrealised P/L</dt>
          <dd className="mt-0.5">
            {summary.unrealized == null ? (
              <span className="text-[13px] text-ink-muted">Needs purchase prices</span>
            ) : (
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span
                  className={cn(
                    'font-mono text-[18px] font-medium tabular-nums',
                    summary.unrealized >= 0 ? 'text-gain' : 'text-loss'
                  )}
                >
                  {formatCurrency(summary.unrealized, { signed: true })}
                </span>
                {summary.unrealizedPct != null ? <Delta pct={summary.unrealizedPct} /> : null}
              </span>
            )}
          </dd>
        </div>
        <div className="border-t border-rule pt-2">
          <dt className="text-meta text-ink-muted">Cost recorded</dt>
          <dd className="mt-1">
            <CoverageMeter value={summary.costCoverage} />
            <span className="mt-1 block font-mono text-[12px] tabular-nums text-ink-secondary">
              {Math.round(summary.costCoverage * 100)}% of value
            </span>
          </dd>
        </div>
      </dl>
      {summary.unrealized != null && summary.costCoverage < 0.999 ? (
        <p className="mt-2 text-[11.5px] text-ink-muted">
          P/L covers {formatCurrency(summary.knownCostMarket)} of{' '}
          {formatCurrency(summary.marketValue)}, the holdings with a recorded cost.
        </p>
      ) : null}

      <Breakdown title="By era" slices={eras} colorOf={(k) => ERA_COLORS[k] ?? '#8d93a0'} />
      <Breakdown
        title="By set"
        slices={sets}
        colorOf={(_, i) => SET_COLORS[i % SET_COLORS.length]}
      />
      <p className="mt-3 text-[11.5px] text-ink-muted">
        Top five holdings are {Math.round(conc * 100)}% of the value. Values are today’s prices; no
        past valuations are stored.
      </p>
    </section>
  );
}

function Breakdown({
  title,
  slices,
  colorOf,
}: {
  title: string;
  slices: ReturnType<typeof allocateBy>;
  colorOf: (key: string, i: number) => string;
}) {
  if (!slices.length) return null;
  return (
    <div className="mt-4">
      <p className="text-meta text-ink-muted">{title}</p>
      <div
        className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-surface-inset"
        role="img"
        aria-label={`${title}: ${slices.map((s) => `${s.label} ${Math.round(s.share * 100)}%`).join(', ')}`}
      >
        {slices.map((s, i) => (
          <motion.span
            key={s.key}
            className="h-full"
            style={{ background: colorOf(s.key, i) }}
            initial={{ width: 0 }}
            animate={{ width: `${s.share * 100}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 22 }}
          />
        ))}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-ink-secondary">
        {slices.map((s, i) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: colorOf(s.key, i) }} />
            <span className="max-w-[9rem] truncate">{s.label}</span>
            <span className="font-mono text-ink-muted">{Math.round(s.share * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────── Quick actions ───────────── */

const ACTION_ICONS = {
  scan: (
    <>
      <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
      <rect x="8.5" y="7.5" width="7" height="9" rx="1" />
    </>
  ),
  add: (
    <>
      <rect x="5" y="4" width="10" height="14" rx="1.5" />
      <path d="M18 12v8M14 16h8" />
    </>
  ),
  trade: (
    <>
      <rect x="3" y="6" width="7" height="10" rx="1" />
      <rect x="14" y="8" width="7" height="10" rx="1" />
      <path d="M8 3h7l-2-2M16 21H9l2 2" />
    </>
  ),
  grade: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="1.5" />
      <path d="M6 7h12" />
      <rect x="8.5" y="9.5" width="7" height="8.5" rx="0.5" />
    </>
  ),
};

function QuickActions() {
  const items: {
    key: keyof typeof ACTION_ICONS;
    label: string;
    hint: string;
    to?: string;
    onClick?: () => void;
  }[] = [
    { key: 'scan', label: 'Scan', hint: 'Camera, upload or phone', to: '/scanner' },
    { key: 'add', label: 'Add card', hint: 'Search the catalog', onClick: openCommandPalette },
    { key: 'trade', label: 'Compare trade', hint: 'Both sides at live prices', to: '/trade' },
    { key: 'grade', label: 'Grade', hint: 'Photo grade and fee math', to: '/grading' },
  ];
  return (
    <nav aria-label="Quick actions">
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map((it) => {
          const body = (
            <>
              <svg
                viewBox="0 0 24 24"
                className="h-7 w-7 shrink-0 text-accent transition-transform duration-200 group-hover:-translate-y-0.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                {ACTION_ICONS[it.key]}
              </svg>
              <span className="min-w-0">
                <span className="block text-[14.5px] font-semibold">{it.label}</span>
                <span className="block truncate text-[12px] text-ink-muted">{it.hint}</span>
              </span>
            </>
          );
          const cls =
            'group flex h-full w-full items-center gap-3 rounded-2xl border border-border-default bg-surface-raised px-4 py-3.5 text-left transition-colors hover:border-ink-muted';
          return (
            <li key={it.key}>
              {it.to ? (
                <Link to={it.to} className={cls}>
                  {body}
                </Link>
              ) : (
                <button type="button" onClick={it.onClick} className={cls}>
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ───────────── Opportunities from the user's own cards ───────────── */

interface Opportunity {
  key: string;
  tag: string;
  tone: string;
  title: string;
  detail: string;
  to: string;
  cta: string;
  art: VaultCard['card'][];
}

function useOpportunities(cards: VaultCard[], game: 'pokemon' | 'onepiece'): Opportunity[] {
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
    const out: Opportunity[] = [];
    atTarget.slice(0, 2).forEach((w) =>
      out.push({
        key: `wish-${w.id}`,
        tag: 'Wishlist hit',
        tone: 'text-gain',
        title: `${w.card.name} is at your target`,
        detail: `At or under ${formatCurrency(w.targetPrice ?? 0)}${w.card.set?.name ? ` · ${w.card.set.name}` : ''}`,
        to: `/card/${encodeURIComponent(w.card.id)}`,
        cta: 'Review',
        art: [w.card as VaultCard['card']],
      })
    );

    // Raw copies at $40+ never photo-graded.
    const grade = cards
      .filter(
        (c) =>
          c.condition !== 'damaged' && !c.gradingResult && holdingMarketValue(c) / c.quantity >= 40
      )
      .sort((a, b) => holdingMarketValue(b) - holdingMarketValue(a));
    if (grade.length)
      out.push({
        key: 'grade',
        tag: 'Grading review',
        tone: 'text-gold',
        title: `${grade.length} raw card${grade.length === 1 ? '' : 's'} at $40+`,
        detail: 'Not photo-graded yet. Check the grading economics before submitting.',
        to: '/grading',
        cta: 'Estimate',
        art: grade.slice(0, 3).map((g) => g.card),
      });

    const noCost = cards
      .filter((c) => costStatus(c) !== 'recorded')
      .sort((a, b) => holdingMarketValue(b) - holdingMarketValue(a));
    if (noCost.length) {
      const unverified = noCost.filter((c) => costStatus(c) === 'unverified').length;
      out.push({
        key: 'cost',
        tag: 'Cost review',
        tone: 'text-warn',
        title: `${noCost.length} holding${noCost.length === 1 ? '' : 's'} without a recorded cost`,
        detail: `${formatCurrency(noCost.reduce((s, c) => s + holdingMarketValue(c), 0))} left out of P/L${unverified ? `, ${unverified} with an unverified import price` : ''}.`,
        to: '/vault?mode=portfolio',
        cta: 'Review',
        art: noCost.slice(0, 3).map((c) => c.card),
      });
    }

    const bySet = new Map<
      string,
      { name: string; total: number; ids: Set<string>; id: string; art: VaultCard['card'][] }
    >();
    cards.forEach((c) => {
      const s = c.card.set;
      if (!s?.id || !s.total) return;
      const slot = bySet.get(s.id) ?? {
        name: s.name,
        total: s.total,
        ids: new Set(),
        id: s.id,
        art: [],
      };
      slot.ids.add(c.card.number || c.card.id);
      if (slot.art.length < 3) slot.art.push(c.card);
      bySet.set(s.id, slot);
    });
    const best = [...bySet.values()].sort((a, b) => b.ids.size / b.total - a.ids.size / a.total)[0];
    if (best && best.ids.size >= 3)
      out.push({
        key: 'set',
        tag: 'Set progress',
        tone: 'text-accent',
        title: `${best.name}: ${best.ids.size} of ${best.total}`,
        detail: `${Math.round((best.ids.size / best.total) * 100)}% complete by card number.`,
        to: `/sets/${encodeURIComponent(best.id)}`,
        cta: 'See gaps',
        art: best.art,
      });

    if (alerts > 0)
      out.push({
        key: 'alerts',
        tag: 'Price alert',
        tone: 'text-accent',
        title: `${alerts} price alert${alerts === 1 ? '' : 's'} triggered`,
        detail: 'Open the bell in the header to see which cards crossed their thresholds.',
        to: '/wishlist',
        cta: 'Wishlist',
        art: [],
      });
    return out;
  }, [cards, atTarget, alerts]);
}

function Opportunities({ cards, game }: { cards: VaultCard[]; game: 'pokemon' | 'onepiece' }) {
  const items = useOpportunities(cards, game);
  return (
    <section aria-labelledby="opps-h">
      <div className="flex items-end justify-between border-b border-rule-strong pb-2">
        <h3 id="opps-h" className="font-display text-[22px] font-medium leading-tight">
          Collection opportunities
        </h3>
        <span className="hidden text-meta text-ink-muted sm:inline">
          From your holdings, wishlist and alerts
        </span>
      </div>
      {items.length === 0 ? (
        <p className="py-4 text-[13.5px] text-ink-secondary">
          Nothing needs attention. Add target prices to wishlist cards to be told when they hit.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {items.map((o) => (
            <li key={o.key}>
              <Link
                to={o.to}
                className="group flex h-full flex-col rounded-2xl border border-border-default bg-surface-raised p-3 transition-colors hover:border-ink-muted sm:p-4"
              >
                {o.art.length ? (
                  <span
                    className="relative mb-3 [--fan-step:30px] sm:[--fan-step:44px] flex h-20 items-end justify-center sm:mb-4 sm:h-28"
                    aria-hidden
                  >
                    {o.art.map((c, i) => (
                      <span
                        key={`${c.id}-${i}`}
                        className="absolute bottom-0 w-[3.2rem] sm:w-[4.6rem]"
                        style={{
                          transform: `translateX(calc(${i - (o.art.length - 1) / 2} * var(--fan-step, 30px))) rotate(${(i - (o.art.length - 1) / 2) * 7}deg)`,
                          zIndex: o.art.length - Math.abs(i - (o.art.length - 1) / 2),
                        }}
                      >
                        <CardArt card={c} alt="" />
                      </span>
                    ))}
                  </span>
                ) : null}
                <span className={cn('text-[12px] font-medium', o.tone)}>{o.tag}</span>
                <span className="mt-0.5 block text-[13.5px] font-medium sm:text-[14.5px]">
                  {o.title}
                </span>
                <span className="mt-1 block flex-1 text-[12.5px] text-ink-muted">{o.detail}</span>
                <span className="mt-3 text-[13px] text-accent group-hover:underline">
                  {o.cta} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
