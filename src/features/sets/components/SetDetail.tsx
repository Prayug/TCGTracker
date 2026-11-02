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
        <div className="mt-3 flex items-end gap-4 border-b border-rule-strong pb-4">
          {meta ? <SetLogo set={meta} size="lg" className="border-0 bg-transparent p-0" /> : null}
          <div className="min-w-0">
            <h1 className="font-display text-h1">{name}</h1>
            <p className="text-meta text-ink-muted">
              {[
                meta?.series,
                year ? `Released ${year}` : null,
                `${cards.length} cards`,
                meta?.id?.toUpperCase(),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
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
  return (
    <li className="group min-w-0">
      <button
        type="button"
        onClick={onOpen}
        className="relative block w-full text-left"
        aria-label={`${c.number ? `No. ${c.number} ` : ''}${c.name}${showActions ? (owned ? ', owned' : ', missing') : ''}`}
      >
        <CardArt
          card={c}
          className={cn(
            'transition-[filter,opacity] duration-150',
            showActions &&
              !owned &&
              'opacity-55 grayscale-[0.7] group-hover:opacity-100 group-hover:grayscale-0'
          )}
          flat={showActions && !owned}
        />
        {owned ? (
          <span
            className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-gold text-surface-base shadow-sm"
            aria-hidden
          >
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        ) : null}
      </button>
      <p className="mt-2 truncate text-[12.5px] font-medium leading-snug" title={c.name}>
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
