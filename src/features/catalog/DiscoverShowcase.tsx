import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { EraExplorer } from './EraExplorer';
import { GradeComparisonStage } from '../market/components/GradeComparisonStage';
import { fetchTopGradedPremiums, type GradedSpreadRow } from '../../services/gradedPricesApi';
import { Link, useNavigate } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import { PriceHistoryApi, type TopMoverEntry } from '../../services/priceHistoryApi';
import { pokemonApi } from '../../services/pokemonApi';
import { onePieceApi } from '../../services/onepieceApi';
import { moverKey, moverSubtitle, moverToCard } from '../../utils/topMovers';
import { getCardPrice } from '../../utils/cardPrice';
import { useCardModal } from '../../contexts/CardModalContext';
import { useGame } from '../../contexts/GameContext';
import { CardArt } from '../../components/exchange/CardArt';
import { CardTile } from '../../components/exchange/CardTile';
import { Delta, Price } from '../../components/exchange/Price';
import { SectionHeader } from '../../components/exchange/Section';
import { LoadingTiles } from '../../components/exchange/States';
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
 * Catalog landing (no query yet): a compact header with the search, a row
 * of filter tokens into the catalog, the cards rising this week as real art,
 * the newest set and the week's biggest dollar move, then sets by era.
 * Everything sits on the page surface; card art supplies the colour.
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
      <header className="space-y-4 border-b border-rule-strong pb-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <h1 className="font-display text-h1">Catalog</h1>
            <p className="mt-1 text-[13.5px] text-ink-secondary">
              Every printed {isOnePiece ? 'One Piece' : 'Pokémon'} card with its market price,
              source and date.
            </p>
          </div>
          <button type="button" onClick={onAdvanced} className="btn-ghost -mr-2 text-[13px]">
            <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filters
          </button>
        </div>
        <div className="max-w-[44rem]">{search}</div>
        <WaysIn onSearch={onSearch} />
      </header>

      <Trending trending={trending} />

      <div className="grid gap-10 lg:grid-cols-2">
        {!isOnePiece ? <NewestSet /> : null}
        <BiggestMove trending={trending} />
      </div>

      {isOnePiece ? null : <EraExplorer />}
      {isOnePiece ? null : <GradedSpotlight />}

      <section aria-labelledby="names-h">
        <SectionHeader id="names-h" title="Popular names" />
        <div className="mt-3 flex flex-wrap gap-2">
          {POPULAR[isOnePiece ? 'onepiece' : 'pokemon'].map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onSearch(name)}
              className="h-8 rounded-full border border-border-default px-3 text-[13px] text-ink-secondary transition-colors hover:border-accent hover:text-ink-primary"
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

/* ───────────── Rising this week ───────────── */

function Trending({ trending }: { trending: { items: GalleryEntry[]; basis: string } | null }) {
  const { openCard } = useCardModal();
  const { isOnePiece } = useGame();
  return (
    <section aria-labelledby="trend-h">
      <SectionHeader
        id="trend-h"
        title={isOnePiece ? 'Most valuable Luffy prints' : 'Rising this week'}
        note={trending?.basis || undefined}
      />
      {!trending ? (
        <LoadingTiles className="mt-4" count={8} label="Loading trending cards" />
      ) : trending.items.length === 0 ? (
        <p className="mt-3 text-[13px] text-ink-muted">
          No price movement recorded this week. Search the catalog above.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-9">
          {trending.items.slice(0, 9).map((it, i) => (
            <li key={it.key} className={cn(i >= 6 && 'hidden xl:block', i >= 3 && 'max-sm:hidden')}>
              <CardTile
                card={it.card}
                density="compact"
                onSelect={() => openCard(it.card)}
                priority={i < 4}
                figure={<Price value={it.price} size="sm" />}
                aside={it.change != null ? <Delta pct={it.change} /> : null}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ───────────── Newest set ───────────── */

function NewestSet() {
  const [sets, setSets] = useState<PokemonSet[] | null>(null);
  useEffect(() => {
    let alive = true;
    pokemonApi.getSets().then((s) => alive && setSets(s));
    return () => {
      alive = false;
    };
  }, []);
  const latest = useMemo(
    () =>
      [...(sets ?? [])].sort((a, b) =>
        (b.releaseDate || '').localeCompare(a.releaseDate || '')
      )[0] ?? null,
    [sets]
  );
  return (
    <section aria-labelledby="newset-h" className="min-w-0">
      <SectionHeader id="newset-h" title="Newest set" action={{ to: '/sets', label: 'All sets' }} />
      {!latest ? (
        <div className="mt-4 flex items-center gap-4" aria-busy="true">
          <span className="skeleton h-14 w-32 rounded-md" />
          <span className="skeleton h-4 w-40 rounded-sm" />
        </div>
      ) : (
        <Link
          to={`/sets/${encodeURIComponent(latest.id)}`}
          className="group mt-4 flex items-center gap-5"
        >
          {latest.images?.logo ? (
            <img
              src={latest.images.logo}
              alt=""
              className="h-14 w-auto max-w-[9rem] shrink-0 object-contain"
            />
          ) : null}
          <span className="min-w-0">
            <span className="block text-[17px] font-semibold group-hover:underline">
              {latest.name}
            </span>
            <span className="mt-0.5 block text-meta text-ink-muted">
              {[latest.series, `${latest.total} cards`, latest.releaseDate?.replace(/\//g, '-')]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <span className="mt-1 block text-[13px] text-accent">Checklist and set value</span>
          </span>
        </Link>
      )}
    </section>
  );
}

/* ───────────── Biggest dollar move ───────────── */

function BiggestMove({ trending }: { trending: { items: GalleryEntry[] } | null }) {
  const { openCard } = useCardModal();
  const bigMove = useMemo(() => {
    const list = (trending?.items ?? []).filter((i) => i.price != null && i.previous != null);
    return list.sort((a, b) => b.price! - b.previous! - (a.price! - a.previous!))[0] ?? null;
  }, [trending]);
  if (!bigMove) return null;
  const dollars = bigMove.price! - bigMove.previous!;
  return (
    <section aria-labelledby="bigmove-h" className="min-w-0">
      <SectionHeader id="bigmove-h" title="Biggest dollar move" note="Last 7 days" />
      <button
        type="button"
        onClick={() => openCard(bigMove.card)}
        className="group mt-4 grid w-full grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-4 text-left"
      >
        <CardArt card={bigMove.card} alt="" />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold group-hover:underline">
            {bigMove.card.name}
          </span>
          <span className="block truncate text-meta text-ink-muted">{bigMove.subtitle}</span>
          <span className="mt-2 flex flex-wrap items-baseline gap-x-3">
            <Price value={bigMove.price} size="md" />
            <Delta pct={bigMove.change} amount={dollars} />
          </span>
          <span className="mt-0.5 block text-meta text-ink-muted">
            Was <span className="font-mono">${bigMove.previous!.toFixed(2)}</span> a week ago
          </span>
        </span>
      </button>
    </section>
  );
}

/* ───────────── Ways in ───────────── */

interface Category {
  id: string;
  label: string;
  line: string;
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
    go: { kind: 'link', to: '/sets?era=vintage' },
    pokemonOnly: true,
  },
  {
    id: 'modern',
    label: 'Modern',
    line: 'Scarlet & Violet and Sword & Shield',
    go: { kind: 'link', to: '/sets?era=modern' },
    pokemonOnly: true,
  },
  {
    id: 'alt',
    label: 'Alternate arts',
    line: 'Illustration and alternate-art prints',
    go: { kind: 'search', q: 'Umbreon', patch: { finish: 'illustration' } },
    pokemonOnly: true,
  },
  {
    id: 'gold',
    label: 'Gold stars',
    line: 'Gold and star rarity prints',
    go: { kind: 'search', q: 'Pikachu', patch: { finish: 'gold' } },
    pokemonOnly: true,
  },
  {
    id: 'full',
    label: 'Full arts',
    line: 'Ultra and full-art textured foils',
    go: { kind: 'search', q: 'Charizard', patch: { finish: 'textured' } },
    pokemonOnly: true,
  },
  {
    id: 'graded',
    label: 'Graded cards',
    line: 'PSA, CGC and BGS prices and population',
    go: { kind: 'link', to: '/prices' },
  },
  {
    id: 'ja',
    label: 'Japanese cards',
    line: 'The Japanese catalog, searched in English',
    go: { kind: 'search', q: 'Pikachu', patch: { lang: 'ja' } },
    pokemonOnly: true,
  },
  {
    id: 'op',
    label: 'One Piece',
    line: 'Switch the catalog to One Piece',
    go: { kind: 'game' },
  },
];

function WaysIn({ onSearch }: { onSearch: (q: string, patch?: Record<string, string>) => void }) {
  const { isOnePiece, setGame } = useGame();
  const navigate = useNavigate();
  const list = CATEGORIES.filter(
    (c) => !(isOnePiece && c.pokemonOnly) && !(isOnePiece && c.id === 'op')
  );
  const act = (c: Category) => {
    if (c.go.kind === 'link') navigate(c.go.to);
    else if (c.go.kind === 'game') setGame('onepiece');
    else onSearch(c.go.q, c.go.patch);
  };
  return (
    <nav aria-label="Ways into the catalog">
      <ul className="flex flex-wrap gap-2">
        {list.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => act(c)}
              title={c.line}
              className="h-8 rounded-full border border-border-default bg-surface-raised px-3 text-[13px] text-ink-primary transition-colors hover:border-accent"
            >
              {c.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
