import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, TrendingUp } from 'lucide-react';
import { PokemonCard } from '../../types/pokemon';
import { PriceHistoryApi, TopMoverEntry } from '../../services/priceHistoryApi';
import { formatCurrency, proxyImageUrl } from '../../utils/cardDisplay';

interface MoverDisplay {
  productName: string;
  subtitle: string;
  currentPrice: number;
  changePct: number;
  imageSmall: string;
  imageLarge: string;
  raw: TopMoverEntry;
}

interface TopMoversProps {
  onCardClick: (card: PokemonCard) => void;
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

/** Normalize price_history finishes (reverseholofoil) to tcgplayer-style keys (reverseHolofoil). */
const toVariantKey = (subType?: string | null): string => {
  if (!subType) return 'normal';
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
  return subType.replace(/([a-z])([A-Z])/g, '$1$2');
};

const formatVariantLabel = (subType?: string | null): string => {
  if (!subType) return '';
  return toVariantKey(subType)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
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
  if (variant && variant.toLowerCase() !== 'normal') {
    parts.push(variant);
  }
  return parts.join(' · ');
};

const moverKey = (e: TopMoverEntry): string =>
  e.uniqueIdentifier || `${e.cardId || 'prod'}-${e.subTypeName || e.productId}`;

const toPokemonCard = (entry: TopMoverEntry): PokemonCard => {
  let parsedPrices: Record<string, { market?: number; mid?: number; high?: number; low?: number }> | undefined;
  try {
    if (entry.tcgplayerPrices) {
      parsedPrices = JSON.parse(entry.tcgplayerPrices);
    }
  } catch { /* ignore */ }

  const preferredVariant = toVariantKey(entry.subTypeName);
  if (!parsedPrices) parsedPrices = {};
  if (!parsedPrices[preferredVariant]) {
    parsedPrices[preferredVariant] = { market: entry.currentPrice };
  } else {
    parsedPrices[preferredVariant] = {
      ...parsedPrices[preferredVariant],
      market: entry.currentPrice,
    };
  }

  return {
    id: entry.cardId || `prod-${entry.productId}`,
    name: entry.productName,
    uniqueIdentifier: entry.uniqueIdentifier || undefined,
    preferredVariant,
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
    marketPrice: entry.currentPrice,
    tcgplayer: {
      productId: entry.tcgplayerProductId || undefined,
      prices: parsedPrices,
    },
  };
};

const FILTER_MIN_PRICE = 0.5;

const toDisplay = (e: TopMoverEntry): MoverDisplay => ({
  productName: e.productName,
  subtitle: moverSubtitle(e),
  currentPrice: e.currentPrice,
  changePct: e.changePercent,
  imageSmall: e.imageSmall || e.imageLarge || '',
  imageLarge: e.imageLarge || e.imageSmall || '',
  raw: e,
});

const hasArt = (e: TopMoverEntry) => Boolean(e.imageSmall || e.imageLarge);

export const TopMovers: React.FC<TopMoversProps> = ({ onCardClick }) => {
  const [period, setPeriod] = useState<Period>('7d');
  const [allEntries, setAllEntries] = useState<TopMoverEntry[]>(() => {
    const cached = PriceHistoryApi.peekTopMovers(PERIOD_DAYS['7d'], 50);
    if (!cached) return [];
    return [...(cached.gainers || []), ...(cached.losers || [])];
  });
  const [loading, setLoading] = useState(() => {
    const cached = PriceHistoryApi.peekTopMovers(PERIOD_DAYS['7d'], 50);
    return !(cached && (cached.gainers.length > 0 || cached.losers.length > 0));
  });

  useEffect(() => {
    let mounted = true;
    const days = PERIOD_DAYS[period];

    const applyResult = (result: { gainers: TopMoverEntry[]; losers: TopMoverEntry[] }) => {
      if (!mounted) return false;
      if (result.gainers.length === 0 && result.losers.length === 0) return false;
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

    // Paint cached movers immediately (stale-while-revalidate)
    const cached = PriceHistoryApi.peekTopMovers(days, 50);
    const hadCache = Boolean(cached && (cached.gainers.length > 0 || cached.losers.length > 0));
    if (hadCache && cached) {
      applyResult(cached);
    } else {
      setLoading(true);
    }

    const load = async () => {
      const maxRetries = 2;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        // force: always revalidate in background; backend TTL keeps this cheap
        const result = await PriceHistoryApi.getTopMovers(days, 50, { force: true });
        if (!mounted) return;
        if (applyResult(result)) return;
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
    return () => { mounted = false; };
  }, [period]);

  const switchPeriod = useCallback((newPeriod: Period) => {
    setPeriod(newPeriod);
  }, []);

  const filtered = useMemo(
    () => allEntries.filter((e) => e.currentPrice >= FILTER_MIN_PRICE),
    [allEntries]
  );

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => b.changePercent - a.changePercent),
    [filtered]
  );

  const gainers: MoverDisplay[] = useMemo(
    () => sorted.filter((e) => e.changePercent > 0 && hasArt(e)).slice(0, 6).map(toDisplay),
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

  const handleCardClick = useCallback((entry: TopMoverEntry) => {
    onCardClick(toPokemonCard(entry));
  }, [onCardClick]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <div className="skeleton h-8 w-48 rounded" />
        <div className="flex gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-44 w-32 shrink-0 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <TrendingUp className="h-8 w-8" style={{ color: 'var(--ink-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          Not enough price data yet — check back later.
        </p>
      </div>
    );
  }

  const renderRow = (rowEntries: MoverDisplay[], isGainers: boolean) => (
    <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
      {rowEntries.map(({ productName, subtitle, currentPrice, changePct, imageSmall, raw }) => (
        <button
          key={moverKey(raw)}
          type="button"
          onClick={() => handleCardClick(raw)}
          className={`group relative w-32 shrink-0 overflow-hidden rounded-xl border text-left transition-all duration-200 hover:-translate-y-1 ${
            isGainers && changePct > 15 ? 'hot-border' : ''
          }`}
          style={{
            borderColor: 'var(--border-default)',
            background: 'var(--gradient-surface)',
          }}
        >
          <div className="absolute inset-0 holo-sweep pointer-events-none" />
          <div className="absolute inset-0 holo-texture pointer-events-none" />
          <img
            src={proxyImageUrl(imageSmall)}
            alt={productName}
            className="h-24 w-full object-cover object-top"
            loading="lazy"
          />
          <div className="space-y-1 p-2">
            <p className="truncate text-[11px] font-medium leading-tight" style={{ color: 'var(--ink-primary)' }}>
              {productName}
            </p>
            {subtitle ? (
              <p className="truncate text-[9px] leading-tight" style={{ color: 'var(--ink-muted)' }}>
                {subtitle}
              </p>
            ) : null}
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-xs tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                {currentPrice > 0 ? formatCurrency(currentPrice) : '—'}
              </span>
              <span
                className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
                  changePct >= 0 ? 'text-gain' : 'text-loss'
                }`}
              >
                {changePct >= 0 ? <ArrowUp className="h-2.5 w-2.5 shrink-0" /> : <ArrowDown className="h-2.5 w-2.5 shrink-0" />}
                {Number.isFinite(changePct) ? `${Math.abs(changePct).toFixed(1)}%` : '—'}
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex items-center gap-3">
        <h3 className="text-gradient text-lg font-display font-bold">Top movers</h3>
        <div className="flex gap-1 rounded-lg border p-0.5" style={{ borderColor: 'var(--border-subtle)' }}>
          {PERIODS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => switchPeriod(key)}
              className="rounded-md px-3 py-1 text-xs font-medium transition-all duration-200"
              style={{
                backgroundColor: period === key ? 'var(--accent)' : 'transparent',
                color: period === key ? '#fff' : 'var(--ink-secondary)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {gainers.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <ArrowUp className="h-3.5 w-3.5 text-gain" />
            <span className="text-xs font-medium text-gain">Top gainers</span>
          </div>
          {renderRow(gainers, true)}
        </div>
      )}

      {losers.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <ArrowDown className="h-3.5 w-3.5 text-loss" />
            <span className="text-xs font-medium text-loss">Top losers</span>
          </div>
          {renderRow(losers, false)}
        </div>
      )}
    </div>
  );
};
