import { useEffect, useState } from 'react';
import {
  Ban,
  ExternalLink,
  MessageCircle,
  Newspaper,
  Package,
  Radio,
  Trophy,
  Youtube,
} from 'lucide-react';
import { marketInsightsApi } from '../../../services/marketInsightsApi';
import { ExternalSignal } from '../types';

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  news: <Newspaper className="h-3.5 w-3.5 text-sky-400" />,
  social: <MessageCircle className="h-3.5 w-3.5 text-orange-400" />,
  youtube: <Youtube className="h-3.5 w-3.5 text-red-400" />,
  tournament: <Trophy className="h-3.5 w-3.5 text-amber-400" />,
  set_release: <Package className="h-3.5 w-3.5 text-purple-400" />,
  ban_list: <Ban className="h-3.5 w-3.5 text-red-400" />,
};

const SOURCE_LABELS: Record<string, string> = {
  news: 'News',
  social: 'Reddit',
  youtube: 'YouTube',
  tournament: 'Tournament',
  set_release: 'Set Release',
  ban_list: 'Ban List',
};

function sentimentStyle(sentiment: number): { label: string; className: string } {
  if (sentiment > 0.15) return { label: 'Positive', className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
  if (sentiment < -0.15) return { label: 'Negative', className: 'text-red-400 bg-red-500/10 border-red-500/30' };
  return { label: 'Neutral', className: 'text-ink-muted bg-slate-500/10 border-slate-500/30' };
}

function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr.replace(' ', 'T') + 'Z').getTime();
  if (isNaN(target)) return null;
  return Math.ceil((target - Date.now()) / (24 * 60 * 60 * 1000));
}

interface Props {
  cardId: string;
  /** Pre-loaded signals (e.g. from the prediction payload); skips fetching when provided. */
  signals?: ExternalSignal[];
}

/** List of scraped external market signals (news, Reddit, YouTube, releases) for a card. */
export function ExternalSignalsPanel({ cardId, signals: preloaded }: Props) {
  const [signals, setSignals] = useState<ExternalSignal[]>(preloaded ?? []);
  const [loading, setLoading] = useState(!preloaded);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preloaded) return;
    let cancelled = false;
    setLoading(true);
    marketInsightsApi
      .getExternalSignals(cardId)
      .then((res) => {
        if (!cancelled) setSignals(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load signals');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cardId, preloaded]);

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return <p className="px-3 py-4 text-xs text-red-400">{error}</p>;
  }

  if (signals.length === 0) {
    return (
      <div className="flex h-24 flex-col items-center justify-center gap-1 text-center">
        <Radio className="h-4 w-4 text-ink-muted" />
        <p className="text-xs text-ink-muted">No external signals for this card yet.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border-subtle">
      {signals.map((signal, i) => {
        const sentiment = sentimentStyle(signal.sentiment);
        const expiresIn = daysUntil(signal.expiresAt);
        return (
          <li key={`${signal.sourceUrl}-${i}`} className="px-3 py-2.5">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0" title={SOURCE_LABELS[signal.sourceType] || signal.sourceType}>
                {SOURCE_ICONS[signal.sourceType] ?? <Radio className="h-3.5 w-3.5 text-ink-muted" />}
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={signal.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-1 text-xs font-medium text-ink-primary hover:text-accent"
                >
                  <span className="line-clamp-2">{signal.title}</span>
                  <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
                {signal.summary && signal.summary !== signal.title && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-muted">{signal.summary}</p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${sentiment.className}`}>
                    {sentiment.label}
                  </span>
                  {signal.type && signal.type !== 'unknown' && (
                    <span className="rounded-full border border-border-default bg-surface-inset px-1.5 py-0.5 text-[10px] text-ink-secondary">
                      {signal.type.replace(/_/g, ' ')}
                    </span>
                  )}
                  {expiresIn !== null && expiresIn > 0 && (
                    <span className="rounded-full border border-border-subtle px-1.5 py-0.5 text-[10px] text-ink-muted">
                      expires in {expiresIn}d
                    </span>
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
