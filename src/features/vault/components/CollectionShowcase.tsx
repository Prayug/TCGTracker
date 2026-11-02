import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { VaultCard } from '../../../types/pokemon';
import { HolographicCard } from '../../../components/collectible/HolographicCard';
import { CardSpotlight } from '../../../components/collectible/CardSpotlight';
import { FINISH_LABEL, finishOf, finishRank } from '../../../components/collectible/finish';
import { Delta, Price } from '../../../components/exchange/Price';
import { formatCurrency } from '../../../utils/cardDisplay';
import {
  costStatus,
  holdingMarketValue,
  knownHoldingProfit,
  marketUnitPrice,
} from '../../../utils/vaultCost';
import { vaultService } from '../../../services/vaultService';
import { fetchGradedSpreads, type GradedSpreadSummary } from '../../../services/gradedPricesApi';
import { cardPath } from '../../../contexts/CardModalContext';
import { CONDITION_LABEL } from '../ledger';
import { usePrefersReducedMotion } from '../../../hooks/useMotionPreferences';
import { useProgressiveCount } from '../../../hooks/useProgressiveCount';
import { cn } from '@/lib/utils';

type Density = 'showcase' | 'gallery' | 'compact';
const DENSITIES: { id: Density; label: string }[] = [
  { id: 'showcase', label: 'Showcase' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'compact', label: 'Compact' },
];
const GRID: Record<Density, string> = {
  showcase: 'grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5',
  gallery: 'grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-7',
  compact: 'grid-cols-4 gap-x-2.5 gap-y-4 sm:grid-cols-6 lg:grid-cols-8 2xl:grid-cols-10',
};
const DENSITY_KEY = 'tcg.vault.density';

function readDensity(): Density {
  try {
    const v = localStorage.getItem(DENSITY_KEY);
    return v === 'gallery' || v === 'compact' ? v : 'showcase';
  } catch {
    return 'showcase';
  }
}

type ShowSort = 'value' | 'rarity' | 'set' | 'date' | 'name';
const SORTS: { id: ShowSort; label: string }[] = [
  { id: 'value', label: 'Value' },
  { id: 'rarity', label: 'Rarity' },
  { id: 'set', label: 'Set' },
  { id: 'date', label: 'Newest' },
  { id: 'name', label: 'Name' },
];

function sortShowcase(rows: VaultCard[], sort: ShowSort): VaultCard[] {
  const by = [...rows];
  switch (sort) {
    case 'value':
      return by.sort((a, b) => holdingMarketValue(b) - holdingMarketValue(a));
    case 'rarity':
      return by.sort(
        (a, b) =>
          finishRank(finishOf(b.card)) - finishRank(finishOf(a.card)) ||
          holdingMarketValue(b) - holdingMarketValue(a)
      );
    case 'set':
      return by.sort(
        (a, b) =>
          (a.card.set?.releaseDate || '9999').localeCompare(b.card.set?.releaseDate || '9999') ||
          (a.card.set?.name || '').localeCompare(b.card.set?.name || '') ||
          (parseInt(a.card.number, 10) || 0) - (parseInt(b.card.number, 10) || 0)
      );
    case 'date':
      return by.sort((a, b) => (b.purchaseDate || '').localeCompare(a.purchaseDate || ''));
    case 'name':
      return by.sort((a, b) => a.card.name.localeCompare(b.card.name));
  }
}

/**
 * The vault as a display case. A spotlight pedestal for the most valuable
 * pieces, then the whole collection as large cards that re-flow (animated)
 * when the sort changes. Selecting a card grows it into a detail view.
 */
export function CollectionShowcase({
  rows,
  onEdit,
}: {
  rows: VaultCard[];
  onEdit: (vc: VaultCard) => void;
}) {
  const [sort, setSort] = useState<ShowSort>('value');
  const [density, setDensityState] = useState<Density>(readDensity);
  const setDensity = (d: Density) => {
    setDensityState(d);
    try {
      localStorage.setItem(DENSITY_KEY, d);
    } catch {
      /* per-viewer convenience only */
    }
  };
  const sorted = useMemo(() => sortShowcase(rows, sort), [rows, sort]);
  const { count, sentinel, done } = useProgressiveCount(
    sorted.length,
    48,
    `${sort}|${rows.length}`
  );
  const featured = useMemo(
    () =>
      sortShowcase(rows, 'value')
        .filter((r) => holdingMarketValue(r) > 0)
        .slice(0, 5),
    [rows]
  );
  const [open, setOpen] = useState<{ vc: VaultCard; layoutId: string } | null>(null);
  // Follow the live record so edits made from the spotlight (e.g. confirming a cost) show at once.
  const openVc = open ? (rows.find((r) => r.id === open.vc.id) ?? open.vc) : null;

  return (
    <div className="space-y-8">
      {featured.length ? <CollectionSpotlight pieces={featured} onEdit={onEdit} /> : null}

      <section aria-labelledby="case-h">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2
            id="case-h"
            className="font-display text-[clamp(1.4rem,2.4vw,1.9rem)] font-semibold tracking-[-0.02em]"
          >
            The whole case{' '}
            <span className="font-mono text-[15px] font-normal text-ink-muted">{rows.length}</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="segmented" role="group" aria-label="Density">
              {DENSITIES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={density === d.id}
                  onClick={() => setDensity(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div
              className="relative flex rounded-full border border-border-default bg-surface-inset p-1"
              role="group"
              aria-label="Arrange by"
            >
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={sort === s.id}
                  onClick={() => setSort(s.id)}
                  className={cn(
                    'relative z-[1] h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors',
                    sort === s.id
                      ? 'text-accent-foreground'
                      : 'text-ink-secondary hover:text-ink-primary'
                  )}
                >
                  {sort === s.id ? (
                    <motion.span
                      layoutId="show-sort"
                      className="absolute inset-0 -z-[1] rounded-full bg-accent"
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    />
                  ) : null}
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <LayoutGroup>
          <ul className={cn('mt-4 grid', GRID[density])}>
            {sorted.slice(0, count).map((vc) => {
              const layoutId = `case-${vc.id}`;
              const pl = knownHoldingProfit(vc);
              return (
                <motion.li
                  key={vc.id}
                  layout
                  transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                  className="min-w-0"
                >
                  <div className="relative">
                    <HolographicCard
                      card={vc.card}
                      layoutId={layoutId}
                      // Rich foil and tilt only in Showcase; denser grids stay calm.
                      level={
                        density === 'showcase' && finishOf(vc.card) !== 'none'
                          ? 'featured'
                          : 'standard'
                      }
                      interactive={density !== 'compact'}
                      elevated={density !== 'compact'}
                      label={`${vc.card.name}, view holding`}
                      onSelect={() => setOpen({ vc, layoutId })}
                    />
                    {vc.quantity > 1 ? (
                      <span className="pointer-events-none absolute -right-2 -top-2 z-10 grid h-7 min-w-7 place-items-center rounded-full bg-ink-primary px-2 font-mono text-[12px] text-surface-base shadow-md">
                        ×{vc.quantity}
                      </span>
                    ) : null}
                  </div>
                  {density === 'compact' ? (
                    <p className="mt-1.5 truncate font-mono text-[11.5px] tabular-nums text-ink-secondary">
                      {holdingMarketValue(vc) > 0 ? formatCurrency(holdingMarketValue(vc)) : '—'}
                    </p>
                  ) : (
                    <>
                      <p
                        className={cn(
                          'truncate font-medium',
                          density === 'showcase' ? 'mt-3 text-[14px]' : 'mt-2 text-[13px]'
                        )}
                      >
                        {vc.card.name}
                      </p>
                      <p className="truncate text-[12px] text-ink-muted">
                        {vc.card.set?.name}
                        {vc.card.number ? ` · No. ${vc.card.number}` : ''}
                      </p>
                      <p className="mt-1 flex items-baseline gap-2">
                        <Price value={holdingMarketValue(vc)} size="sm" />
                        {pl?.profitPct != null && density === 'showcase' ? (
                          <Delta pct={pl.profitPct} />
                        ) : null}
                      </p>
                    </>
                  )}
                </motion.li>
              );
            })}
            {!done ? (
              <li
                ref={sentinel}
                className="col-span-full py-6 text-center text-[12.5px] text-ink-muted"
              >
                Showing {count} of {sorted.length}
              </li>
            ) : null}
          </ul>
        </LayoutGroup>
      </section>

      <CardSpotlight
        card={openVc?.card ?? null}
        layoutId={open?.layoutId}
        onClose={() => setOpen(null)}
      >
        {openVc ? (
          <HoldingFacts
            vc={openVc}
            onEdit={() => {
              const vc = openVc;
              setOpen(null);
              onEdit(vc);
            }}
          />
        ) : null}
      </CardSpotlight>
    </div>
  );
}

function HoldingFacts({ vc, onEdit }: { vc: VaultCard; onEdit: () => void }) {
  const pl = knownHoldingProfit(vc);
  const unit = marketUnitPrice(vc.card);
  const status = costStatus(vc);
  const game = vc.game ?? 'pokemon';
  const [spreads, setSpreads] = useState<GradedSpreadSummary | null | 'loading'>('loading');
  useEffect(() => {
    let alive = true;
    setSpreads('loading');
    fetchGradedSpreads(vc.card.id).then((r) => alive && setSpreads(r));
    return () => {
      alive = false;
    };
  }, [vc.card.id]);
  const grades =
    spreads && spreads !== 'loading'
      ? [...spreads.spreads]
          .filter((g) => g.gradedPrice > 0)
          .sort((x, y) => x.gradedPrice - y.gradedPrice)
          .slice(-4)
      : [];
  const top = Math.max(unit, ...grades.map((g) => g.gradedPrice), 1);

  return (
    <div className="space-y-4 text-white">
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
        <div>
          <dt className="text-[11.5px] text-white/55">Holding value</dt>
          <dd className="mt-0.5">
            <Price value={holdingMarketValue(vc)} size="lg" className="text-white" />
          </dd>
          <dd className="text-[11px] text-white/50">
            {vc.quantity} × {unit > 0 ? formatCurrency(unit) : 'no price'}
          </dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-white/55">Cost basis</dt>
          <dd className="mt-1 font-mono text-[16px] tabular-nums">
            {status === 'recorded' ? (
              formatCurrency(vc.purchasePrice * vc.quantity)
            ) : status === 'unverified' ? (
              <span className="text-[#f0bd55]">
                {formatCurrency(vc.purchasePrice * vc.quantity)}
                <span className="ml-1 font-sans text-[11px]">unverified</span>
              </span>
            ) : (
              <span className="font-sans text-[13px] text-white/60">Not recorded</span>
            )}
          </dd>
          {status === 'unverified' ? (
            <dd>
              <button
                type="button"
                className="text-[11.5px] text-[#9db4ff] hover:underline"
                onClick={() => vaultService.confirmCosts([vc.id], game)}
              >
                Confirm this is what I paid
              </button>
            </dd>
          ) : null}
        </div>
        <div>
          <dt className="text-[11.5px] text-white/55">Profit / loss</dt>
          <dd
            className={cn(
              'mt-1 font-mono text-[16px] tabular-nums',
              pl == null
                ? 'font-sans text-[13px] text-white/60'
                : pl.profit >= 0
                  ? 'text-[#3fd3a8]'
                  : 'text-[#ff7a6b]'
            )}
          >
            {pl == null ? 'Needs a recorded cost' : formatCurrency(pl.profit, { signed: true })}
            {pl?.profitPct != null ? (
              <span className="ml-1 text-[11px] text-white/55">{pl.profitPct.toFixed(1)}%</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-white/55">Condition</dt>
          <dd className="mt-0.5 text-[14px]">{CONDITION_LABEL[vc.condition] ?? vc.condition}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-white/55">Added</dt>
          <dd className="mt-0.5 text-[14px]">
            {vc.purchaseDate
              ? new Date(vc.purchaseDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'No date'}
          </dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-white/55">Photo grade</dt>
          <dd className="mt-0.5 text-[14px]">
            {vc.gradingResult ? 'On file' : <span className="text-white/60">None yet</span>}
          </dd>
        </div>
      </dl>

      <div className="border-t border-white/10 pt-3">
        <p className="text-[12px] font-medium text-white/70">Raw against graded sales</p>
        {spreads === 'loading' ? (
          <div className="mt-2 h-16 animate-pulse rounded-lg bg-white/5" />
        ) : grades.length === 0 ? (
          <p className="mt-1 text-[12px] text-white/50">
            No graded sales on file for this card, so there is nothing to compare yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5" aria-label="Raw market and graded sale prices">
            {[
              { k: 'Raw', v: unit, n: null as number | null },
              ...grades.map((g) => ({
                k: `${g.grader.toUpperCase()} ${g.grade}`,
                v: g.gradedPrice,
                n: g.soldListings,
              })),
            ].map((r) => (
              <li
                key={r.k}
                className="grid grid-cols-[4.5rem_minmax(0,1fr)_5.5rem] items-center gap-2 text-[12px]"
              >
                <span className="text-white/65">{r.k}</span>
                <span className="h-2 rounded-full bg-white/10">
                  <motion.span
                    className={cn(
                      'block h-full rounded-full',
                      r.k === 'Raw' ? 'bg-white/45' : 'bg-[#f0bd55]'
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${(Math.max(0, r.v) / top) * 100}%` }}
                    transition={{ type: 'spring', stiffness: 140, damping: 22 }}
                  />
                </span>
                <span className="text-right font-mono tabular-nums">
                  {r.v > 0 ? formatCurrency(r.v) : '—'}
                  {r.n != null ? <span className="ml-1 text-white/40">{r.n}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        {grades.length ? (
          <p className="mt-1.5 text-[11px] text-white/45">
            Graded figures are recorded sales (count shown); fees and grade risk not included.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" className="btn-tactile" onClick={onEdit}>
          Edit, sell or record cost
        </button>
        <Link
          to={cardPath(vc.card.id)}
          className="inline-flex h-10 items-center rounded-full border border-white/20 px-4 text-[13px] hover:bg-white/10"
        >
          Full research
        </Link>
        <Link
          to="/grading"
          className="inline-flex h-10 items-center rounded-full border border-white/20 px-4 text-[13px] hover:bg-white/10"
        >
          Photo grade
        </Link>
      </div>
    </div>
  );
}

/** A pedestal for the five most valuable pieces, stepped through like a display case. */
function CollectionSpotlight({
  pieces,
  onEdit,
}: {
  pieces: VaultCard[];
  onEdit: (vc: VaultCard) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const [i, setI] = useState(0);
  const vc = pieces[Math.min(i, pieces.length - 1)];
  const pl = knownHoldingProfit(vc);
  const go = (d: number) => setI((x) => (x + d + pieces.length) % pieces.length);
  return (
    <section
      data-theme="dark"
      aria-labelledby="spot-h"
      className="atmo-stage relative overflow-hidden rounded-3xl px-5 pb-6 pt-6 sm:px-10 sm:pt-10"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-6 left-[8%] h-16 w-[min(60%,26rem)] rounded-[50%] bg-[radial-gradient(closest-side,rgba(227,167,58,0.35),transparent)] sm:left-[10%]"
      />
      <div className="relative grid items-center gap-8 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] md:gap-14">
        <div className="relative mx-auto w-[min(62vw,19rem)] md:w-full">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={vc.id}
              initial={reduced ? false : { opacity: 0, y: 30, rotateY: -25 }}
              animate={{ opacity: 1, y: 0, rotateY: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -20, rotateY: 25 }}
              transition={{ type: 'spring', stiffness: 180, damping: 22 }}
              style={{ transformPerspective: 900 }}
            >
              <HolographicCard
                card={vc.card}
                level="showcase"
                size="large"
                priority
                label={`Edit ${vc.card.name}`}
                onSelect={() => onEdit(vc)}
              />
            </motion.div>
          </AnimatePresence>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={vc.id}
            initial={reduced ? false : { opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.22 }}
            className="text-white"
            aria-live="polite"
          >
            <p id="spot-h" className="text-[13px] font-medium text-[#f0bd55]">
              Collection spotlight · No. {i + 1} by value
            </p>
            <h2 className="mt-2 font-display text-[clamp(2rem,4.4vw,3.6rem)] font-semibold leading-[0.98] tracking-[-0.03em]">
              {vc.card.name}
            </h2>
            <p className="mt-2 text-[14px] text-white/65">
              {vc.card.set?.name}
              {vc.card.number ? ` · No. ${vc.card.number}` : ''} · {FINISH_LABEL[finishOf(vc.card)]}
            </p>
            <dl className="mt-6 grid max-w-[32rem] grid-cols-3 gap-4 border-t border-white/10 pt-5">
              <div>
                <dt className="text-[12px] text-white/55">Worth today</dt>
                <dd className="mt-1">
                  <Price value={holdingMarketValue(vc)} size="md" className="text-white" />
                </dd>
              </div>
              <div>
                <dt className="text-[12px] text-white/55">You paid</dt>
                <dd className="mt-1 font-mono text-[17px]">
                  {pl ? (
                    formatCurrency(vc.purchasePrice * vc.quantity)
                  ) : (
                    <span className="text-[13px] text-white/55">Not recorded</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[12px] text-white/55">Copies</dt>
                <dd className="mt-1 font-mono text-[17px]">{vc.quantity}</dd>
              </div>
            </dl>
            {pl ? (
              <p
                className={cn(
                  'mt-3 font-mono text-[14px]',
                  pl.profit >= 0 ? 'text-[#3fd3a8]' : 'text-[#ff7a6b]'
                )}
              >
                {formatCurrency(pl.profit, { signed: true })} since you bought it
              </p>
            ) : null}
            <div className="mt-7 flex items-center gap-3">
              <button
                type="button"
                onClick={() => go(-1)}
                className="grid h-11 w-11 place-items-center rounded-full border border-white/20 hover:bg-white/10"
                aria-label="Previous piece"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                className="grid h-11 w-11 place-items-center rounded-full border border-white/20 hover:bg-white/10"
                aria-label="Next piece"
              >
                <ChevronRight className="h-5 w-5" aria-hidden />
              </button>
              <span className="font-mono text-[12.5px] text-white/55">
                {i + 1} / {pieces.length}
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
