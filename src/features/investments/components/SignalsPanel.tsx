import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import type {
  InvestmentSignal,
  InvestmentSignalsResult,
  SignalDirection,
  SignalSort,
} from '../types';
import { DirectionBadge, EmptyState, formatPct, PanelLoading, Sparkline } from './shared';

const SOURCE_FILTERS: { id: string; label: string }[] = [
  { id: 'news', label: 'News' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'tournament', label: 'Tournament' },
  { id: 'set_release', label: 'Set Release' },
  { id: 'ban_list', label: 'Ban List' },
];

const DIRECTION_FILTERS: { id: SignalDirection | null; label: string }[] = [
  { id: null, label: 'All' },
  { id: 'bullish', label: 'Bullish' },
  { id: 'bearish', label: 'Bearish' },
  { id: 'watch', label: 'Watching' },
  { id: 'high_risk', label: 'High Risk' },
];

const SORT_OPTIONS: { id: SignalSort; label: string }[] = [
  { id: 'score', label: 'Signal strength' },
  { id: 'confidence', label: 'Confidence' },
  { id: 'newest', label: 'Newest' },
  { id: 'price_impact', label: 'Largest price impact' },
  { id: 'volume', label: 'Highest volume' },
];

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-accent/40 bg-accent/15 text-accent'
          : 'border-border-default/80 bg-surface-overlay text-ink-secondary hover:border-border-strong hover:bg-surface-hover'
      }`}
    >
      {children}
    </button>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function MarketPulseBar({ pulse }: { pulse: InvestmentSignalsResult['pulse'] }) {
  const cards = [
    {
      label: 'Bullish',
      value: pulse.bullish,
      tone: 'text-emerald-400',
      insight: pulse.bullishInsight,
    },
    { label: 'Bearish', value: pulse.bearish, tone: 'text-red-400', insight: null },
    { label: 'Watching', value: pulse.watch, tone: 'text-amber-400', insight: pulse.watchInsight },
    {
      label: 'High risk',
      value: pulse.highRisk,
      tone: 'text-orange-400',
      insight: pulse.highRiskInsight,
    },
  ];

  return (
    <div className="rounded-xl border border-border-default/80 bg-surface-overlay p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Market pulse
        </p>
        <span className="text-[11px] text-ink-muted">
          {pulse.analyzedLast24h > 0
            ? `${pulse.analyzedLast24h} signals analyzed in the last 24h`
            : `${pulse.total} signals in current view`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cards.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-border-subtle/80 bg-surface-raised px-3 py-2.5"
          >
            <p className={`font-mono text-lg font-semibold tabular-nums ${item.tone}`}>
              {item.value}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-ink-muted">{item.label}</p>
            {item.insight && (
              <p className="mt-1.5 text-[10px] leading-snug text-ink-secondary">{item.insight}</p>
            )}
          </div>
        ))}
      </div>

      {pulse.strongestSignal && pulse.strongestSignal.score >= 35 && (
        <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400/80">
            Strongest actionable signal
          </p>
          <p className="mt-1 font-display text-sm font-semibold text-ink-primary">
            {pulse.strongestSignal.signalTitle}
          </p>
          <p className="mt-0.5 text-xs text-ink-secondary">{pulse.strongestSignal.entityLabel}</p>
          <p className="mt-1 text-xs text-emerald-400/90">{pulse.strongestSignal.detail}</p>
          <p className="mt-1 text-[10px] text-ink-muted">
            {pulse.strongestSignal.confidence}% confidence · {pulse.strongestSignal.sourceCount}{' '}
            source
            {pulse.strongestSignal.sourceCount === 1 ? '' : 's'}
          </p>
        </div>
      )}
    </div>
  );
}

function SourceTypeIcon({ type }: { type: string }) {
  const label = type === 'youtube' ? '▶' : type === 'reddit' ? '●' : type === 'news' ? '◆' : '↗';
  return (
    <span
      className="flex h-full w-full items-center justify-center text-lg text-ink-muted"
      aria-hidden
    >
      {label}
    </span>
  );
}

function SignalSourceCard({
  source,
  compact = false,
}: {
  source: InvestmentSignal['sources'][0];
  compact?: boolean;
}) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`group/source flex shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border-subtle/80 bg-surface-raised transition-colors hover:border-accent/40 hover:bg-surface-hover ${
        compact ? 'w-36' : 'w-44'
      }`}
    >
      <div className={`relative shrink-0 bg-surface-inset ${compact ? 'h-16 w-24' : 'h-20 w-28'}`}>
        {source.thumbnailUrl ? (
          <img
            src={source.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <SourceTypeIcon type={source.type} />
        )}
        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-px text-[9px] font-medium uppercase text-white">
          {source.typeLabel}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center px-2 py-1.5">
        <p
          className={`line-clamp-2 font-medium text-ink-primary ${compact ? 'text-[10px]' : 'text-xs'}`}
        >
          {source.title}
        </p>
        {source.summary && !compact && (
          <p className="mt-0.5 line-clamp-1 text-[10px] text-ink-muted">{source.summary}</p>
        )}
      </div>
    </a>
  );
}

function SignalSourcesRow({
  sources,
  compact = false,
}: {
  sources: InvestmentSignal['sources'];
  compact?: boolean;
}) {
  if (sources.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
        Sources ({sources.length})
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sources.map((src) => (
          <SignalSourceCard key={src.url} source={src} compact={compact} />
        ))}
      </div>
    </div>
  );
}

function MetaStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-[11px] text-ink-muted">
      <span className="font-medium text-ink-secondary">{label}</span> {value}
    </span>
  );
}

function EarlySignalMetrics({ signal }: { signal: InvestmentSignal }) {
  const maturity =
    signal.signalTier === 'monitor'
      ? 'Low confidence'
      : signal.hasMarketConfirmation
        ? 'Partial confirmation'
        : 'Forming';

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
      <MetaStat label="Confidence" value={`${signal.confidence}%`} />
      <MetaStat label="Sources" value={String(signal.evidence.totalSources)} />
      <MetaStat label="Maturity" value={maturity} />
      <MetaStat label="Horizon" value={signal.horizon} />
    </div>
  );
}

function MarketSignalMetrics({ signal }: { signal: InvestmentSignal }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {[
        { label: '7D', value: formatPct(signal.metrics.price7dPct) },
        { label: '30D', value: formatPct(signal.metrics.price30dPct) },
        { label: 'Volume', value: formatPct(signal.metrics.volumeChangePct, 0) },
        {
          label: 'Liquidity',
          value: signal.metrics.liquidityLabel ?? 'Unavailable',
        },
      ].map((m) => (
        <div key={m.label} className="min-w-[4rem]">
          <p className="text-[9px] uppercase tracking-wider text-ink-muted">{m.label}</p>
          <p className="font-mono text-xs font-semibold tabular-nums text-ink-primary">{m.value}</p>
        </div>
      ))}
    </div>
  );
}

function SignalCard({
  signal,
  expanded,
  onToggle,
}: {
  signal: InvestmentSignal;
  expanded: boolean;
  onToggle: () => void;
}) {
  const card = signal.topAffectedCard;
  const showMarketMetrics = signal.hasMarketConfirmation;

  return (
    <li className="border-b border-border-subtle/60 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="group w-full cursor-pointer px-4 py-4 text-left transition-all hover:border-l-2 hover:border-l-accent/40 hover:bg-surface-hover/60"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <p className="font-display text-lg font-semibold leading-tight text-ink-primary">
              {signal.entityLabel}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <DirectionBadge direction={signal.direction} label={signal.directionLabel} />
              <span className="rounded-md border border-border-subtle/80 bg-surface-inset px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-ink-primary">
                Score {signal.opportunityScore}
              </span>
              <span className="text-[11px] text-ink-muted">Confidence {signal.confidence}%</span>
              <span className="text-[11px] text-ink-muted">·</span>
              <span className="text-[11px] text-ink-muted">Horizon {signal.horizon}</span>
            </div>

            <p className="text-sm font-medium text-ink-secondary">{signal.signalTitle}</p>
            <p className="line-clamp-2 text-sm leading-snug text-ink-muted">{signal.explanation}</p>

            {!showMarketMetrics && (
              <p className="text-[11px] italic text-ink-muted">No market confirmation yet</p>
            )}

            <p className="text-[10px] text-ink-muted">
              Sources: {signal.sourceSummary || 'None yet'} · Type: {signal.categoryLabel}
            </p>

            {signal.sources.length > 0 && (
              <SignalSourcesRow sources={signal.sources.slice(0, 3)} compact />
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-3 lg:min-w-[14rem]">
            {showMarketMetrics ? (
              <MarketSignalMetrics signal={signal} />
            ) : (
              <EarlySignalMetrics signal={signal} />
            )}

            <div className="flex items-center gap-2">
              {signal.sparkline.length >= 2 && <Sparkline points={signal.sparkline} />}
              {card?.imageSmall && (
                <img
                  src={card.imageSmall}
                  alt=""
                  className="hidden h-14 w-10 rounded-md object-cover sm:block"
                  loading="lazy"
                />
              )}
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
                View details
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-border-subtle/60 bg-surface-inset/40 px-4 py-4">
          <SignalSourcesRow sources={signal.sources} />

          {signal.whyItMatters.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                Why it matters
              </p>
              <ul className="space-y-1">
                {signal.whyItMatters.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-ink-secondary">
                    <span className="text-ink-muted">·</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {signal.sourceTitle && signal.sources.length <= 1 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                Source headline
              </p>
              <p className="text-sm text-ink-muted">{signal.sourceTitle}</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                Observed
              </p>
              <p className="text-sm text-ink-secondary">{signal.observedEffect}</p>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                Interpretation
              </p>
              <p className="text-sm text-ink-secondary">{signal.interpretation}</p>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                Opportunity
              </p>
              <p className="text-sm text-ink-secondary">{signal.opportunity}</p>
            </div>
          </div>

          {signal.sourceUrl && signal.sources.length === 0 && (
            <a
              href={signal.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              View source
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </li>
  );
}

function SignalSection({
  title,
  subtitle,
  signals,
  expandedId,
  onToggle,
}: {
  title: string;
  subtitle: string;
  signals: InvestmentSignal[];
  expandedId: number | null;
  onToggle: (id: number) => void;
}) {
  if (signals.length === 0) return null;

  return (
    <section className="space-y-2">
      <div>
        <h2 className="font-display text-sm font-semibold text-ink-primary">{title}</h2>
        <p className="text-xs text-ink-muted">{subtitle}</p>
      </div>
      <ul className="overflow-hidden rounded-xl border border-border-default/80 bg-surface-overlay">
        {signals.map((row) => (
          <SignalCard
            key={row.id}
            signal={row}
            expanded={expandedId === row.id}
            onToggle={() => onToggle(row.id)}
          />
        ))}
      </ul>
    </section>
  );
}

interface Props {
  data: InvestmentSignalsResult | null;
  loading: boolean;
  category: string | null;
  onCategoryChange: (category: string | null) => void;
  direction: SignalDirection | null;
  onDirectionChange: (direction: SignalDirection | null) => void;
  sort: SignalSort;
  onSortChange: (sort: SignalSort) => void;
  lastUpdated?: Date | null;
}

/** Market intelligence feed — enriched signals with metrics, scoring, and drill-down. */
export function SignalsPanel({
  data,
  loading,
  category,
  onCategoryChange,
  direction,
  onDirectionChange,
  sort,
  onSortChange,
}: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const totalCount = data ? Object.values(data.byCategory).reduce((s, n) => s + n, 0) : 0;

  const actionable = data?.actionable ?? data?.rows ?? [];
  const emerging = data?.emerging ?? [];

  return (
    <div className="space-y-5">
      {data?.pulse && <MarketPulseBar pulse={data.pulse} />}

      <div className="grid gap-4 rounded-xl border border-border-default/80 bg-surface-overlay p-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="grid gap-4 sm:grid-cols-2">
          <FilterGroup label="Signal type">
            {DIRECTION_FILTERS.map((f) => (
              <FilterChip
                key={f.label}
                active={direction === f.id}
                onClick={() => onDirectionChange(f.id)}
              >
                {f.label}
              </FilterChip>
            ))}
          </FilterGroup>

          <FilterGroup label="Source">
            <FilterChip active={category === null} onClick={() => onCategoryChange(null)}>
              All
              {totalCount > 0 && (
                <span className="ml-1.5 rounded bg-surface-inset px-1 py-px text-[10px] font-normal text-ink-muted">
                  {totalCount}
                </span>
              )}
            </FilterChip>
            {SOURCE_FILTERS.map((f) => {
              const count = data?.byCategory[f.id] ?? 0;
              if (count === 0 && category !== f.id) return null;
              return (
                <FilterChip
                  key={f.id}
                  active={category === f.id}
                  onClick={() => onCategoryChange(category === f.id ? null : f.id)}
                >
                  {f.label}
                  {count > 0 && (
                    <span className="ml-1.5 rounded bg-surface-inset px-1 py-px text-[10px] font-normal text-ink-muted">
                      {count}
                    </span>
                  )}
                </FilterChip>
              );
            })}
          </FilterGroup>
        </div>

        <FilterGroup label="Sort">
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SignalSort)}
            className="cursor-pointer rounded-lg border border-border-default/80 bg-surface-raised px-2.5 py-1.5 text-xs text-ink-secondary"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </FilterGroup>
      </div>

      {loading ? (
        <PanelLoading />
      ) : !data || (actionable.length === 0 && emerging.length === 0) ? (
        <EmptyState message="No signals match your filters. Try broadening signal type or source, or run the signal scraper to populate the feed." />
      ) : (
        <div className="space-y-6">
          <SignalSection
            title="Actionable signals"
            subtitle="Confirmed or high-confidence signals with financial relevance"
            signals={actionable}
            expandedId={expandedId}
            onToggle={(id) => setExpandedId((prev) => (prev === id ? null : id))}
          />

          <SignalSection
            title="Emerging signals"
            subtitle="Early source momentum — monitor until market confirmation"
            signals={emerging}
            expandedId={expandedId}
            onToggle={(id) => setExpandedId((prev) => (prev === id ? null : id))}
          />

          {actionable.length === 0 && emerging.length > 0 && (
            <p className="text-center text-xs text-ink-muted">
              No actionable signals yet for this filter — review emerging signals below.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
