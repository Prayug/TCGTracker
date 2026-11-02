import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { EraExplorer } from './EraExplorer';
import { GradeComparisonStage } from '../market/components/GradeComparisonStage';
import { fetchTopGradedPremiums, type GradedSpreadRow } from '../../services/gradedPricesApi';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { PriceHistoryApi, type TopMoverEntry } from '../../services/priceHistoryApi';
import { pokemonApi } from '../../services/pokemonApi';
import { onePieceApi } from '../../services/onepieceApi';
import { moverKey, moverSubtitle, moverToCard } from '../../utils/topMovers';
import { getCardPrice } from '../../utils/cardPrice';
import { useCardModal } from '../../contexts/CardModalContext';
import { useGame } from '../../contexts/GameContext';
import {
  HolographicCard,
  type CollectibleSource,
} from '../../components/collectible/HolographicCard';
import { FINISH_LABEL, finishOf } from '../../components/collectible/finish';
import { CardArt } from '../../components/exchange/CardArt';
import { Delta, Price } from '../../components/exchange/Price';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';
import type { PokemonCard, PokemonSet } from '../../types/pokemon';
import { cn } from '@/lib/utils';

interface GalleryEntry {
  key: string;
  card: PokemonCard;
  price: number | null;
  /** 7-day change, only when the movers feed supplied it. */
  change: number | null;
  previous: number | null;
  subtitle: string;
}

const POPULAR = {
  pokemon: ['Charizard', 'Pikachu', 'Umbreon', 'Rayquaza', 'Gengar', 'Mew', 'Lugia'],
  onepiece: ['Luffy', 'Zoro', 'Nami', 'Shanks', 'Ace', 'Yamato'],
};

function fromMover(e: TopMoverEntry): GalleryEntry {
  const card = moverToCard(e);
  return {
    key: moverKey(e),
    card,
    price: e.currentPrice > 0 ? e.currentPrice : null,
    change: Number.isFinite(e.changePercent) ? e.changePercent : null,
    previous: e.previousPrice > 0 ? e.previousPrice : null,
    subtitle: moverSubtitle(e),
  };
}

/** Trending cards: Pokémon from the real 7-day movers; One Piece from the most valuable Luffy prints. */
function useTrending(isOnePiece: boolean) {
  const [state, setState] = useState<{ items: GalleryEntry[]; basis: string } | null>(null);
  useEffect(() => {
    let alive = true;
    setState(null);
    (async () => {
      try {
        if (isOnePiece) {
          const cards = await onePieceApi.searchCards('Luffy');
          const items = cards
            .filter((c) => c.images?.large || c.images?.small)
            .map((c) => ({ c, p: getCardPrice(c) }))
            .sort((a, b) => b.p - a.p)
            .slice(0, 8)
            .map(({ c, p }) => ({
              key: c.id,
              card: c as unknown as PokemonCard,
              price: p > 0 ? p : null,
              change: null,
              previous: null,
              subtitle: [c.set?.name, c.number].filter(Boolean).join(' · '),
            }));
          if (alive) setState({ items, basis: 'Most valuable Luffy prints, by market price' });
          return;
        }
        const r = await PriceHistoryApi.getTopMovers(7, 50);
        const seen = new Set<string>();
        const items = (r.gainers ?? [])
          .filter((e) => {
            const k = moverKey(e);
            if (seen.has(k)) return false;
            seen.add(k);
            return (
              e.changePercent > 0 && e.currentPrice >= 2 && Boolean(e.imageSmall || e.imageLarge)
            );
          })
          .sort((a, b) => b.currentPrice * b.changePercent - a.currentPrice * a.changePercent)
          .slice(0, 9)
          .map(fromMover);
        if (alive)
          setState({ items, basis: '7-day change in TCGplayer market price · cards over $2' });
      } catch {
        if (alive) setState({ items: [], basis: '' });
      }
    })();
    return () => {
      alive = false;
    };
  }, [isOnePiece]);
  return state;
}

/**
 * Discover's opening composition: an art-directed trending gallery on a dark
 * stage, an editorial column (set spotlight, biggest dollar mover, advanced
 * search), and artwork-led ways into the catalog.
 */
export function DiscoverShowcase({
  search,
  onSearch,
  onAdvanced,
}: {
  search: ReactNode;
  onSearch: (q: string, patch?: Record<string, string>) => void;
  onAdvanced: () => void;
}) {
  const { isOnePiece } = useGame();
  const trending = useTrending(isOnePiece);

  return (
    <div className="space-y-10">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <FeaturedCardGallery trending={trending} search={search} />
        <EditorialColumn trending={trending} onAdvanced={onAdvanced} />
      </div>
      <CategoryTiles onSearch={onSearch} />
      {isOnePiece ? null : <EraExplorer />}
      {isOnePiece ? null : <GradedSpotlight />}
      <section aria-labelledby="names-h">
        <h2 id="names-h" className="font-display text-[20px] font-semibold">
          Or start with a name
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {POPULAR[isOnePiece ? 'onepiece' : 'pokemon'].map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onSearch(name)}
              className="h-10 rounded-full border border-border-strong px-4 text-[14px] text-ink-secondary transition-colors hover:border-accent hover:text-ink-primary active:scale-[0.98]"
            >
              {name}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Raw against slab for the cards where grading adds most, from recorded graded sales. */
function GradedSpotlight() {
  const [rows, setRows] = useState<GradedSpreadRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetchTopGradedPremiums(12).then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
  }, []);
  if (!rows || rows.length === 0) return null;
  return <GradeComparisonStage rows={rows} />;
}

/* ───────────── Featured gallery ───────────── */

function FeaturedCardGallery({
  trending,
  search,
}: {
  trending: { items: GalleryEntry[]; basis: string } | null;
  search: ReactNode;
}) {
  const { openCard } = useCardModal();
  const reduced = usePrefersReducedMotion();
  const items = trending?.items ?? [];
  const [index, setIndex] = useState(0);
  const current = items[Math.min(index, items.length - 1)];
  const go = (d: number) => items.length && setIndex((i) => (i + d + items.length) % items.length);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
    }
  };

  return (
    <section
      data-theme="dark"
      aria-labelledby="discover-h"
      className="atmo-stage relative overflow-hidden rounded-3xl p-5 sm:p-7"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1
            id="discover-h"
            className="font-display text-[clamp(2.2rem,4.4vw,3.6rem)] font-semibold leading-[0.95] tracking-[-0.03em] text-white"
          >
            Discover
          </h1>
          <p className="mt-2 text-[15px] text-white/70">
            {trending?.basis
              ? `Trending now · ${trending.basis}`
              : 'Every printed card, with market prices'}
          </p>
        </div>
        <div className="w-full lg:max-w-[26rem]">{search}</div>
      </div>

      {trending == null ? (
        <div
          className="mt-8 grid gap-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]"
          aria-busy="true"
        >
          <div className="aspect-[63/88] animate-pulse rounded-[4.6%/3.3%] bg-white/10" />
          <div className="space-y-3">
            <div className="h-8 w-2/3 animate-pulse rounded bg-white/10" />
            <div className="h-6 w-1/3 animate-pulse rounded bg-white/10" />
          </div>
        </div>
      ) : !current ? (
        <p className="mt-8 rounded-2xl border border-white/15 bg-white/5 p-5 text-white/75">
          Trending data is not available right now. Search above, or pick a way in below.
        </p>
      ) : (
        <div
          role="toolbar"
          aria-label="Trending cards. Use the left and right arrow keys to move between them."
          onKeyDown={onKey}
        >
          <div className="mt-7 grid items-center gap-6 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] md:gap-10">
            <div className="relative mx-auto w-[min(62vw,17rem)] sm:w-full">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={current.key}
                  initial={reduced ? false : { opacity: 0, x: 60, rotate: 6, scale: 0.92 }}
                  animate={{ opacity: 1, x: 0, rotate: -2, scale: 1 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, x: -60, rotate: -8, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 26 }}
                  drag={reduced ? false : 'x'}
                  dragSnapToOrigin
                  onDragEnd={(_, info) => {
                    if (Math.abs(info.offset.x) > 60) go(info.offset.x < 0 ? 1 : -1);
                  }}
                >
                  <HolographicCard
                    card={current.card}
                    level="showcase"
                    size="large"
                    priority
                    label={`Open ${current.card.name}`}
                    onSelect={() => openCard(current.card)}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={current.key}
                initial={reduced ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
                className="text-white"
                aria-live="polite"
              >
                <p className="font-mono text-[12.5px] text-white/55">
                  No. {String(index + 1).padStart(2, '0')} of{' '}
                  {String(items.length).padStart(2, '0')}
                </p>
                <h2 className="mt-1 font-display text-[clamp(1.7rem,3.4vw,2.8rem)] font-semibold leading-[1.02] tracking-[-0.02em]">
                  {current.card.name}
                </h2>
                <p className="mt-1.5 text-[14px] text-white/65">{current.subtitle}</p>
                <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <Price value={current.price} size="xl" className="text-white" />
                  {current.change != null ? <Delta pct={current.change} /> : null}
                </div>
                {current.previous != null && current.price != null ? (
                  <p className="mt-1 font-mono text-[12.5px] text-white/55">
                    from ${current.previous.toFixed(2)} a week ago
                  </p>
                ) : null}
                <p className="mt-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-[12.5px] text-white/80">
                  {FINISH_LABEL[finishOf(current.card)]}
                  {current.card.rarity ? ` · ${current.card.rarity}` : ''}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="btn-tactile"
                    onClick={() => openCard(current.card)}
                  >
                    Price history and grading
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Thumbnail rail */}
          <div className="mt-7 flex items-center gap-3">
            <button
              type="button"
              onClick={() => go(-1)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/20 text-white hover:bg-white/10"
              aria-label="Previous trending card"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <ol
              className="scrollbar-none flex min-w-0 flex-1 gap-2.5 overflow-x-auto py-2"
              aria-label="Trending cards"
            >
              {items.map((it, i) => (
                <li key={it.key} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-current={i === index ? 'true' : undefined}
                    aria-label={`${it.card.name}${it.change != null ? `, up ${it.change.toFixed(1)}%` : ''}`}
                    className={cn(
                      'relative block w-12 rounded-[4.6%/3.3%] transition-all duration-200 sm:w-14',
                      i === index ? '-translate-y-1 opacity-100' : 'opacity-55 hover:opacity-90'
                    )}
                  >
                    <CardArt card={it.card} flat />
                    {i === index ? (
                      <motion.span
                        layoutId="gallery-thumb"
                        className="absolute -bottom-2 left-1/2 h-1 w-6 -translate-x-1/2 rounded-full bg-white"
                      />
                    ) : null}
                  </button>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => go(1)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/20 text-white hover:bg-white/10"
              aria-label="Next trending card"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ───────────── Editorial column ───────────── */

function EditorialColumn({
  trending,
  onAdvanced,
}: {
  trending: { items: GalleryEntry[] } | null;
  onAdvanced: () => void;
}) {
  const { isOnePiece } = useGame();
  const { openCard } = useCardModal();
  const [sets, setSets] = useState<PokemonSet[] | null>(null);
  useEffect(() => {
    if (isOnePiece) return;
    let alive = true;
    pokemonApi.getSets().then((s) => alive && setSets(s));
    return () => {
      alive = false;
    };
  }, [isOnePiece]);
  const latest = useMemo(
    () =>
      [...(sets ?? [])].sort((a, b) =>
        (b.releaseDate || '').localeCompare(a.releaseDate || '')
      )[0] ?? null,
    [sets]
  );
  const bigMove = useMemo(() => {
    const list = (trending?.items ?? []).filter((i) => i.price != null && i.previous != null);
    return list.sort((a, b) => b.price! - b.previous! - (a.price! - a.previous!))[0] ?? null;
  }, [trending]);

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
      {!isOnePiece ? (
        <Link
          to={latest ? `/sets/${encodeURIComponent(latest.id)}` : '/sets'}
          className="atmo-gold group relative flex min-h-[11rem] flex-col justify-between overflow-hidden rounded-3xl border border-border-default p-5 transition-transform active:scale-[0.99]"
        >
          <span className="text-[13px] font-medium text-gold">Set spotlight · newest release</span>
          <div className="relative">
            {latest?.images?.logo ? (
              <img
                src={latest.images.logo}
                alt=""
                className="mb-3 h-14 w-auto max-w-[70%] object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.25)] transition-transform duration-300 group-hover:-translate-y-0.5"
              />
            ) : null}
            <p className="font-display text-[26px] font-semibold leading-tight">
              {latest?.name ?? 'Browse every set'}
            </p>
            <p className="mt-1 text-[13.5px] text-ink-secondary">
              {latest
                ? `${latest.series ?? ''}${latest.series ? ' · ' : ''}${latest.total} cards · released ${latest.releaseDate?.slice(0, 4)}`
                : 'Full checklists, what you own and what is missing'}
            </p>
          </div>
          <ArrowRight
            className="absolute right-5 top-5 h-5 w-5 text-ink-muted transition-transform group-hover:translate-x-1"
            aria-hidden
          />
        </Link>
      ) : null}

      {bigMove ? (
        <button
          type="button"
          onClick={() => openCard(bigMove.card)}
          className="atmo-cobalt group grid min-h-[11rem] grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-4 overflow-hidden rounded-3xl border border-border-default p-5 text-left transition-transform active:scale-[0.99]"
        >
          <div className="min-w-0">
            <span className="text-[13px] font-medium text-accent">Biggest dollar move · 7d</span>
            <p className="mt-2 truncate font-display text-[22px] font-semibold leading-tight">
              {bigMove.card.name}
            </p>
            <p className="mt-1 font-mono text-[15px] tabular-nums">
              +${(bigMove.price! - bigMove.previous!).toFixed(2)}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-hover" aria-hidden>
              <div
                className="h-full rounded-full bg-gain"
                style={{ width: `${Math.min(100, (bigMove.previous! / bigMove.price!) * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-[12px] text-ink-muted">
              Bar: last week’s price as a share of today’s
            </p>
          </div>
          <div className="rotate-6 transition-transform duration-300 group-hover:rotate-0">
            <CardArt card={bigMove.card} />
          </div>
        </button>
      ) : null}

      <button
        type="button"
        onClick={onAdvanced}
        className="group flex min-h-[8rem] items-center justify-between gap-4 rounded-3xl border border-dashed border-border-strong p-5 text-left transition-colors hover:border-accent"
      >
        <span>
          <span className="block font-display text-[20px] font-semibold">Advanced search</span>
          <span className="mt-1 block text-[13.5px] text-ink-secondary">
            Filter by set, rarity, finish, type and price. List view for research.
          </span>
        </span>
        <SlidersHorizontal
          className="h-6 w-6 shrink-0 text-ink-muted transition-transform group-hover:rotate-12"
          aria-hidden
        />
      </button>
    </div>
  );
}

/* ───────────── Category tiles ───────────── */

interface Category {
  id: string;
  label: string;
  line: string;
  art: string[];
  tone: string;
  go:
    | { kind: 'search'; q: string; patch?: Record<string, string> }
    | { kind: 'link'; to: string }
    | { kind: 'game' };
  pokemonOnly?: boolean;
}

const CATEGORIES: Category[] = [
  {
    id: 'vintage',
    label: 'Vintage',
    line: 'Wizards-era sets, 1999 to 2003',
    art: ['base1-4', 'neo1-9'],
    tone: 'from-[#7a4b12] to-[#2a1606]',
    go: { kind: 'link', to: '/sets?era=vintage' },
    pokemonOnly: true,
  },
  {
    id: 'modern',
    label: 'Modern',
    line: 'Scarlet & Violet and Sword & Shield',
    art: ['sv3pt5-199', 'swsh7-215'],
    tone: 'from-[#2341b8] to-[#0b1233]',
    go: { kind: 'link', to: '/sets?era=modern' },
    pokemonOnly: true,
  },
  {
    id: 'alt',
    label: 'Alternate arts',
    line: 'Illustration and alternate-art prints',
    art: ['swsh7-215', 'sv3pt5-199'],
    tone: 'from-[#7b2b8c] to-[#1d0b2a]',
    go: { kind: 'search', q: 'Umbreon', patch: { finish: 'illustration' } },
    pokemonOnly: true,
  },
  {
    id: 'gold',
    label: 'Gold stars',
    line: 'Gold and star rarity prints',
    art: ['base1-58'],
    tone: 'from-[#a77714] to-[#2e2005]',
    go: { kind: 'search', q: 'Pikachu', patch: { finish: 'gold' } },
    pokemonOnly: true,
  },
  {
    id: 'full',
    label: 'Full arts',
    line: 'Ultra and full-art textured foils',
    art: ['swsh12pt5gg-GG44'],
    tone: 'from-[#136b62] to-[#04201d]',
    go: { kind: 'search', q: 'Charizard', patch: { finish: 'textured' } },
    pokemonOnly: true,
  },
  {
    id: 'graded',
    label: 'Graded cards',
    line: 'PSA, CGC and BGS prices and population',
    art: ['base1-4'],
    tone: 'from-[#3b4250] to-[#0e1117]',
    go: { kind: 'link', to: '/prices' },
  },
  {
    id: 'ja',
    label: 'Japanese cards',
    line: 'The Japanese catalog, searched in English',
    art: [],
    tone: 'from-[#b3263a] to-[#2b0810]',
    go: { kind: 'search', q: 'Pikachu', patch: { lang: 'ja' } },
    pokemonOnly: true,
  },
  {
    id: 'op',
    label: 'One Piece',
    line: 'Switch the catalog to One Piece',
    art: [],
    tone: 'from-[#c2410c] to-[#2a0e02]',
    go: { kind: 'game' },
  },
];

function useCategoryArt(ids: string[]) {
  const [cards, setCards] = useState<Record<string, PokemonCard | null>>({});
  const key = ids.join(',');
  useEffect(() => {
    let alive = true;
    Promise.all(
      [...new Set(ids)].map(
        async (id) => [id, await pokemonApi.getCardById(id).catch(() => null)] as const
      )
    ).then((pairs) => alive && setCards(Object.fromEntries(pairs)));
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return cards;
}

function CategoryTiles({
  onSearch,
}: {
  onSearch: (q: string, patch?: Record<string, string>) => void;
}) {
  const { isOnePiece, setGame } = useGame();
  const navigate = useNavigate();
  const list = CATEGORIES.filter(
    (c) => !(isOnePiece && c.pokemonOnly) && !(isOnePiece && c.id === 'op')
  );
  const art = useCategoryArt(isOnePiece ? [] : list.flatMap((c) => c.art));

  const act = (c: Category) => {
    if (c.go.kind === 'link') navigate(c.go.to);
    else if (c.go.kind === 'game') setGame('onepiece');
    else onSearch(c.go.q, c.go.patch);
  };

  return (
    <section aria-labelledby="ways-h">
      <h2
        id="ways-h"
        className="font-display text-[clamp(1.4rem,2.4vw,1.9rem)] font-semibold tracking-[-0.02em]"
      >
        Ways in
      </h2>
      <ul className="scrollbar-none -mx-4 mt-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {list.map((c) => {
          const wanted = c.go.kind === 'search' ? c.go.patch?.finish : undefined;
          // A finish tile only shows art that really has that finish.
          const cards = c.art
            .map((id) => art[id])
            .filter((x): x is PokemonCard => Boolean(x) && (!wanted || finishOf(x) === wanted));
          return (
            <li
              key={c.id}
              className="w-[72vw] max-w-[20rem] shrink-0 snap-start sm:w-auto sm:max-w-none"
            >
              <button
                type="button"
                onClick={() => act(c)}
                className={cn(
                  'group relative flex h-48 w-full flex-col justify-end overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-left text-white transition-transform duration-200 active:scale-[0.985]',
                  c.tone
                )}
              >
                <span aria-hidden className="absolute -right-4 -top-6 flex">
                  {cards.slice(0, 2).map((card, i) => (
                    <span
                      key={card.id}
                      className={cn(
                        'block w-24 transition-transform duration-300 ease-out',
                        i === 0
                          ? 'rotate-[14deg] group-hover:rotate-[8deg]'
                          : '-ml-12 mt-6 rotate-[-6deg] group-hover:-translate-y-2 group-hover:rotate-[-12deg]'
                      )}
                    >
                      <CardArt card={card as CollectibleSource} />
                    </span>
                  ))}
                  {cards.length === 0 ? (
                    <span className="mr-6 mt-10 font-display text-[88px] font-bold leading-none text-white/10">
                      {c.label.slice(0, 2)}
                    </span>
                  ) : null}
                </span>
                <span className="relative font-display text-[22px] font-semibold leading-tight">
                  {c.label}
                </span>
                <span className="relative mt-1 text-[13px] text-white/75">{c.line}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
