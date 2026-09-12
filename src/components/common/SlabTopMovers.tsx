import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, ArrowUp, Gem } from 'lucide-react';
import { PokemonCard } from '../../types/pokemon';
import { PriceHistoryApi, TopMoverEntry } from '../../services/priceHistoryApi';
import { formatCurrency, proxyImageUrl } from '../../utils/cardDisplay';
import { useCardModal } from '../../contexts/CardModalContext';

interface MoverDisplay {
  productName: string;
  subtitle: string;
  currentPrice: number;
  changePct: number;
  imageSmall: string;
  raw: TopMoverEntry;
}

interface SlabTopMoversProps {
  onCardClick?: (card: PokemonCard) => void;
}

type Period = '1d' | '7d' | '30d';

const PERIODS: { key: Period; label: string }[] = [
  { key: '1d', label: '24h' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
];

const PERIOD_DAYS: Record<Period, number> = {
  '1d': 1,
  '7d': 7,
  '30d': 30,
};

const FILTER_MIN_PRICE = 10;

/** Normalize finishes (reverseholofoil) to tcgplayer-style keys (reverseHolofoil). */
const toVariantKey = (subType?: string | null): string => {
  if (!subType || subType === 'PSA 10') return 'normal';
  const cleaned = subType.replace(/[\s_-]+/g, '').toLowerCase();
  const known: Record<string, string> = {
    normal: 'normal',
    holofoil: 'holofoil',
    reverseholofoil: 'reverseHolofoil',
    '1stedition': '1stEdition',
    '1steditionholofoil': '1stEditionHolofoil',
    unlimited: 'unlimited',
    unlimitedholofoil: 'unlimitedHolofoil',
  };
  if (known[cleaned]) return known[cleaned];
  return subType;
};

const formatVariantLabel = (subType?: string | null): string => {
  if (!subType) return '';
  const key = toVariantKey(subType);
  if (key === 'normal') return '';
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
};

const moverSubtitle = (entry: TopMoverEntry): string => {
  const parts: string[] = [];
  const setLabel = entry.setName || entry.groupName;
  if (setLabel) {
    parts.push(entry.cardNumber ? `${setLabel} #${entry.cardNumber}` : setLabel);
  } else if (entry.cardNumber) {
    parts.push(`#${entry.cardNumber}`);
  }
  const variant = formatVariantLabel(entry.subTypeName);
  if (variant) parts.push(variant);
  return parts.join(' · ');
};

const moverKey = (e: TopMoverEntry): string =>
  e.uniqueIdentifier || `${e.cardId || 'slab'}-${e.subTypeName || e.productId}`;

const toPokemonCard = (entry: TopMoverEntry): PokemonCard => ({
  id: entry.cardId || entry.uniqueIdentifier || `slab-${entry.productName}`,
  name: entry.productName,
  uniqueIdentifier: entry.uniqueIdentifier || undefined,
  preferredVariant: toVariantKey(entry.subTypeName),
  psa10Price: entry.currentPrice,
  images: {
    small: entry.imageSmall || entry.imageLarge || '',
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
});

const toDisplay = (e: TopMoverEntry): MoverDisplay => ({
  productName: e.productName,
  subtitle: moverSubtitle(e),
  currentPrice: e.currentPrice,
  changePct: e.changePercent,
  imageSmall: e.imageSmall || e.imageLarge || '',
  raw: e,
});

const hasArt = (e: TopMoverEntry) => Boolean(e.imageSmall || e.imageLarge);

export const SlabTopMovers: React.FC<SlabTopMoversProps> = ({ onCardClick }) => {
  const { openCard } = useCardModal();
  const [period, setPeriod] = useState<Period>('7d');
  const [allEntries, setAllEntries] = useState<TopMoverEntry[]>(() => {
    const cached = PriceHistoryApi.peekTopSlabMovers(PERIOD_DAYS['7d'], 50);
    if (!cached) return [];
    return [...(cached.gainers || []), ...(cached.losers || [])];
  });
  const [loading, setLoading] = useState(() => {
    const cached = PriceHistoryApi.peekTopSlabMovers(PERIOD_DAYS['7d'], 50);
    return !(cached && (cached.gainers.length > 0 || cached.losers.length > 0));
  });

  useEffect(() => {
    let mounted = true;
    const days = PERIOD_DAYS[period];

    const applyResult = (
      result: { gainers: TopMoverEntry[]; losers: TopMoverEntry[] },
      options: { allowEmpty?: boolean } = {}
    ) => {
      if (!mounted) return false;
      const empty = result.gainers.length === 0 && result.losers.length === 0;
      if (empty && !options.allowEmpty) return false;
      const combined = [...(result.gainers || []), ...(result.losers || [])];
      const deduped = new Map<string, TopMoverEntry>();
      combined.forEach((e) => {
        const key = moverKey(e);
        if (!deduped.has(key)) deduped.set(key, e);
      });
      setAllEntries(Array.from(deduped.values()));
      setLoading(false);
      return true;
    };

    const cached = PriceHistoryApi.peekTopSlabMovers(days, 50);
    const hadCache = Boolean(cached && (cached.gainers.length > 0 || cached.losers.length > 0));
    if (hadCache && cached) {
      applyResult(cached);
    } else {
      setLoading(true);
    }

    const load = async () => {
      const maxRetries = 2;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const result = await PriceHistoryApi.getTopSlabMovers(days, 50, { force: true });
        if (!mounted) return;
        if (applyResult(result, { allowEmpty: true })) return;
        if (attempt < maxRetries && !hadCache) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      if (mounted && !hadCache) {
        setAllEntries([]);
        setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [period]);

  const filtered = useMemo(
    () => allEntries.filter((e) => e.currentPrice >= FILTER_MIN_PRICE),
    [allEntries]
  );

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => b.changePercent - a.changePercent),
    [filtered]
  );

  const gainers: MoverDisplay[] = useMemo(
    () =>
      sorted
        .filter((e) => e.changePercent > 0 && hasArt(e))
        .slice(0, 6)
        .map(toDisplay),
    [sorted]
  );

  const losers: MoverDisplay[] = useMemo(
    () =>
      [...sorted]
        .filter((e) => e.changePercent < 0 && hasArt(e))
        .sort((a, b) => a.changePercent - b.changePercent)
        .slice(0, 6)
        .map(toDisplay),
    [sorted]
  );

  const handleCardClick = useCallback(
    (entry: TopMoverEntry) => {
      const card = toPokemonCard(entry);
      if (onCardClick) onCardClick(card);
      else openCard(card);
    },
    [onCardClick, openCard]
  );

  const renderRow = (rowEntries: MoverDisplay[], isGainers: boolean) => (
    <div className="flex gap-3.5 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
      {rowEntries.map(({ productName, subtitle, currentPrice, changePct, imageSmall, raw }) => (
        <button
          key={moverKey(raw)}
          type="button"
          onClick={() => handleCardClick(raw)}
          className={`group relative w-36 shrink-0 overflow-hidden rounded-xl border text-left transition-all duration-200 hover:-translate-y-1 ${
            isGainers && changePct > 15 ? 'hot-border' : ''
          }`}
          style={{
            borderColor: 'rgba(91, 196, 212, 0.35)',
            background: 'linear-gradient(180deg, rgba(26, 35, 48, 0.95) 0%, #0c1118 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(91, 196, 212, 0.12)',
          }}
        >
          <div className="relative">
            <img
              src={proxyImageUrl(imageSmall)}
              alt={productName}
              className="h-28 w-full object-cover object-top"
              loading="lazy"
            />
            <span
              className="absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-[0.12em] text-[#0c1118]"
              style={{ background: 'linear-gradient(135deg, #a8b4c0 0%, #c4b49a 100%)' }}
            >
              PSA 10
            </span>
          </div>
          <div className="space-y-1 p-2.5">
            <p
              className="truncate text-[11px] font-medium leading-tight"
              style={{ color: 'var(--ink-primary)' }}
            >
              {productName}
            </p>
            {subtitle ? (
              <p
                className="truncate text-[9px] leading-tight"
                style={{ color: 'var(--ink-muted)' }}
              >
                {subtitle}
              </p>
            ) : null}
            <div className="flex items-baseline justify-between gap-1.5">
              <span
                className="truncate font-mono text-[11px] tabular-nums"
                style={{ color: 'var(--foil)' }}
              >
                {currentPrice > 0 ? formatCurrency(currentPrice) : '—'}
              </span>
              <span
                className={`inline-flex shrink-0 items-center gap-0.5 text-[13px] font-bold tabular-nums ${
                  changePct >= 0 ? 'text-gain' : 'text-loss'
                }`}
              >
                {changePct >= 0 ? (
                  <ArrowUp className="h-3 w-3 shrink-0" />
                ) : (
                  <ArrowDown className="h-3 w-3 shrink-0" />
                )}
                {Number.isFinite(changePct) ? `${Math.abs(changePct).toFixed(1)}%` : '—'}
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );

  const isEmpty = !loading && sorted.length === 0;
  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? period;

  const periodToggle = (
    <div
      className="flex gap-1 rounded-lg border p-0.5"
      style={{ borderColor: 'rgba(91, 196, 212, 0.28)' }}
    >
      {PERIODS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => setPeriod(key)}
          className="rounded-md px-3 py-1 text-xs font-medium transition-all duration-200"
          style={{
            backgroundColor: period === key ? 'var(--foil)' : 'transparent',
            color: period === key ? '#0c1118' : 'var(--ink-secondary)',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  // Compact empty state — no giant empty panel when a window has no data.
  if (isEmpty) {
    return (
      <div
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-4 py-3.5 sm:px-5"
        style={{
          borderColor: 'rgba(91, 196, 212, 0.28)',
          background:
            'linear-gradient(180deg, rgba(20, 27, 38, 0.92) 0%, rgba(12, 17, 24, 0.96) 100%)',
        }}
      >
        <div className="flex items-center gap-2">
          <Gem className="h-4 w-4 shrink-0" style={{ color: 'var(--foil)' }} />
          <h3 className="font-display text-sm font-bold" style={{ color: 'var(--foil)' }}>
            Slab movers
          </h3>
        </div>
        <p className="min-w-0 flex-1 text-xs" style={{ color: 'var(--ink-muted)' }}>
          Not enough PSA 10 history for {periodLabel} yet — try another window.
        </p>
        {periodToggle}
      </div>
    );
  }

  return (
    <div
      className="flex w-full flex-col gap-5 rounded-2xl border px-4 py-5 sm:px-5"
      style={{
        borderColor: 'rgba(91, 196, 212, 0.28)',
        background:
          'radial-gradient(ellipse at 0% 0%, rgba(91, 196, 212, 0.14), transparent 55%), linear-gradient(180deg, rgba(20, 27, 38, 0.92) 0%, rgba(12, 17, 24, 0.96) 100%)',
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]"
              style={{
                color: '#0c1118',
                background: 'linear-gradient(135deg, #5bc4d4 0%, #6ee7b7 100%)',
              }}
            >
              <Gem className="h-3 w-3" />
              Graded · PSA 10
            </span>
          </div>
          <h3 className="font-display text-lg font-bold" style={{ color: 'var(--foil)' }}>
            Slab movers
          </h3>
          <p className="text-xs font-medium" style={{ color: 'var(--ink-secondary)' }}>
            PSA 10 sold-comp moves — not raw singles.
          </p>
        </div>
        {periodToggle}
      </div>

      {loading ? (
        <div className="flex gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-48 w-36 shrink-0 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {gainers.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <ArrowUp className="h-3.5 w-3.5 text-gain" />
                <span className="text-xs font-medium text-gain">PSA 10 gainers</span>
              </div>
              {renderRow(gainers, true)}
            </div>
          )}
          {losers.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <ArrowDown className="h-3.5 w-3.5 text-loss" />
                <span className="text-xs font-medium text-loss">PSA 10 losers</span>
              </div>
              {renderRow(losers, false)}
            </div>
          )}
        </>
      )}

      <Link
        to="/prices"
        className="inline-flex items-center gap-1.5 self-start text-xs font-semibold transition-colors duration-200"
        style={{ color: 'var(--foil)' }}
      >
        Open slab market
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
};
