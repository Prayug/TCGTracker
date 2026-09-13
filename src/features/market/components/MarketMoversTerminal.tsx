/**
 * Dense market-movers terminal: Raw | PSA 10 | BGS 10 + gainer/loser/traded/unusual.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Loader2 } from 'lucide-react';
import { PriceHistoryApi, type TopMoverEntry } from '../../../services/priceHistoryApi';
import { formatCurrency, proxyImageUrl } from '../../../utils/cardDisplay';
import { useCardModal } from '../../../contexts/CardModalContext';
import type { PokemonCard } from '../../../types/pokemon';
import { cn } from '@/lib/utils';
import { FilterChip } from '../../../components/layout/PageShell';

export type FinishFilter = 'raw' | 'psa10' | 'bgs10';
export type MoverLens = 'gainers' | 'losers' | 'traded' | 'unusual';
type PeriodDays = 1 | 7 | 30;

const PERIODS: { days: PeriodDays; label: string }[] = [
  { days: 1, label: '24h' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
];

const FINISHES: { id: FinishFilter; label: string }[] = [
  { id: 'raw', label: 'Raw' },
  { id: 'psa10', label: 'PSA 10' },
  { id: 'bgs10', label: 'BGS 10' },
];

const LENSES: { id: MoverLens; label: string }[] = [
  { id: 'gainers', label: 'Top gainers' },
  { id: 'losers', label: 'Top losers' },
  { id: 'traded', label: 'Most traded' },
  { id: 'unusual', label: 'Unusual' },
];

type Row = TopMoverEntry & { volume?: number | null; activity?: number };

/** Sample tape when live movers are empty — real catalog names only. */
const DEMO_RAW: Row[] = [
  {
    productName: 'Umbreon VMAX',
    currentPrice: 412.5,
    previousPrice: 348.0,
    changePercent: 18.53,
    imageSmall: 'https://images.pokemontcg.io/swsh7/95_hires.png',
    imageLarge: 'https://images.pokemontcg.io/swsh7/95_hires.png',
    cardId: 'swsh7-95',
    setId: 'swsh7',
    setName: 'Evolving Skies',
    cardNumber: '95',
    rarity: 'Secret Rare',
    tcgplayerProductId: null,
    tcgplayerPrices: null,
    productId: 1,
    uniqueIdentifier: 'demo-umbreon-vmax',
    subTypeName: 'Holofoil',
    groupName: 'Evolving Skies',
    volume: 184,
    activity: 184,
  },
  {
    productName: 'Charizard',
    currentPrice: 528.0,
    previousPrice: 465.0,
    changePercent: 13.55,
    imageSmall: 'https://images.pokemontcg.io/base1/4_hires.png',
    imageLarge: 'https://images.pokemontcg.io/base1/4_hires.png',
    cardId: 'base1-4',
    setId: 'base1',
    setName: 'Base Set',
    cardNumber: '4/102',
    rarity: 'Rare Holo',
    tcgplayerProductId: null,
    tcgplayerPrices: null,
    productId: 2,
    uniqueIdentifier: 'demo-charizard-base',
    subTypeName: 'Holofoil',
    groupName: 'Base Set',
    volume: 96,
    activity: 96,
  },
  {
    productName: 'Pikachu',
    currentPrice: 42.5,
    previousPrice: 51.0,
    changePercent: -16.67,
    imageSmall: 'https://images.pokemontcg.io/basep/1_hires.png',
    imageLarge: 'https://images.pokemontcg.io/basep/1_hires.png',
    cardId: 'basep-1',
    setId: 'basep',
    setName: 'Wizards Black Star Promos',
    cardNumber: '1',
    rarity: 'Promo',
    tcgplayerProductId: null,
    tcgplayerPrices: null,
    productId: 3,
    uniqueIdentifier: 'demo-pikachu-promo',
    subTypeName: null,
    groupName: 'Wizards Black Star Promos',
    volume: 8,
    activity: 8,
  },
  {
    productName: 'Mew ex',
    currentPrice: 86.4,
    previousPrice: 71.2,
    changePercent: 21.35,
    imageSmall: 'https://images.pokemontcg.io/sv3pt5/193_hires.png',
    imageLarge: 'https://images.pokemontcg.io/sv3pt5/193_hires.png',
    cardId: 'sv3pt5-193',
    setId: 'sv3pt5',
    setName: '151',
    cardNumber: '193',
    rarity: 'Special Illustration Rare',
    tcgplayerProductId: null,
    tcgplayerPrices: null,
    productId: 4,
    uniqueIdentifier: 'demo-mew-ex',
    subTypeName: 'Holofoil',
    groupName: '151',
    volume: 312,
    activity: 312,
  },
  {
    productName: 'Giratina VSTAR',
    currentPrice: 198.0,
    previousPrice: 242.0,
    changePercent: -18.18,
    imageSmall: 'https://images.pokemontcg.io/swsh11/GG70_hires.png',
    imageLarge: 'https://images.pokemontcg.io/swsh11/GG70_hires.png',
    cardId: 'swsh11-GG70',
    setId: 'swsh11',
    setName: 'Lost Origin',
    cardNumber: 'GG70',
    rarity: 'Rare Secret',
    tcgplayerProductId: null,
    tcgplayerPrices: null,
    productId: 5,
    uniqueIdentifier: 'demo-giratina-vstar',
    subTypeName: 'Holofoil',
    groupName: 'Lost Origin',
    volume: 141,
    activity: 141,
  },
  {
    productName: 'Lugia V',
    currentPrice: 164.0,
    previousPrice: 128.5,
    changePercent: 27.63,
    imageSmall: 'https://images.pokemontcg.io/swsh9/186_hires.png',
    imageLarge: 'https://images.pokemontcg.io/swsh9/186_hires.png',
    cardId: 'swsh9-186',
    setId: 'swsh9',
    setName: 'Brilliant Stars',
    cardNumber: '186',
    rarity: 'Rare Ultra',
    tcgplayerProductId: null,
    tcgplayerPrices: null,
    productId: 6,
    uniqueIdentifier: 'demo-lugia-v',
    subTypeName: 'Holofoil',
    groupName: 'Brilliant Stars',
    volume: 74,
    activity: 74,
  },
  {
    productName: 'Umbreon VMAX',
    currentPrice: 612.0,
    previousPrice: 540.0,
    changePercent: 13.33,
    imageSmall: 'https://images.pokemontcg.io/swsh7/215_hires.png',
    imageLarge: 'https://images.pokemontcg.io/swsh7/215_hires.png',
    cardId: 'swsh7-215',
    setId: 'swsh7',
    setName: 'Evolving Skies',
    cardNumber: '215',
    rarity: 'Rare Ultra',
    tcgplayerProductId: null,
    tcgplayerPrices: null,
    productId: 7,
    uniqueIdentifier: 'demo-umbreon-vmax-alt',
    subTypeName: 'Holofoil',
    groupName: 'Evolving Skies',
    volume: 58,
    activity: 58,
  },
  {
    productName: 'Rayquaza VMAX',
    currentPrice: 278.0,
    previousPrice: 310.0,
    changePercent: -10.32,
    imageSmall: 'https://images.pokemontcg.io/swsh7/218_hires.png',
    imageLarge: 'https://images.pokemontcg.io/swsh7/218_hires.png',
    cardId: 'swsh7-218',
    setId: 'swsh7',
    setName: 'Evolving Skies',
    cardNumber: '218',
    rarity: 'Rare Ultra',
    tcgplayerProductId: null,
    tcgplayerPrices: null,
    productId: 8,
    uniqueIdentifier: 'demo-rayquaza-vmax',
    subTypeName: 'Holofoil',
    groupName: 'Evolving Skies',
    volume: 67,
    activity: 67,
  },
];

function demoForFinish(finish: FinishFilter): Row[] {
  const mult = finish === 'raw' ? 1 : finish === 'psa10' ? 3.4 : 3.1;
  const label = finish === 'raw' ? null : finish === 'psa10' ? 'PSA' : 'BGS';
  return DEMO_RAW.map((r, i) => ({
    ...r,
    currentPrice: Math.round(r.currentPrice * mult * 100) / 100,
    previousPrice: Math.round(r.previousPrice * mult * 100) / 100,
    volume: Math.max(1, Math.round((r.volume || 10) * (finish === 'raw' ? 1 : 0.35))),
    activity: Math.max(1, Math.round((r.activity || 10) * (finish === 'raw' ? 1 : 0.35))),
    grader: label ?? undefined,
    grade: label ? '10' : undefined,
    uniqueIdentifier: `${r.uniqueIdentifier}-${finish}`,
    productId: r.productId + i * 10 + (finish === 'raw' ? 0 : finish === 'psa10' ? 100 : 200),
  }));
}

function toPokemonCard(entry: TopMoverEntry): PokemonCard {
  return {
    id: entry.cardId || entry.uniqueIdentifier || `mover-${entry.productId}`,
    name: entry.productName,
    images: {
      small: entry.imageSmall || '',
      large: entry.imageLarge || entry.imageSmall || '',
    },
    set: {
      id: entry.setId || '',
      name: entry.setName || entry.groupName || '',
      releaseDate: '',
      total: 0,
    },
    number: entry.cardNumber || '',
    rarity: entry.rarity || undefined,
    marketPrice: entry.currentPrice,
  } as PokemonCard;
}

function rowKey(e: TopMoverEntry): string {
  return e.uniqueIdentifier || `${e.cardId || 'x'}-${e.subTypeName || e.productId}`;
}

function subtitleOf(e: TopMoverEntry): string {
  const parts: string[] = [];
  const setLabel = e.setName || e.groupName;
  if (setLabel) parts.push(e.cardNumber ? `${setLabel} #${e.cardNumber}` : setLabel);
  else if (e.cardNumber) parts.push(`#${e.cardNumber}`);
  if (e.grader && e.grade) parts.push(`${e.grader} ${e.grade}`);
  else if (e.subTypeName && e.subTypeName.toLowerCase() !== 'normal') parts.push(e.subTypeName);
  return parts.join(' · ');
}

function withActivity(entries: TopMoverEntry[]): Row[] {
  return entries.map((e) => {
    const volume = typeof (e as Row).volume === 'number' ? (e as Row).volume : null;
    const dollarMove = Math.abs(e.currentPrice - e.previousPrice);
    const activity = volume && volume > 0 ? volume : Math.max(1, Math.round(dollarMove * 2));
    return { ...e, volume, activity };
  });
}

export function MarketMoversTerminal() {
  const { openCard } = useCardModal();
  const [finish, setFinish] = useState<FinishFilter>('raw');
  const [lens, setLens] = useState<MoverLens>('gainers');
  const [days, setDays] = useState<PeriodDays>(7);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingDemo, setUsingDemo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let result: { gainers: TopMoverEntry[]; losers: TopMoverEntry[] };
      if (finish === 'raw') {
        result = await PriceHistoryApi.getTopMovers(days, 40);
      } else {
        const grader = finish === 'psa10' ? 'PSA' : 'BGS';
        result = await PriceHistoryApi.getTopSlabMovers(days, 40, { grader });
      }
      const combined = withActivity([...(result.gainers || []), ...(result.losers || [])]);
      if (combined.length === 0) {
        setRows(demoForFinish(finish));
        setUsingDemo(true);
      } else {
        setRows(combined);
        setUsingDemo(false);
      }
    } catch {
      setRows(demoForFinish(finish));
      setUsingDemo(true);
    } finally {
      setLoading(false);
    }
  }, [days, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const withArt = rows.filter((r) => r.imageSmall || r.imageLarge || usingDemo);
    if (lens === 'gainers') {
      return [...withArt]
        .filter((r) => r.changePercent > 0)
        .sort((a, b) => b.changePercent - a.changePercent);
    }
    if (lens === 'losers') {
      return [...withArt]
        .filter((r) => r.changePercent < 0)
        .sort((a, b) => a.changePercent - b.changePercent);
    }
    if (lens === 'traded') {
      return [...withArt].sort((a, b) => (b.activity || 0) - (a.activity || 0));
    }
    const avgAct = withArt.reduce((s, r) => s + (r.activity || 0), 0) / Math.max(1, withArt.length);
    return [...withArt]
      .map((r) => ({
        r,
        score:
          Math.abs(r.changePercent) /
          Math.max(1, Math.sqrt((r.activity || 1) / Math.max(1, avgAct))),
      }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.r);
  }, [lens, rows, usingDemo]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold tracking-[-0.02em] text-ink-primary">
            Market movers
          </h1>
          <p className="mt-1 max-w-xl text-sm text-ink-secondary">
            Live price, change, and activity across finishes.
            {usingDemo ? (
              <span className="text-ink-secondary"> · Sample tape while the feed warms up</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <FilterChip
              key={p.days}
              active={days === p.days}
              onClick={() => setDays(p.days)}
              className="text-xs"
            >
              {p.label}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="tablist"
          aria-label="Finish"
          className="inline-flex rounded-md border border-border-subtle bg-surface-inset/70 p-1"
        >
          {FINISHES.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={finish === f.id}
              onClick={() => setFinish(f.id)}
              className={cn(
                'cursor-pointer rounded-[5px] px-3.5 py-2 text-sm font-semibold transition-colors',
                finish === f.id
                  ? 'bg-accent/15 text-accent'
                  : 'text-ink-secondary hover:text-ink-primary'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Lens">
          {LENSES.map((l) => (
            <FilterChip
              key={l.id}
              active={lens === l.id}
              onClick={() => setLens(l.id)}
              className="text-xs"
            >
              {l.label}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-raised/50">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-[11px] font-medium uppercase tracking-[0.12em] text-ink-secondary">
                <th className="px-3 py-2.5 font-medium sm:px-4">Card</th>
                <th className="px-3 py-2.5 font-medium sm:px-4">Price</th>
                <th className="px-3 py-2.5 font-medium sm:px-4">Change</th>
                <th className="px-3 py-2.5 font-medium sm:px-4">Activity</th>
                <th className="hidden px-3 py-2.5 font-medium sm:table-cell sm:px-4">Prev</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-ink-secondary">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" aria-hidden />
                    Loading movers…
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-sm text-ink-secondary">
                    No movers for this window. Try another finish or period.
                  </td>
                </tr>
              ) : (
                visible.slice(0, 25).map((row) => {
                  const up = row.changePercent >= 0;
                  const thumb = proxyImageUrl(row.imageSmall || row.imageLarge || '') || '';
                  return (
                    <tr
                      key={rowKey(row)}
                      className="cursor-pointer transition-colors hover:bg-surface-hover/80"
                      onClick={() => openCard(toPokemonCard(row))}
                    >
                      <td className="px-3 py-2 sm:px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-9 shrink-0 overflow-hidden rounded-sm bg-surface-inset ring-1 ring-border-subtle">
                            {thumb ? (
                              <img
                                src={thumb}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink-primary">
                              {row.productName}
                            </p>
                            <p className="truncate text-xs text-ink-secondary">{subtitleOf(row)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums text-ink-primary sm:px-4">
                        {formatCurrency(row.currentPrice)}
                      </td>
                      <td className="px-3 py-2 sm:px-4">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 font-mono text-sm font-semibold tabular-nums',
                            up ? 'text-gain' : 'text-loss'
                          )}
                        >
                          {up ? (
                            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />
                          )}
                          {up ? '+' : ''}
                          {row.changePercent.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums text-ink-secondary sm:px-4">
                        {row.volume != null && row.volume > 0 ? row.volume.toLocaleString() : '—'}
                      </td>
                      <td className="hidden px-3 py-2 font-mono tabular-nums text-ink-muted sm:table-cell sm:px-4">
                        {formatCurrency(row.previousPrice)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border-subtle px-4 py-2.5 text-xs text-ink-secondary">
          <span>
            {finish === 'raw' ? 'Raw market' : finish === 'psa10' ? 'PSA 10 slabs' : 'BGS 10 slabs'}{' '}
            · {days === 1 ? '24h' : `${days}d`}
          </span>
          <Link to="/deals" className="font-medium text-accent hover:underline">
            Browse deals →
          </Link>
        </div>
      </div>
    </div>
  );
}
