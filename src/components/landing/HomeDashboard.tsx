/**
 * Logged-in Home — portfolio dashboard above the fold.
 * Answers: worth / changed / owned movers / buy-sell opportunities.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Plus, ArrowUpRight, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useGame } from '@/contexts/GameContext';
import { useCardModal } from '@/contexts/CardModalContext';
import { vaultService } from '@/services/vaultService';
import { cardWishlistService } from '@/services/cardWishlistService';
import { fetchDeals } from '@/services/dealsApi';
import type { Deal } from '@/features/deals/types';
import type { VaultCard } from '@/types/pokemon';
import {
  buildHoldings,
  buildValueSeries,
  periodChangeExcludingInflows,
  type PerformancePeriod,
} from '@/features/vault/utils/portfolioSeries';
import { PriceChart } from '@/features/market/components/PriceChart';
import { formatCurrency, formatPercent, proxyImageUrl } from '@/utils/cardDisplay';
import { getCardPrice } from '@/utils/cardPrice';
import { cn } from '@/lib/utils';
import { HomeHero } from '@/components/landing/HomeHero';

const PERIODS: { key: PerformancePeriod; label: string }[] = [
  { key: '7d', label: '1W' },
  { key: '30d', label: '1M' },
  { key: 'ytd', label: 'YTD' },
  { key: 'all', label: 'ALL' },
];

function greetingForNow(name?: string | null): string {
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const short = name?.trim().split(/\s+/)[0];
  return short ? `${hello}, ${short}` : hello;
}

function cardThumb(card: { images?: { small?: string; large?: string }; imageUrl?: string }) {
  return proxyImageUrl(card.images?.small || card.images?.large || card.imageUrl) || '';
}

export function HomeDashboard() {
  const { user } = useAuth();
  const { game } = useGame();
  const { openCard } = useCardModal();
  const [period, setPeriod] = useState<PerformancePeriod>('30d');
  const [vaultCards, setVaultCards] = useState<VaultCard[]>(() => vaultService.getVaultCards(game));
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(true);

  useEffect(() => {
    const refresh = () => setVaultCards(vaultService.getVaultCards(game));
    refresh();
    window.addEventListener('tcg:vault-updated', refresh);
    return () => window.removeEventListener('tcg:vault-updated', refresh);
  }, [game]);

  useEffect(() => {
    let cancelled = false;
    setDealsLoading(true);
    fetchDeals({ game, sort: 'discount_pct', minDiscount: 12, minMarketValue: 15 })
      .then((res) => {
        if (!cancelled) setDeals((res.deals || []).slice(0, 4));
      })
      .catch(() => {
        if (!cancelled) setDeals([]);
      })
      .finally(() => {
        if (!cancelled) setDealsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [game]);

  const stats = useMemo(() => vaultService.getVaultStats(game), [vaultCards, game]);
  const change = useMemo(
    () => periodChangeExcludingInflows(vaultCards, period),
    [vaultCards, period]
  );
  const series = useMemo(() => buildValueSeries(vaultCards, period), [vaultCards, period]);

  const vaultById = useMemo(() => {
    const map = new Map<string, VaultCard>();
    for (const vc of vaultCards) map.set(vc.id, vc);
    return map;
  }, [vaultCards]);

  const ownedMovers = useMemo(() => {
    return buildHoldings(vaultCards)
      .filter((h) => Math.abs(h.profitPct) >= 0.5 || Math.abs(h.profit) >= 1)
      .sort((a, b) => Math.abs(b.profitPct) - Math.abs(a.profitPct))
      .slice(0, 6);
  }, [vaultCards]);

  const wishlistMovers = useMemo(() => {
    return cardWishlistService
      .getItems(game)
      .map((item) => {
        const market = getCardPrice(item.card) ?? 0;
        const target = item.targetPrice ?? 0;
        const vsTarget = target > 0 && market > 0 ? ((market - target) / target) * 100 : null;
        return { item, market, vsTarget };
      })
      .filter((row) => row.market > 0)
      .sort((a, b) => (a.vsTarget ?? 0) - (b.vsTarget ?? 0))
      .slice(0, 4);
  }, [vaultCards, game]);

  const empty = vaultCards.length === 0;
  const changeUp = change.dollar >= 0;

  return (
    <div className="relative">
      <div className="mx-auto max-w-[1400px] px-5 pb-16 pt-8 sm:px-8 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-ink-secondary">
              {greetingForNow(user?.username)}
            </p>
            <h1 className="mt-1 font-display text-[clamp(1.75rem,3.5vw,2.35rem)] font-semibold tracking-[-0.02em] text-ink-primary">
              Your collection
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/vault"
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent-hover"
            >
              <Plus className="h-4 w-4" />
              Add card
            </Link>
            <Link
              to="/scanner"
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-border-strong px-4 text-sm font-semibold text-ink-primary transition-colors hover:border-accent/45 hover:text-accent"
            >
              <Camera className="h-4 w-4" />
              Scan
            </Link>
          </div>
        </div>

        <section className="mt-8 rounded-xl border border-border-subtle bg-surface-raised/60 p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">
                Market value
              </p>
              <p className="mt-2 font-display text-[clamp(2.25rem,5vw,3.25rem)] font-semibold tabular-nums leading-none tracking-[-0.03em] text-ink-primary">
                {formatCurrency(stats.currentValue)}
              </p>
              <p
                className={cn(
                  'mt-2 text-sm font-medium tabular-nums',
                  empty ? 'text-ink-secondary' : changeUp ? 'text-gain' : 'text-loss'
                )}
              >
                {empty ? (
                  'Add cards to track value'
                ) : (
                  <>
                    {formatCurrency(change.dollar, { signed: true })} (
                    {formatPercent(change.percent, { signed: true })}){' '}
                    <span className="font-normal text-ink-secondary">
                      {period === '7d'
                        ? 'this week'
                        : period === '30d'
                          ? 'this month'
                          : period === 'ytd'
                            ? 'year to date'
                            : 'all time'}
                      {change.sinceAddedOnly ? ' · since added' : ''}
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="flex rounded-md border border-border-subtle bg-surface-inset/80 p-0.5">
              {PERIODS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  className={cn(
                    'cursor-pointer rounded-[5px] px-2.5 py-1.5 text-xs font-semibold tabular-nums transition-colors',
                    period === key
                      ? 'bg-accent/15 text-accent'
                      : 'text-ink-secondary hover:text-ink-primary'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 h-[200px] sm:h-[240px]">
            {series.length > 1 ? (
              <PriceChart priceHistory={series} title="" height={220} compact fillGaps={false} />
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border-subtle">
                <p className="max-w-sm text-center text-sm text-ink-secondary">
                  {empty
                    ? 'Your portfolio chart appears after you add cards to the vault.'
                    : 'Not enough history to chart this period yet.'}
                </p>
              </div>
            )}
          </div>

          {!empty && (
            <p className="mt-3 text-xs text-ink-secondary">
              Cost basis {formatCurrency(stats.totalValue)} · P/L{' '}
              <span className={stats.profit >= 0 ? 'text-gain' : 'text-loss'}>
                {formatCurrency(stats.profit, { signed: true })} (
                {formatPercent(stats.profitPercentage, { signed: true })})
              </span>
              {' · '}
              {stats.uniqueCards} unique · {stats.totalCards} cards
            </p>
          )}
        </section>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <section>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-ink-primary">
                Biggest movers in your vault
              </h2>
              <Link
                to="/vault"
                className="inline-flex items-center gap-1 text-xs font-medium text-ink-secondary transition-colors hover:text-accent"
              >
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {ownedMovers.length === 0 ? (
              <div className="rounded-xl border border-border-subtle bg-surface-raised/40 px-4 py-8 text-center">
                <p className="text-sm text-ink-secondary">
                  {empty
                    ? 'No holdings yet — add cards to see which ones are moving.'
                    : 'No meaningful cost-to-market moves yet.'}
                </p>
                {empty && (
                  <Link
                    to="/browse"
                    className="mt-4 inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-hover"
                  >
                    Browse cards
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {ownedMovers.map((h) => {
                  const vc = vaultById.get(h.id);
                  const img = vc ? cardThumb(vc.card) : '';
                  const up = h.profitPct >= 0;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => vc && openCard(vc.card)}
                      className="group cursor-pointer overflow-hidden rounded-xl border border-border-subtle bg-surface-raised/50 text-left transition-colors hover:border-accent/35"
                    >
                      <div className="aspect-[5/7] overflow-hidden bg-surface-inset">
                        {img ? (
                          <img
                            src={img}
                            alt=""
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                            loading="lazy"
                            draggable={false}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-ink-muted">
                            No art
                          </div>
                        )}
                      </div>
                      <div className="space-y-0.5 p-2.5">
                        <p className="truncate text-sm font-medium text-ink-primary">{h.name}</p>
                        <p className="truncate text-xs text-ink-secondary">{h.setName}</p>
                        <div className="flex items-baseline justify-between gap-2 pt-1">
                          <span className="text-sm font-semibold tabular-nums text-ink-primary">
                            {formatCurrency(h.currentValue)}
                          </span>
                          <span
                            className={cn(
                              'text-xs font-semibold tabular-nums',
                              up ? 'text-gain' : 'text-loss'
                            )}
                          >
                            {formatPercent(h.profitPct, { signed: true })}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-xs text-ink-secondary">% vs your cost basis</p>
          </section>

          <div className="space-y-8">
            <section>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-ink-primary">Market opportunities</h2>
                <Link
                  to="/deals"
                  className="inline-flex items-center gap-1 text-xs font-medium text-ink-secondary transition-colors hover:text-accent"
                >
                  Deals
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="space-y-2">
                {dealsLoading && <p className="text-sm text-ink-secondary">Loading deals…</p>}
                {!dealsLoading && deals.length === 0 && (
                  <div className="rounded-xl border border-border-subtle px-4 py-6 text-sm text-ink-secondary">
                    No strong discounts right now. Check back later.
                  </div>
                )}
                {deals.map((deal) => {
                  const img = proxyImageUrl(deal.cardImage || deal.listingImage || '') || '';
                  return (
                    <Link
                      key={deal.listingId}
                      to="/deals"
                      className="flex cursor-pointer gap-3 rounded-xl border border-border-subtle bg-surface-raised/40 p-2.5 transition-colors hover:border-accent/35"
                    >
                      <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-surface-inset">
                        {img ? (
                          <img
                            src={img}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-primary">
                          {deal.cardName}
                        </p>
                        <p className="truncate text-xs text-ink-secondary">
                          {deal.setName}
                          {deal.gradeLabel ? ` · ${deal.gradeLabel}` : ''}
                        </p>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className="text-sm font-semibold tabular-nums text-ink-primary">
                            {formatCurrency(deal.allInCost)}
                          </span>
                          <span className="text-xs font-semibold tabular-nums text-gain">
                            −{Math.abs(deal.discountPercent).toFixed(1)}% vs mkt
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-ink-primary">Watchlist</h2>
                <Link
                  to="/wishlist"
                  className="inline-flex items-center gap-1 text-xs font-medium text-ink-secondary transition-colors hover:text-accent"
                >
                  Wishlist
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="space-y-2">
                {wishlistMovers.length === 0 ? (
                  <div className="rounded-xl border border-border-subtle px-4 py-6 text-sm text-ink-secondary">
                    Save cards to your wishlist to track targets here.
                  </div>
                ) : (
                  wishlistMovers.map(({ item, market, vsTarget }) => {
                    const img = cardThumb(item.card);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openCard(item.card)}
                        className="flex w-full cursor-pointer gap-3 rounded-xl border border-border-subtle bg-surface-raised/40 p-2.5 text-left transition-colors hover:border-accent/35"
                      >
                        <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-surface-inset">
                          {img ? (
                            <img
                              src={img}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink-primary">
                            {item.card.name}
                          </p>
                          <p className="text-xs text-ink-secondary">
                            {item.targetPrice
                              ? `Target ${formatCurrency(item.targetPrice)}`
                              : 'No target set'}
                          </p>
                          <div className="mt-1 flex items-baseline gap-2">
                            <span className="text-sm font-semibold tabular-nums text-ink-primary">
                              {formatCurrency(market)}
                            </span>
                            {vsTarget != null && (
                              <span
                                className={cn(
                                  'text-xs font-semibold tabular-nums',
                                  vsTarget <= 0 ? 'text-gain' : 'text-ink-secondary'
                                )}
                              >
                                {vsTarget <= 0
                                  ? `${formatPercent(Math.abs(vsTarget))} under target`
                                  : `${formatPercent(vsTarget)} over target`}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      <div className="border-t border-border-subtle">
        <HomeHero variant="banner" />
      </div>
    </div>
  );
}
