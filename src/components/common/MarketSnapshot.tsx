import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Activity, Layers } from 'lucide-react';
import { PriceHistoryApi, TopMoverEntry } from '../../services/priceHistoryApi';

const DAYS = 7;
const LIMIT = 50;
const FILTER_MIN_PRICE = 0.5;

interface SnapshotData {
  topGainer: TopMoverEntry | null;
  topLoser: TopMoverEntry | null;
  avgMove: number;
  moverCount: number;
}

function summarize(entries: TopMoverEntry[]): SnapshotData | null {
  const valid = entries.filter(
    (e) => e.currentPrice >= FILTER_MIN_PRICE && Number.isFinite(e.changePercent)
  );
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => b.changePercent - a.changePercent);
  const gainer = sorted[0]?.changePercent > 0 ? sorted[0] : null;
  const last = sorted[sorted.length - 1];
  const loser = last?.changePercent < 0 ? last : null;
  const avgMove = valid.reduce((sum, e) => sum + e.changePercent, 0) / valid.length;
  return { topGainer: gainer, topLoser: loser, avgMove, moverCount: valid.length };
}

/** Compact at-a-glance strip above the movers — shares the top-movers cache. */
export function MarketSnapshot() {
  const [entries, setEntries] = useState<TopMoverEntry[]>(() => {
    const cached = PriceHistoryApi.peekTopMovers(DAYS, LIMIT);
    return cached ? [...(cached.gainers || []), ...(cached.losers || [])] : [];
  });

  useEffect(() => {
    let mounted = true;
    PriceHistoryApi.getTopMovers(DAYS, LIMIT).then((result) => {
      if (!mounted) return;
      const combined = [...(result.gainers || []), ...(result.losers || [])];
      if (combined.length > 0) setEntries(combined);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const data = useMemo(() => summarize(entries), [entries]);
  if (!data) return null;

  const { topGainer, topLoser, avgMove, moverCount } = data;

  const stats: {
    key: string;
    label: string;
    value: string;
    detail?: string;
    tone: 'gain' | 'loss' | 'neutral';
    icon: React.ElementType;
  }[] = [];
  if (topGainer) {
    stats.push({
      key: 'gainer',
      label: 'Top gainer · 7d',
      value: `+${topGainer.changePercent.toFixed(1)}%`,
      detail: topGainer.productName,
      tone: 'gain',
      icon: ArrowUp,
    });
  }
  if (topLoser) {
    stats.push({
      key: 'loser',
      label: 'Top loser · 7d',
      value: `${topLoser.changePercent.toFixed(1)}%`,
      detail: topLoser.productName,
      tone: 'loss',
      icon: ArrowDown,
    });
  }
  stats.push({
    key: 'avg',
    label: 'Avg move · 7d',
    value: `${avgMove >= 0 ? '+' : ''}${avgMove.toFixed(1)}%`,
    tone: avgMove >= 0 ? 'gain' : 'loss',
    icon: Activity,
  });
  stats.push({
    key: 'count',
    label: 'Cards moving',
    value: String(moverCount),
    detail: 'with 7d price changes',
    tone: 'neutral',
    icon: Layers,
  });

  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {stats.map(({ key, label, value, detail, tone, icon: Icon }) => (
        <div
          key={key}
          className="flex min-w-0 flex-col gap-1 rounded-xl border border-border-subtle bg-surface-raised/50 px-3.5 py-3"
        >
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            <Icon
              className={`h-3 w-3 shrink-0 ${
                tone === 'gain' ? 'text-gain' : tone === 'loss' ? 'text-loss' : 'text-foil'
              }`}
            />
            {label}
          </span>
          <span
            className={`font-mono text-lg font-bold tabular-nums leading-tight ${
              tone === 'gain' ? 'text-gain' : tone === 'loss' ? 'text-loss' : 'text-ink-primary'
            }`}
          >
            {value}
          </span>
          {detail ? <span className="truncate text-xs text-ink-secondary">{detail}</span> : null}
        </div>
      ))}
    </div>
  );
}
