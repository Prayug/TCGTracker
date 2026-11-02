import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { arc as d3arc, pie as d3pie } from 'd3-shape';
import type { VaultCard } from '../../../types/pokemon';
import { CardArt } from '../../../components/exchange/CardArt';
import { useElementWidth } from '../../../components/exchange/useElementWidth';
import { formatCurrency } from '../../../utils/cardDisplay';
import {
  allocateBy,
  byEraWith,
  bySet,
  eraCoverage,
  treemap,
  type AllocationSlice,
} from '../../../utils/portfolio';
import { holdingMarketValue } from '../../../utils/vaultCost';
import { CONDITION_LABEL } from '../ledger';
import { cn } from '@/lib/utils';

const SLICE_COLORS = ['#2f56e6', '#e3a73a', '#1fb38a', '#a06cf0', '#ff7a3d', '#5aa9e6', '#8d93a0'];
const ERA_COLORS: Record<string, string> = {
  Vintage: '#c4892b',
  'Mid-era': '#1fb38a',
  Modern: '#2f56e6',
  Unknown: '#8d93a0',
};

type View = 'era' | 'set' | 'condition' | 'map';
const VIEWS: { id: View; label: string }[] = [
  { id: 'map', label: 'Value map' },
  { id: 'era', label: 'Era' },
  { id: 'set', label: 'Set' },
  { id: 'condition', label: 'Condition' },
];

/**
 * Where the collection's value sits, four ways. Every group drills down:
 * selecting it opens the holdings filtered to that group.
 */
export function AllocationExplorer({
  cards,
  setDates,
  onOpen,
  onFilter,
}: {
  cards: VaultCard[];
  setDates: ReadonlyMap<string, string>;
  onOpen: (vc: VaultCard) => void;
  onFilter: (patch: Record<string, string>) => void;
}) {
  const [view, setView] = useState<View>('map');
  const eraKey = useMemo(() => byEraWith(setDates), [setDates]);
  const coverage = useMemo(() => eraCoverage(cards, setDates), [cards, setDates]);
  const slices = useMemo(() => {
    if (view === 'era') return allocateBy(cards, eraKey, 6);
    if (view === 'set') return allocateBy(cards, bySet, 8);
    if (view === 'condition')
      return allocateBy(
        cards,
        (vc) => ({ key: vc.condition, label: CONDITION_LABEL[vc.condition] ?? vc.condition }),
        6
      );
    return [];
  }, [cards, view, eraKey]);

  const drill = (s: AllocationSlice) => {
    if (s.key === '__other') return;
    if (view === 'era') onFilter({ era: s.key });
    else if (view === 'set') onFilter({ set: s.key });
    else if (view === 'condition') onFilter({ condition: s.key });
  };

  return (
    <section
      aria-labelledby="alloc-h"
      className="rounded-3xl border border-border-default bg-surface-raised p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="alloc-h" className="font-display text-[19px] font-semibold">
            Where the value sits
          </h3>
          <p className="text-[12.5px] text-ink-muted">
            Priced holdings only. Select a group to see those holdings.
          </p>
        </div>
        <div className="segmented" role="group" aria-label="Group by">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={view === v.id}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'map' ? (
        <ValueMap cards={cards} onOpen={onOpen} />
      ) : slices.length === 0 ? (
        <p className="mt-4 text-[13.5px] text-ink-muted">No priced holdings yet.</p>
      ) : view === 'set' ? (
        <SetBars slices={slices} onDrill={drill} />
      ) : (
        <Ring
          slices={slices}
          colorOf={(s, i) =>
            view === 'era'
              ? (ERA_COLORS[s.key] ?? '#8d93a0')
              : SLICE_COLORS[i % SLICE_COLORS.length]
          }
          label={view}
          onDrill={drill}
        />
      )}

      {view === 'era' ? (
        <EraNotes
          coverage={coverage}
          onOpen={onOpen}
          onShowAll={() => onFilter({ era: 'Unknown' })}
        />
      ) : null}
    </section>
  );
}

function Ring({
  slices,
  colorOf,
  label,
  onDrill,
}: {
  slices: AllocationSlice[];
  colorOf: (s: AllocationSlice, i: number) => string;
  label: string;
  onDrill: (s: AllocationSlice) => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  const size = 220;
  const arcs = useMemo(
    () =>
      d3pie<AllocationSlice>()
        .value((s) => s.value)
        .sort(null)
        .padAngle(0.015)(slices),
    [slices]
  );
  const arcGen = d3arc<(typeof arcs)[number]>()
    .innerRadius(size * 0.3)
    .outerRadius(size * 0.46)
    .cornerRadius(3);
  const arcHot = d3arc<(typeof arcs)[number]>()
    .innerRadius(size * 0.29)
    .outerRadius(size * 0.5)
    .cornerRadius(3);
  const current = slices.find((s) => s.key === active) ?? null;
  const total = slices.reduce((s, x) => s + x.value, 0);
  return (
    <div className="mt-4 grid items-center gap-6 sm:grid-cols-[auto_minmax(0,1fr)]">
      <svg
        viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
        className="mx-auto w-[200px]"
        role="img"
        aria-label={`Market value by ${label}: ${slices
          .map((s) => `${s.label} ${Math.round(s.share * 100)}%`)
          .join(', ')}`}
      >
        {arcs.map((a, i) => (
          <motion.path
            key={a.data.key}
            d={(a.data.key === active ? arcHot(a) : arcGen(a)) ?? ''}
            fill={colorOf(a.data, i)}
            initial={{ opacity: 0 }}
            animate={{ opacity: active && a.data.key !== active ? 0.35 : 1 }}
            transition={{ duration: 0.25 }}
            onPointerEnter={() => setActive(a.data.key)}
            onPointerLeave={() => setActive(null)}
            onClick={() => onDrill(a.data)}
            className="cursor-pointer"
          />
        ))}
        <text textAnchor="middle" y={-4} className="fill-[var(--ink-muted)] text-[11px]">
          {current ? current.label : 'Total'}
        </text>
        <text
          textAnchor="middle"
          y={16}
          className="fill-[var(--ink-primary)] font-mono text-[16px] font-medium"
        >
          {formatCurrency(current ? current.value : total)}
        </text>
      </svg>
      <ul className="space-y-1">
        {slices.map((s, i) => (
          <li key={s.key}>
            <button
              type="button"
              onPointerEnter={() => setActive(s.key)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(s.key)}
              onBlur={() => setActive(null)}
              onClick={() => onDrill(s)}
              disabled={s.key === '__other'}
              className={cn(
                'grid w-full grid-cols-[0.75rem_minmax(0,1fr)_auto_3rem] items-center gap-3 rounded-lg px-2 py-1.5 text-left text-[13px] disabled:cursor-default',
                active === s.key && 'bg-surface-hover'
              )}
            >
              <span className="h-3 w-3 rounded-sm" style={{ background: colorOf(s, i) }} />
              <span className="truncate">
                {s.label}
                <span className="ml-1.5 text-[11.5px] text-ink-muted">{s.copies} cards</span>
              </span>
              <span className="font-mono tabular-nums text-ink-secondary">
                {formatCurrency(s.value)}
              </span>
              <span className="text-right font-mono tabular-nums text-ink-muted">
                {Math.round(s.share * 100)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SetBars({
  slices,
  onDrill,
}: {
  slices: AllocationSlice[];
  onDrill: (s: AllocationSlice) => void;
}) {
  const max = Math.max(...slices.map((s) => s.value), 1);
  return (
    <ul className="mt-4 space-y-1.5" aria-label="Market value by set">
      {slices.map((s, i) => (
        <li key={s.key}>
          <button
            type="button"
            onClick={() => onDrill(s)}
            disabled={s.key === '__other'}
            className="group grid w-full grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-surface-hover disabled:cursor-default disabled:hover:bg-transparent"
          >
            <span className="truncate">{s.label}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-surface-inset">
              <motion.span
                className="block h-full rounded-full"
                style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }}
                initial={{ width: 0 }}
                animate={{ width: `${(s.value / max) * 100}%` }}
                transition={{ type: 'spring', stiffness: 140, damping: 22, delay: i * 0.03 }}
              />
            </span>
            <span className="w-24 text-right font-mono tabular-nums text-ink-secondary">
              {formatCurrency(s.value)}
              <span className="ml-1.5 text-[11.5px] text-ink-muted">
                {Math.round(s.share * 100)}%
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Treemap of the most valuable holdings, art-filled; area is market value. */
function ValueMap({ cards, onOpen }: { cards: VaultCard[]; onOpen: (vc: VaultCard) => void }) {
  const [wrap, width] = useElementWidth<HTMLDivElement>(560);
  const height = width < 480 ? 300 : 340;
  const tiles = useMemo(() => {
    const priced = cards
      .map((vc) => ({ item: vc, value: holdingMarketValue(vc) }))
      .filter((t) => t.value > 0)
      .sort((a, b) => b.value - a.value);
    const head = priced.slice(0, 14);
    const restValue = priced.slice(14).reduce((s, t) => s + t.value, 0);
    const items: { item: VaultCard | null; value: number }[] = [...head];
    if (restValue > 0) items.push({ item: null, value: restValue });
    return treemap(items, width, height);
  }, [cards, width, height]);
  const total = tiles.reduce((s, t) => s + t.value, 0);
  const rest = cards.filter((vc) => holdingMarketValue(vc) > 0).length - 14;

  if (!tiles.length)
    return <p className="mt-4 text-[13.5px] text-ink-muted">No priced holdings yet.</p>;
  return (
    <div ref={wrap} className="relative mt-4 overflow-hidden rounded-2xl" style={{ height }}>
      {tiles.map((t, i) => {
        const share = t.value / total;
        const big = t.w > 90 && t.h > 70;
        const inner = (
          <>
            {t.item ? (
              <span className="absolute inset-0 overflow-hidden">
                <CardArt
                  card={t.item.card}
                  flat
                  alt=""
                  className="h-full !aspect-auto !rounded-none"
                  imgClassName="object-[50%_18%]"
                />
              </span>
            ) : null}
            <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
            <span className="absolute inset-x-0 bottom-0 p-2 text-left text-white">
              {big ? (
                <span className="block truncate text-[12.5px] font-medium">
                  {t.item ? t.item.card.name : `${rest} more holdings`}
                </span>
              ) : null}
              <span className="block font-mono text-[11.5px] tabular-nums text-white/85">
                {t.w > 56 ? formatCurrency(t.value) : ''}
                {big ? ` · ${(share * 100).toFixed(1)}%` : ''}
              </span>
            </span>
          </>
        );
        const style = {
          left: t.x,
          top: t.y,
          width: Math.max(0, t.w - 2),
          height: Math.max(0, t.h - 2),
        };
        return t.item ? (
          <motion.button
            key={t.item.id}
            type="button"
            onClick={() => onOpen(t.item as VaultCard)}
            aria-label={`${t.item.card.name}: ${formatCurrency(t.value)}, ${(share * 100).toFixed(1)}% of value. Open holding.`}
            className="absolute overflow-hidden rounded-lg bg-surface-inset outline-offset-2 transition-[filter] hover:brightness-110"
            style={style}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: i * 0.02 }}
          >
            {inner}
          </motion.button>
        ) : (
          <div
            key="__rest"
            className="absolute overflow-hidden rounded-lg bg-surface-inset"
            style={style}
            aria-label={`${rest} more holdings: ${formatCurrency(t.value)}`}
            role="img"
          >
            <span className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_8px,rgba(127,127,127,0.12)_8px_9px)]" />
            {inner}
          </div>
        );
      })}
    </div>
  );
}

function EraNotes({
  coverage,
  onOpen,
  onShowAll,
}: {
  coverage: ReturnType<typeof eraCoverage>;
  onOpen: (vc: VaultCard) => void;
  onShowAll: () => void;
}) {
  const { byBasis, unknown } = coverage;
  const parts = [
    byBasis.card ? `${byBasis.card} from the card record` : '',
    byBasis.catalog ? `${byBasis.catalog} from the set catalog` : '',
    byBasis.series ? `${byBasis.series} from the set’s series` : '',
  ].filter(Boolean);
  return (
    <div className="mt-4 space-y-3 border-t border-rule pt-3">
      <p className="text-[11.5px] text-ink-muted">
        Eras by set release year: Vintage up to 2003, Mid-era 2004 to 2016, Modern 2017 on.
        {parts.length ? ` Decided ${parts.join(', ')}.` : ''}
      </p>
      {unknown.length > 0 ? (
        <div>
          <p className="text-[13px] font-medium">
            {unknown.length} holding{unknown.length === 1 ? ' needs' : 's need'} set metadata
          </p>
          <p className="text-[12px] text-ink-muted">
            Their records carry no release date and their set is not in the catalog, so they are
            counted as Unknown rather than guessed.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {unknown.slice(0, 6).map((vc) => (
              <li key={vc.id}>
                <button
                  type="button"
                  onClick={() => onOpen(vc)}
                  className="flex items-center gap-2 rounded-full border border-border-default py-1 pl-1 pr-3 text-[12px] hover:bg-surface-hover"
                >
                  <span className="w-5">
                    <CardArt card={vc.card} flat />
                  </span>
                  <span className="max-w-[10rem] truncate">{vc.card.name}</span>
                  <span className="max-w-[8rem] truncate text-ink-muted">
                    {vc.card.set?.name || vc.card.set?.id || 'no set'}
                  </span>
                </button>
              </li>
            ))}
            {unknown.length > 6 ? (
              <li>
                <button
                  type="button"
                  onClick={onShowAll}
                  className="rounded-full px-3 py-1 text-[12px] text-accent hover:underline"
                >
                  Show all {unknown.length}
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
