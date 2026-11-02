import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Camera, Plus, Scale } from 'lucide-react';
import { useVault } from '../../hooks/useVault';
import { useAuth } from '../../hooks/useAuth';
import { useGame } from '../../contexts/GameContext';
import { useCardModal } from '../../contexts/CardModalContext';
import { cardWishlistService, type WishlistItem } from '../../services/cardWishlistService';
import { unifiedAlertService } from '../../services/unifiedAlertService';
import {
  allocateBy,
  byEra,
  bySet,
  concentration,
  summarizePortfolio,
  topHoldings,
} from '../../utils/portfolio';
import { holdingMarketValue, hasKnownCost } from '../../utils/vaultCost';
import { formatCurrency } from '../../utils/cardDisplay';
import { openCommandPalette } from '../../components/common/CommandPalette';
import { AllocationBars } from '../../components/exchange/AllocationBars';
import { CardArt } from '../../components/exchange/CardArt';
import { Delta, Price } from '../../components/exchange/Price';
import { CardLookup } from './CardLookup';
import { MarketMovers } from './MarketMovers';
import type { VaultCard } from '../../types/pokemon';
import { cn } from '@/lib/utils';

export function HomePage() {
  const { cards } = useVault();
  return (
    <div className="mx-auto w-full max-w-[1520px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      {cards.length > 0 ? <CommandCenter /> : <VisitorHome />}
      <div className="mt-14">
        <MarketMovers />
      </div>
    </div>
  );
}

/* ───────────────────────── Signed-in / has holdings ───────────────────────── */

function greeting(name?: string | null) {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name}` : part;
}

function CommandCenter() {
  const { cards, activity, game } = useVault();
  const { user } = useAuth();
  const { openCard } = useCardModal();
  const navigate = useNavigate();
  const [groupBy, setGroupBy] = useState<'set' | 'era'>('set');
  const summary = useMemo(() => summarizePortfolio(cards), [cards]);
  const slices = useMemo(
    () => allocateBy(cards, groupBy === 'set' ? bySet : byEra, 5),
    [cards, groupBy]
  );
  const top = useMemo(() => topHoldings(cards, 4), [cards]);
  const conc = useMemo(() => concentration(cards, 5), [cards]);

  const [atTarget, setAtTarget] = useState<WishlistItem[]>([]);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  useEffect(() => {
    const sync = () => {
      setAtTarget(cardWishlistService.getAtTarget(game));
      setUnreadAlerts(unifiedAlertService.getUnreadDigestCount());
    };
    sync();
    window.addEventListener('tcg:wishlist-updated', sync);
    window.addEventListener('tcg:alert-digest-updated', sync);
    return () => {
      window.removeEventListener('tcg:wishlist-updated', sync);
      window.removeEventListener('tcg:alert-digest-updated', sync);
    };
  }, [game]);

  const coveragePct = Math.round(summary.costCoverage * 100);
  const briefing = useBriefing(cards, atTarget, unreadAlerts, activity);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-meta text-ink-muted">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}{' '}
            · {game === 'onepiece' ? 'One Piece' : 'Pokémon'} collection
          </p>
          <h1 className="font-display text-h1">{greeting(user?.username)}</h1>
        </div>
      </header>

      {/* Row 1: valuation | allocation | actions */}
      <section
        aria-label="Collection overview"
        className="mt-5 grid border-y-2 border-rule-strong lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.25fr)_minmax(0,0.9fr)] lg:divide-x lg:divide-rule"
      >
        <div className="py-5 lg:pr-8">
          <p className="text-[13px] font-medium text-ink-secondary">Collection value</p>
          <Price
            value={summary.marketValue}
            size="xl"
            className="mt-1 block"
            unavailableLabel="Not priced yet"
          />
          <p className="mt-1.5 text-meta text-ink-muted">
            Market estimate · {summary.copies.toLocaleString()}{' '}
            {summary.copies === 1 ? 'card' : 'cards'} in {summary.entries}{' '}
            {summary.entries === 1 ? 'holding' : 'holdings'}
            {summary.unpricedEntries > 0 ? ` · ${summary.unpricedEntries} without a price` : ''}
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-x-6">
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
              <dt className="text-meta text-ink-muted">Cost basis recorded</dt>
              <dd className="mt-1">
                <CoverageMeter value={summary.costCoverage} />
                <span className="mt-1 block font-mono text-[12px] tabular-nums text-ink-secondary">
                  {coveragePct}% of value
                  {summary.missingCostEntries > 0 ? ` · ${summary.missingCostEntries} missing` : ''}
                </span>
              </dd>
            </div>
          </dl>
          {summary.unrealized != null && summary.costCoverage < 0.999 ? (
            <p className="mt-3 text-[11.5px] leading-snug text-ink-muted">
              P/L covers only holdings with a recorded purchase price (
              {formatCurrency(summary.knownCostMarket)} of {formatCurrency(summary.marketValue)}).
            </p>
          ) : null}
        </div>

        <div className="border-t border-rule py-5 lg:border-t-0 lg:px-8">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-medium text-ink-secondary">Where the value sits</p>
            <div className="segmented" role="group" aria-label="Group allocation by">
              <button
                type="button"
                aria-pressed={groupBy === 'set'}
                onClick={() => setGroupBy('set')}
              >
                Set
              </button>
              <button
                type="button"
                aria-pressed={groupBy === 'era'}
                onClick={() => setGroupBy('era')}
              >
                Era
              </button>
            </div>
          </div>
          <div className="mt-3">
            <AllocationBars
              slices={slices}
              title={`Collection value by ${groupBy}`}
              onSelect={
                groupBy === 'set'
                  ? (s) => navigate(`/sets/${encodeURIComponent(s.key)}`)
                  : undefined
              }
            />
          </div>
          <p className="mt-2 text-[11.5px] text-ink-muted">
            Top 5 holdings are {Math.round(conc * 100)}% of the value. There is no daily valuation
            history yet, so this shows today’s allocation rather than a performance line.
          </p>
        </div>

        <div className="border-t border-rule py-5 lg:border-t-0 lg:pl-8">
          <p className="text-[13px] font-medium text-ink-secondary">Act on it</p>
          <ul className="mt-2">
            <ActionRow
              onClick={openCommandPalette}
              icon={<Plus className="h-4 w-4" />}
              label="Add a card"
              hint="Search the catalog"
            />
            <ActionRow
              to="/scanner"
              icon={<Camera className="h-4 w-4" />}
              label="Scan a card"
              hint="Camera, upload or phone"
            />
            <ActionRow
              to="/trade"
              icon={<Scale className="h-4 w-4" />}
              label="Compare a trade"
              hint="Both sides, live prices"
            />
            <ActionRow
              to="/vault"
              icon={<ArrowRight className="h-4 w-4" />}
              label="Open the vault"
              hint={`${summary.entries} holdings`}
            />
          </ul>
        </div>
      </section>

      {/* Row 2: briefing + top holdings */}
      <div className="mt-12 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="briefing-h">
          <div className="flex items-end justify-between border-b border-rule-strong pb-2">
            <h2 id="briefing-h" className="font-display text-[22px] font-medium leading-tight">
              Today’s briefing
            </h2>
            <span className="text-meta text-ink-muted">
              From your collection, wishlist and alerts
            </span>
          </div>
          {briefing.length === 0 ? (
            <p className="py-4 text-[13.5px] text-ink-secondary">
              Nothing needs attention. Add target prices to wishlist cards to be told when they hit.
            </p>
          ) : (
            <ol>
              {briefing.map((item) => (
                <li
                  key={item.key}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-rule py-3 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto]"
                >
                  <span
                    className={cn(
                      'col-span-2 text-[12px] font-medium sm:col-span-1',
                      item.toneClass
                    )}
                  >
                    {item.tag}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px]">{item.title}</span>
                    {item.detail ? (
                      <span className="mt-0.5 block text-meta text-ink-muted">{item.detail}</span>
                    ) : null}
                  </span>
                  {item.to ? (
                    <Link
                      to={item.to}
                      className="whitespace-nowrap text-[13px] text-accent hover:underline"
                    >
                      {item.cta}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="top-h">
          <div className="flex items-end justify-between border-b border-rule-strong pb-2">
            <h2 id="top-h" className="font-display text-[22px] font-medium leading-tight">
              Most valuable
            </h2>
            <Link to="/vault" className="text-[13px] text-accent hover:underline">
              All holdings
            </Link>
          </div>
          <ul className="mt-4 grid grid-cols-4 gap-3">
            {top.map((vc) => (
              <li key={vc.id}>
                <button
                  type="button"
                  onClick={() => openCard(vc.card)}
                  className="group w-full text-left"
                >
                  <CardArt
                    card={vc.card}
                    className="transition-transform duration-150 group-hover:-translate-y-0.5"
                  />
                  <span className="mt-2 block truncate text-[12.5px] font-medium">
                    {vc.card.name}
                  </span>
                  <span className="block font-mono text-[12.5px] tabular-nums text-ink-secondary">
                    {formatCurrency(holdingMarketValue(vc))}
                    {vc.quantity > 1 ? (
                      <span className="text-ink-muted"> · ×{vc.quantity}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function CoverageMeter({ value }: { value: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <span
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label="Share of collection value with a recorded purchase price"
      className="relative block h-2 w-full overflow-hidden rounded-sm bg-surface-hover"
    >
      <span className="absolute inset-y-0 left-0 bg-ink-primary" style={{ width: `${pct}%` }} />
      {/* quarter ticks make the meter readable without the number */}
      {[25, 50, 75].map((t) => (
        <span
          key={t}
          className="absolute inset-y-0 w-px bg-surface-base"
          style={{ left: `${t}%` }}
        />
      ))}
    </span>
  );
}

function ActionRow({
  to,
  onClick,
  icon,
  label,
  hint,
}: {
  to?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  const body = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-strong text-ink-secondary group-hover:border-ink-primary group-hover:text-ink-primary">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium">{label}</span>
        <span className="block text-meta text-ink-muted">{hint}</span>
      </span>
    </>
  );
  const cls = 'group flex w-full items-center gap-3 border-b border-rule py-2.5 text-left';
  return (
    <li>
      {to ? (
        <Link to={to} className={cls}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={cls}>
          {body}
        </button>
      )}
    </li>
  );
}

interface BriefingItem {
  key: string;
  tag: string;
  toneClass: string;
  title: string;
  detail?: string;
  to?: string;
  cta?: string;
}

/** Real events only; each rule is stated in its copy. */
function useBriefing(
  cards: VaultCard[],
  atTarget: WishlistItem[],
  unreadAlerts: number,
  activity: ReturnType<typeof useVault>['activity']
): BriefingItem[] {
  return useMemo(() => {
    const items: BriefingItem[] = [];
    atTarget.slice(0, 3).forEach((w) =>
      items.push({
        key: `wish-${w.id}`,
        tag: 'Wishlist hit',
        toneClass: 'text-gain',
        title: `${w.card.name} is at or under your ${formatCurrency(w.targetPrice ?? 0)} target`,
        detail: w.card.set?.name,
        to: `/card/${encodeURIComponent(w.card.id)}`,
        cta: 'Review',
      })
    );
    if (unreadAlerts > 0)
      items.push({
        key: 'alerts',
        tag: 'Price alert',
        toneClass: 'text-accent',
        title: `${unreadAlerts} price ${unreadAlerts === 1 ? 'alert has' : 'alerts have'} triggered`,
        detail: 'Open the bell in the header to see which cards crossed their thresholds.',
      });

    const missing = cards.filter((c) => !hasKnownCost(c));
    if (missing.length > 0) {
      const value = missing.reduce((s, c) => s + holdingMarketValue(c), 0);
      items.push({
        key: 'missing-cost',
        tag: 'Data gap',
        toneClass: 'text-warn',
        title: `${missing.length} ${missing.length === 1 ? 'holding has' : 'holdings have'} no purchase price`,
        detail: `${formatCurrency(value)} of value is left out of P/L until you add what you paid.`,
        to: '/vault?filter=missing-cost',
        cta: 'Fill in',
      });
    }

    // Grading review rule: raw copies worth $40+ that have never been photo-graded.
    const candidates = cards
      .filter(
        (c) =>
          c.condition !== 'damaged' && !c.gradingResult && holdingMarketValue(c) / c.quantity >= 40
      )
      .sort((a, b) => holdingMarketValue(b) - holdingMarketValue(a));
    if (candidates.length > 0) {
      items.push({
        key: 'grade',
        tag: 'Grading review',
        toneClass: 'text-gold',
        title: `${candidates[0].card.name}${candidates.length > 1 ? ` and ${candidates.length - 1} more` : ''} may be worth grading`,
        detail:
          'Raw copies at $40+ that you have not photo-graded yet. Check the grading economics before submitting.',
        to: '/grading',
        cta: 'Estimate',
      });
    }

    // Set completion milestone: best-progress set among those you own cards in.
    const bySetMap = new Map<
      string,
      { name: string; total: number; ids: Set<string>; id: string }
    >();
    cards.forEach((c) => {
      const s = c.card.set;
      if (!s?.id || !s.total) return;
      const slot = bySetMap.get(s.id) ?? {
        name: s.name,
        total: s.total,
        ids: new Set<string>(),
        id: s.id,
      };
      slot.ids.add(c.card.number || c.card.id);
      bySetMap.set(s.id, slot);
    });
    const best = [...bySetMap.values()].sort(
      (a, b) => b.ids.size / b.total - a.ids.size / a.total
    )[0];
    if (best && best.ids.size >= 3) {
      items.push({
        key: 'set',
        tag: 'Set progress',
        toneClass: 'text-ink-secondary',
        title: `${best.name}: ${best.ids.size} of ${best.total} cards`,
        detail: `${Math.round((best.ids.size / best.total) * 100)}% complete by card number.`,
        to: `/sets/${encodeURIComponent(best.id)}`,
        cta: 'See gaps',
      });
    }

    activity.slice(0, 2).forEach((a) =>
      items.push({
        key: a.id,
        tag: 'Recent',
        toneClass: 'text-ink-muted',
        title: `${a.action === 'add' ? 'Added' : a.action === 'remove' ? 'Removed' : a.action === 'import' ? 'Imported' : 'Updated'} ${a.cardName ?? 'holdings'}`,
        detail: `${a.detail ? `${a.detail} · ` : ''}${new Date(a.at).toLocaleDateString()}`,
      })
    );
    return items;
  }, [cards, atTarget, unreadAlerts, activity]);
}

/* ───────────────────────── New visitor ───────────────────────── */

function VisitorHome() {
  const { isOnePiece } = useGame();
  return (
    <section
      aria-labelledby="visitor-h"
      className="grid gap-10 border-b-2 border-rule-strong pb-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16"
    >
      <div>
        <h1 id="visitor-h" className="font-display text-display">
          What is this card worth?
        </h1>
        <p className="mt-3 max-w-[52ch] text-[15px] text-ink-secondary">
          Look up any {isOnePiece ? 'One Piece' : 'Pokémon'} card to see its market price for each
          finish, where that number comes from, graded comparisons and whether grading would pay.
        </p>
        <div className="mt-6 max-w-[38rem]">
          <CardLookup autoFocus />
        </div>
      </div>
      <aside aria-label="What you can do here" className="lg:pt-2">
        <ol className="space-y-0">
          {[
            [
              'Look up',
              'Market estimate per finish, with source and date, plus recent sales and listings kept apart.',
            ],
            [
              'Decide',
              'Raw against PSA, CGC and BGS prices, population, and a calculator that includes fees and shipping.',
            ],
            [
              'Collect',
              'Log what you own and what you paid. P/L counts only the holdings where the cost is known.',
            ],
            [
              'Act',
              'Wishlist targets, price alerts, trade comparisons, photo grading and scanning.',
            ],
          ].map(([k, v], i) => (
            <li
              key={k}
              className="grid grid-cols-[2rem_6rem_minmax(0,1fr)] items-baseline gap-x-3 border-b border-rule py-3"
            >
              <span className="font-mono text-[12px] text-ink-muted">0{i + 1}</span>
              <span className="text-[14px] font-semibold">{k}</span>
              <span className="text-[13.5px] text-ink-secondary">{v}</span>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link to="/browse" className="btn-secondary">
            Browse the catalog
          </Link>
          <Link to="/scanner" className="btn-ghost">
            <Camera className="h-4 w-4" /> Scan a card
          </Link>
        </div>
      </aside>
    </section>
  );
}
