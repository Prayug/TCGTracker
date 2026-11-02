import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Download, Heart, Plus } from 'lucide-react';
import { AddToVaultModal } from '../../vault/components/AddToVaultModal';
import {
  setTrackerService,
  type SetSummary,
  type SetTrackerCard,
  type ValueHistoryRange,
  VALUE_HISTORY_RANGES,
} from '../../../services/setTrackerService';
import { setWishlistService } from '../../../services/setWishlistService';
import { onePieceApi } from '../../../services/onepieceApi';
import type { OnePieceCard } from '../../../types/onepiece';
import type { PokemonCard, PokemonSet } from '../../../types/pokemon';
import { useGame } from '../../../contexts/GameContext';
import { useCardModal } from '../../../contexts/CardModalContext';
import { sortSetTrackerCards, type SetCardSort } from '../../../utils/setCardSort';
import { formatReleaseYear } from '../../../utils/setEra';
import { CardArt } from '../../../components/exchange/CardArt';
import { Basis, Price, Unavailable } from '../../../components/exchange/Price';
import { StepPriceChart } from '../../../components/exchange/StepPriceChart';
import { SetLogo } from './SetLogo';
import { cn } from '@/lib/utils';
import { motion, useReducedMotion } from 'motion/react';
import { HolographicCard } from '../../../components/collectible/HolographicCard';
import { finishOf } from '../../../components/collectible/finish';
import { tone } from '../eraTone';

interface SetDetailProps {
  setId: string;
  onBack: () => void;
}

type Show = 'all' | 'owned' | 'missing' | 'wishlist';
type Layout = 'grid' | 'list';

const SORT_LABEL: Record<SetCardSort, string> = {
  number: 'Card number',
  'price-high': 'Price, high to low',
  'price-low': 'Price, low to high',
  name: 'Name',
  rarity: 'Rarity',
};

function priceOf(c: SetTrackerCard): number | null {
  return c.marketPrice != null && c.marketPrice > 0 ? c.marketPrice : null;
}

function downloadCsv(name: string, rows: string[][]) {
  const csv = rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Set detail: a checklist first. Completion and cost to complete are
 * computed from the checklist and say what they leave out (unpriced cards).
 */
export const SetDetail: React.FC<SetDetailProps> = ({ setId, onBack }) => {
  const { isOnePiece, game } = useGame();
  const { openCard } = useCardModal();
  const [params, setParams] = useSearchParams();
  const show = (['all', 'owned', 'missing', 'wishlist'].find((s) => s === params.get('show')) ??
    'all') as Show;
  const sort = (Object.keys(SORT_LABEL).find((s) => s === params.get('sort')) ??
    'number') as SetCardSort;
  const layout: Layout = params.get('view') === 'list' ? 'list' : 'grid';

  const [meta, setMeta] = useState<PokemonSet | null>(null);
  const [cards, setCards] = useState<SetTrackerCard[]>([]);
  const [summary, setSummary] = useState<SetSummary | null>(null);
  const [wish, setWish] = useState<Set<string>>(() =>
    isOnePiece ? new Set() : setWishlistService.getWishlistForSet(setId)
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<ValueHistoryRange>('90d');
  const [history, setHistory] = useState<{ date: string; price: number }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [adding, setAdding] = useState<SetTrackerCard | null>(null);
  const historyReq = useRef(0);

  const setParam = (k: string, v: string, fallback: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v === fallback) next.delete(k);
        else next.set(k, v);
        return next;
      },
      { replace: true, preventScrollReset: true }
    );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isOnePiece) {
        const op = await onePieceApi.getSetCards(setId);
        setCards(op as unknown as SetTrackerCard[]);
        setSummary(null);
        setMeta(null);
      } else {
        const w = setWishlistService.getWishlistForSet(setId);
        setWish(w);
        const res = await setTrackerService.getSetCards(setId);
        const sum = await setTrackerService.getSetSummary(setId, w);
        setMeta(res.set);
        setCards(res.cards);
        setSummary(sum.summary);
      }
    } catch (e) {
      setError((e as Error).message || 'This set did not load.');
    } finally {
      setLoading(false);
    }
  }, [setId, isOnePiece]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (isOnePiece || loading) return;
    const req = ++historyReq.current;
    setHistoryLoading(true);
    setTrackerService
      .getSetValueHistory(setId, range)
      .then(
        (h) =>
          req === historyReq.current &&
          setHistory(setTrackerService.toPricePoints(h, summary?.totalCards))
      )
      .catch(() => req === historyReq.current && setHistory([]))
      .finally(() => req === historyReq.current && setHistoryLoading(false));
  }, [setId, range, isOnePiece, loading, summary?.totalCards]);

  const counts = useMemo(
    () => ({
      all: cards.length,
      owned: cards.filter((c) => c.owned).length,
      missing: cards.filter((c) => !c.owned).length,
      wishlist: cards.filter((c) => wish.has(c.id)).length,
    }),
    [cards, wish]
  );
  const missingUnpriced = useMemo(
    () => cards.filter((c) => !c.owned && priceOf(c) == null).length,
    [cards]
  );
  const unpriced = useMemo(() => cards.filter((c) => priceOf(c) == null).length, [cards]);
  const opValue = useMemo(() => cards.reduce((s, c) => s + (priceOf(c) ?? 0), 0), [cards]);

  const visible = useMemo(() => {
    const list = cards.filter((c) =>
      show === 'owned'
        ? c.owned
        : show === 'missing'
          ? !c.owned
          : show === 'wishlist'
            ? wish.has(c.id)
            : true
    );
    return sortSetTrackerCards(list, sort);
  }, [cards, show, sort, wish]);

  const toggleWish = (id: string) => {
    setWishlistService.toggleWishlist(setId, id);
    setWish(setWishlistService.getWishlistForSet(setId));
  };

  const open = (c: SetTrackerCard) => openCard({ ...(c as PokemonCard), types: c.types ?? [] });
  const name = meta?.name || (isOnePiece ? setId.toUpperCase() : setId);
  const year = meta ? formatReleaseYear(meta.releaseDate) : undefined;

  const exportCsv = (onlyMissing: boolean) => {
    const rows = (
      onlyMissing
        ? sortSetTrackerCards(
            cards.filter((c) => !c.owned),
            'price-low'
          )
        : sortSetTrackerCards(cards, 'number')
    ).map((c) => [
      c.number ?? '',
      c.name,
      c.rarity ?? '',
      c.owned ? 'yes' : 'no',
      wish.has(c.id) ? 'yes' : 'no',
      priceOf(c) != null ? (priceOf(c) as number).toFixed(2) : '',
    ]);
    downloadCsv(
      `${name.replace(/\s+/g, '-').toLowerCase()}-${onlyMissing ? 'missing' : 'checklist'}.csv`,
      [
        ['Number', 'Name', 'Rarity', 'Owned', 'Wishlist', 'Market price (blank = no price)'],
        ...rows,
      ]
    );
  };

  if (loading && cards.length === 0) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="skeleton h-10 w-1/2 rounded" />
        <div className="skeleton h-24 rounded" />
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[63/88] rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink onBack={onBack} />
        <Unavailable title="This set did not load">
          {error}{' '}
          <button
            type="button"
            onClick={() => void reload()}
            className="text-accent hover:underline"
          >
            Try again
          </button>
        </Unavailable>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <BackLink onBack={onBack} />
        <SetAlbumCover
          name={name}
          meta={meta}
          year={year}
          cards={cards}
          owned={summary?.ownedCount ?? counts.owned}
          total={summary?.totalCards ?? cards.length}
          wished={counts.wishlist}
          isOnePiece={isOnePiece}
          onOpen={open}
        />
      </div>

      {/* Ruled summary */}
      {summary ? (
        <section
          aria-label="Set summary"
          className="grid grid-cols-2 gap-x-6 gap-y-6 sm:gap-x-10 lg:grid-cols-4"
        >
          <div>
            <p className="text-meta text-ink-muted">Completion</p>
            <p className="mt-1 font-mono text-[28px] font-medium leading-none tabular-nums">
              {summary.ownedCount}
              <span className="text-[16px] text-ink-muted"> / {summary.totalCards}</span>
            </p>
            <span
              className="mt-2.5 block h-2 overflow-hidden rounded-sm bg-surface-hover"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(summary.completionPct)}
              aria-label="Share of the set owned"
            >
              <span
                className={cn(
                  'block h-full',
                  summary.completionPct >= 100 ? 'bg-gold' : 'bg-ink-primary'
                )}
                style={{ width: `${Math.min(100, summary.completionPct)}%` }}
              />
            </span>
            <p className="mt-1.5 text-[12px] text-ink-muted">Distinct cards in your vault</p>
          </div>
          <div>
            <p className="text-meta text-ink-muted">Set value</p>
            <Price value={summary.masterSetValue} size="lg" className="mt-1 block" />
            <Basis
              kind="Market estimate"
              source="TCGplayer"
              detail={`${summary.pricedCardCount} of ${summary.totalCards} priced${(summary.reverseHoloCount ?? 0) > 0 ? ` · incl. ${summary.reverseHoloCount} reverse holos` : ''}`}
              className="mt-1.5"
            />
          </div>
          <div>
            <p className="text-meta text-ink-muted">Your part of it</p>
            <Price
              value={summary.ownedValue}
              size="lg"
              className="mt-1 block"
              unavailableLabel="Nothing owned yet"
            />
            <p className="mt-1.5 text-[12px] text-ink-muted">Owned cards at market</p>
          </div>
          <div>
            <p className="text-meta text-ink-muted">Cost to complete</p>
            <Price
              value={summary.costToComplete}
              size="lg"
              className="mt-1 block"
              unavailableLabel={counts.missing ? 'Unknown' : 'Complete'}
            />
            <p className="mt-1.5 text-[12px] text-ink-muted">
              {missingUnpriced > 0
                ? `${missingUnpriced} missing card${missingUnpriced === 1 ? ' has' : 's have'} no price and ${missingUnpriced === 1 ? 'is' : 'are'} not included`
                : 'Missing cards at market'}
            </p>
          </div>
        </section>
      ) : isOnePiece ? (
        <section aria-label="Set summary" className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
          <div>
            <p className="text-meta text-ink-muted">Set value</p>
            <Price value={opValue} size="lg" className="mt-1 block" />
            <Basis
              kind="Market estimate"
              source="TCGplayer"
              detail={`${cards.length - unpriced} of ${cards.length} priced`}
              className="mt-1.5"
            />
          </div>
        </section>
      ) : null}

      {!isOnePiece ? (
        <section aria-labelledby="hist-h">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule-strong pb-2">
            <div>
              <h2 id="hist-h" className="text-h2">
                Set value over time
              </h2>
              <p className="text-meta text-ink-muted">
                Daily total of the checklist at market. Days with too few prices are left out.
              </p>
            </div>
            <div className="segmented" role="radiogroup" aria-label="Range">
              {VALUE_HISTORY_RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  role="radio"
                  aria-checked={range === r.key}
                  onClick={() => setRange(r.key)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {historyLoading && history.length === 0 ? (
            <div className="skeleton mt-4 h-60 rounded" />
          ) : history.length > 1 ? (
            <div className={cn('mt-4', historyLoading && 'opacity-60')}>
              <StepPriceChart
                title={`${name} set value`}
                series={[
                  {
                    key: 'set',
                    label: 'Set value',
                    color: 'var(--chart-series-1)',
                    points: history,
                  },
                ]}
                height={220}
              />
            </div>
          ) : (
            <p className="mt-3 text-meta text-ink-muted">
              Not enough price history for this set yet.
            </p>
          )}
        </section>
      ) : null}

      <section aria-labelledby="list-h">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule-strong pb-2">
          <h2 id="list-h" className="text-h2">
            Checklist
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="set-sort" className="sr-only">
              Sort
            </label>
            <select
              id="set-sort"
              value={sort}
              onChange={(e) => setParam('sort', e.target.value, 'number')}
              className="input h-9 w-auto text-[13px]"
            >
              {(Object.keys(SORT_LABEL) as SetCardSort[]).map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
            </select>
            <div className="segmented" role="radiogroup" aria-label="Layout">
              {(['grid', 'list'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={layout === v}
                  onClick={() => setParam('view', v, 'grid')}
                >
                  {v === 'grid' ? 'Grid' : 'List'}
                </button>
              ))}
            </div>
            {!isOnePiece ? (
              <button
                type="button"
                onClick={() => exportCsv(show === 'missing')}
                className="btn-ghost h-9"
              >
                <Download className="h-4 w-4" aria-hidden />
                {show === 'missing' ? 'Export missing' : 'Export CSV'}
              </button>
            ) : null}
          </div>
        </div>

        {!isOnePiece ? (
          <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Show">
            {(['all', 'owned', 'missing', 'wishlist'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={show === s}
                onClick={() => setParam('show', s, 'all')}
                className={cn(
                  'h-8 rounded-full border px-3 text-[13px] font-medium',
                  show === s
                    ? 'border-ink-primary bg-ink-primary text-surface-base'
                    : 'border-border-strong text-ink-secondary hover:text-ink-primary'
                )}
              >
                {s === 'all'
                  ? 'All'
                  : s === 'owned'
                    ? 'Owned'
                    : s === 'missing'
                      ? 'Missing'
                      : 'Wishlist'}
                <span className="ml-1.5 font-mono text-[12px] opacity-80">{counts[s]}</span>
              </button>
            ))}
          </div>
        ) : null}

        {visible.length === 0 ? (
          <p className="mt-6 text-meta text-ink-muted">
            {show === 'owned'
              ? 'You don’t own a card from this set yet.'
              : show === 'wishlist'
                ? 'No cards from this set are on your wishlist.'
                : show === 'missing'
                  ? 'Nothing missing. The set is complete.'
                  : 'This set has no cards in the catalog.'}
          </p>
        ) : layout === 'grid' ? (
          <ul className="mt-5 grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:gap-x-5 lg:grid-cols-6 xl:grid-cols-8">
            {visible.map((c) => (
              <ChecklistTile
                key={c.id}
                card={c}
                wished={wish.has(c.id)}
                showActions={!isOnePiece}
                onOpen={() => open(c)}
                onWish={() => toggleWish(c.id)}
                onAdd={() => setAdding(c)}
              />
            ))}
          </ul>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="ledger ledger-tight">
              <caption className="sr-only">{name} checklist</caption>
              <thead>
                <tr>
                  <th scope="col" className="num w-14">
                    No.
                  </th>
                  <th scope="col">Card</th>
                  <th scope="col" className="hidden md:table-cell">
                    Rarity
                  </th>
                  <th scope="col" className="num">
                    Market
                  </th>
                  {!isOnePiece ? (
                    <>
                      <th scope="col" className="hidden sm:table-cell">
                        Status
                      </th>
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id}>
                    <td className="num text-ink-muted">{c.number}</td>
                    <th scope="row" className="text-left font-normal">
                      <button
                        type="button"
                        onClick={() => open(c)}
                        className="block max-w-[40vw] truncate text-left font-medium hover:underline sm:max-w-none"
                      >
                        {c.name}
                      </button>
                    </th>
                    <td className="hidden text-ink-secondary md:table-cell">{c.rarity || '—'}</td>
                    <td className="num">
                      <Price value={priceOf(c)} size="sm" />
                    </td>
                    {!isOnePiece ? (
                      <>
                        <td className="hidden sm:table-cell">
                          {c.owned ? (
                            <span className="text-[12.5px] font-medium text-gold">Owned</span>
                          ) : wish.has(c.id) ? (
                            <span className="text-[12.5px] text-ink-secondary">Wanted</span>
                          ) : (
                            <span className="text-[12.5px] text-ink-muted">Missing</span>
                          )}
                        </td>
                        <td className="w-[4.5rem] text-right">
                          <RowActions
                            card={c}
                            wished={wish.has(c.id)}
                            onWish={() => toggleWish(c.id)}
                            onAdd={() => setAdding(c)}
                          />
                        </td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AddToVaultModal
        card={adding}
        isOpen={adding != null}
        onClose={() => setAdding(null)}
        onSuccess={() => {
          setAdding(null);
          void reload();
        }}
        game={game}
      />
    </div>
  );
};

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink-primary"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      All sets
    </button>
  );
}

function RowActions({
  card,
  wished,
  onWish,
  onAdd,
}: {
  card: SetTrackerCard;
  wished: boolean;
  onWish: () => void;
  onAdd: () => void;
}) {
  return (
    <span className="inline-flex">
      {!card.owned ? (
        <button
          type="button"
          onClick={onWish}
          aria-pressed={wished}
          aria-label={wished ? `Remove ${card.name} from set wishlist` : `Want ${card.name}`}
          className={cn(
            'grid h-8 w-8 place-items-center rounded-md hover:bg-surface-hover',
            wished ? 'text-loss' : 'text-ink-muted'
          )}
        >
          <Heart className="h-4 w-4" fill={wished ? 'currentColor' : 'none'} aria-hidden />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onAdd}
        aria-label={`Add ${card.name} to collection`}
        className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink-primary"
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </span>
  );
}

function ChecklistTile({
  card,
  wished,
  showActions,
  onOpen,
  onWish,
  onAdd,
}: {
  card: SetTrackerCard | OnePieceCard;
  wished: boolean;
  showActions: boolean;
  onOpen: () => void;
  onWish: () => void;
  onAdd: () => void;
}) {
  const c = card as SetTrackerCard;
  const owned = Boolean(c.owned);
  const missing = showActions && !owned;
  const state = !showActions
    ? ''
    : owned
      ? ', owned'
      : wished
        ? ', wishlisted, missing'
        : ', missing';
  return (
    <li className="group min-w-0">
      <div className="relative">
        {missing ? (
          // A missing card sits in an empty sleeve: the art is a faint ghost until you look at it.
          <button
            type="button"
            onClick={onOpen}
            aria-label={`${c.number ? `No. ${c.number} ` : ''}${c.name}${state}`}
            className={cn(
              'relative block w-full overflow-hidden rounded-[6%/4.3%] border-2 border-dashed p-[5%] text-left transition-colors',
              wished
                ? 'border-[color:var(--ember)] bg-[color:var(--ember)]/5'
                : 'border-rule-strong bg-surface-hover/50'
            )}
          >
            <CardArt
              card={c}
              flat
              className="opacity-30 grayscale transition-[filter,opacity] duration-300 group-hover:opacity-90 group-hover:grayscale-0"
            />
            <span className="pointer-events-none absolute inset-x-0 bottom-[8%] text-center font-mono text-[11px] font-medium text-ink-muted group-hover:opacity-0">
              {c.number ? `#${c.number}` : 'Missing'}
            </span>
          </button>
        ) : (
          <HolographicCard
            card={c}
            level={owned && finishOf(c) !== 'none' ? 'featured' : 'standard'}
            onSelect={onOpen}
            label={`${c.number ? `No. ${c.number} ` : ''}${c.name}${state}`}
          />
        )}
        {owned && showActions ? (
          <span
            className="pointer-events-none absolute -right-1.5 -top-1.5 z-10 grid h-6 w-6 place-items-center rounded-full bg-gold text-surface-base shadow-md ring-2 ring-surface-base"
            aria-hidden
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        ) : wished && showActions ? (
          <span
            className="pointer-events-none absolute -right-1.5 -top-1.5 z-10 grid h-6 w-6 place-items-center rounded-full bg-[color:var(--ember)] text-white shadow-md ring-2 ring-surface-base"
            aria-hidden
          >
            <Heart className="h-3 w-3" fill="currentColor" />
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          'mt-2 truncate text-[12.5px] font-medium leading-snug',
          missing && 'text-ink-muted'
        )}
        title={c.name}
      >
        <span className="font-mono text-[11.5px] text-ink-muted">{c.number}</span> {c.name}
      </p>
      <div className="flex items-center justify-between gap-1">
        <Price value={priceOf(c)} size="sm" />
        {showActions ? (
          <span className="hidden sm:inline [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
            <RowActions card={c} wished={wished} onWish={onWish} onAdd={onAdd} />
          </span>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The set as an album cover: its era colour, the real logo, the three most
 * valuable cards fanned out (owned ones first), and a completion ring.
 */
function SetAlbumCover({
  name,
  meta,
  year,
  cards,
  owned,
  total,
  wished,
  isOnePiece,
  onOpen,
}: {
  total: number;
  name: string;
  meta: PokemonSet | null;
  year?: string;
  cards: SetTrackerCard[];
  owned: number;
  wished: number;
  isOnePiece: boolean;
  onOpen: (c: SetTrackerCard) => void;
}) {
  const reduce = useReducedMotion();
  const t = tone(meta?.era || (isOnePiece ? 'promo' : 'other'));
  const pct = total ? Math.min(100, (owned / total) * 100) : 0;
  const chase = useMemo(
    () =>
      [...cards]
        .filter((c) => c.images?.small || c.images?.large)
        .sort((a, b) => (priceOf(b) ?? -1) - (priceOf(a) ?? -1))
        .slice(0, 3),
    [cards]
  );
  const R = 46;
  const C = 2 * Math.PI * R;
  return (
    <section
      data-theme="dark"
      aria-label={`${name} album`}
      className="relative mt-3 overflow-hidden rounded-3xl text-white"
      style={{ background: `radial-gradient(110% 120% at 90% 10%, ${t.from}, #0b0e14 72%)` }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.03)_0_2px,transparent_2px_10px)]"
      />
      <div className="relative grid gap-6 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
        <div className="min-w-0">
          {meta ? (
            <SetLogo
              set={meta}
              size="lg"
              className="h-16 w-48 border-0 bg-transparent p-0 [&_img]:max-h-16"
            />
          ) : null}
          <h1 className="mt-3 font-display text-[clamp(2rem,4.4vw,3.4rem)] font-semibold leading-[0.95] tracking-[-0.03em]">
            {name}
          </h1>
          <p className="mt-2 font-mono text-[12.5px] text-white/65">
            {[
              meta?.series,
              year ? `Released ${year}` : null,
              `${total} cards`,
              meta?.id?.toUpperCase(),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {!isOnePiece && total ? (
            <div className="mt-6 flex items-center gap-5">
              <svg
                viewBox="0 0 110 110"
                className="h-24 w-24 shrink-0 -rotate-90"
                role="img"
                aria-label={`${owned} of ${total} owned, ${Math.round(pct)} percent`}
              >
                <circle
                  cx="55"
                  cy="55"
                  r={R}
                  fill="none"
                  stroke="rgba(255,255,255,0.14)"
                  strokeWidth="9"
                />
                <motion.circle
                  cx="55"
                  cy="55"
                  r={R}
                  fill="none"
                  stroke={pct >= 100 ? '#f0bd55' : t.accent}
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  initial={{ strokeDashoffset: reduce ? C * (1 - pct / 100) : C }}
                  animate={{ strokeDashoffset: C * (1 - pct / 100) }}
                  transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
                />
              </svg>
              <div>
                <p className="font-mono text-[30px] font-medium leading-none tabular-nums">
                  {owned}
                  <span className="text-[16px] text-white/55"> / {total}</span>
                </p>
                <p className="mt-1.5 text-[13px] text-white/70">
                  {owned === 0 ? 'Not started' : pct >= 100 ? 'Complete' : `${total - owned} to go`}
                  {wished ? ` · ${wished} on your wishlist` : ''}
                </p>
              </div>
            </div>
          ) : null}
        </div>
        {chase.length ? (
          <div
            className="relative mx-auto h-[15rem] w-full max-w-[26rem] sm:h-[19rem]"
            aria-label="Most valuable cards in this set"
          >
            {chase.map((c, i) => {
              // Most valuable in the middle and in front, the next two either side.
              const slot = chase.length === 1 ? 1 : [1, 0, 2][i];
              const pose = [
                { left: '28%', r: -10, y: 18, z: 1 },
                { left: '50%', r: 0, y: 0, z: 3 },
                { left: '72%', r: 10, y: 18, z: 2 },
              ][slot];
              return (
                <motion.div
                  key={c.id}
                  className="absolute top-0 w-[38%] max-w-[10.5rem]"
                  style={{ left: pose.left, zIndex: pose.z, x: '-50%' }}
                  initial={reduce ? false : { opacity: 0, y: 40, rotate: 0 }}
                  animate={{ opacity: 1, y: pose.y, rotate: pose.r }}
                  transition={{
                    type: 'spring',
                    stiffness: 160,
                    damping: 20,
                    delay: reduce ? 0 : 0.1 + i * 0.08,
                  }}
                >
                  <HolographicCard
                    card={c}
                    level={i === 0 ? 'showcase' : 'featured'}
                    onSelect={() => onOpen(c)}
                    label={`${c.name}, ${priceOf(c) != null ? `$${(priceOf(c) as number).toFixed(2)}` : 'no price'}${c.owned ? ', owned' : ', not owned'}`}
                    priority
                  />
                </motion.div>
              );
            })}
            <p className="absolute inset-x-0 bottom-0 text-center font-mono text-[11.5px] text-white/60">
              {chase.length === 1
                ? 'The most valuable card'
                : `The ${chase.length} most valuable cards`}{' '}
              · {chase.filter((c) => c.owned).length} owned
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
