import { motion } from 'framer-motion';
import { Flame, Layers, Radio, RefreshCw, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { PageHeader, PageShell, StatBlock } from '@/components/layout/PageShell';
import { useInvestments } from '../hooks/useInvestments';
import type { InvestmentsTab } from '../types';
import { OpportunityListPanel } from './OpportunityListPanel';
import { SlabMoversPanel } from './SlabMoversPanel';
import { BuyoutScannerPanel } from './BuyoutScannerPanel';
import { SimilarSlabsPanel } from './SimilarSlabsPanel';
import { SignalsPanel } from './SignalsPanel';
import { InlineNotice } from '@/components/common/InlineNotice';

const TABS: { id: InvestmentsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'opportunities', label: 'Opportunities', icon: <Target className="h-4 w-4" /> },
  { id: 'movers', label: 'Movers', icon: <TrendingUp className="h-4 w-4" /> },
  { id: 'buyouts', label: 'Buyouts', icon: <Flame className="h-4 w-4" /> },
  { id: 'similar', label: 'Comparables', icon: <Layers className="h-4 w-4" /> },
  { id: 'signals', label: 'Signals', icon: <Radio className="h-4 w-4" /> },
];

function formatRelativeTime(date: Date): string {
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

export function InvestmentsPage() {
  const {
    activeTab,
    setActiveTab,
    error,
    refresh,
    opportunities,
    opportunitiesLoading,
    minScore,
    setMinScore,
    movers,
    moversLoading,
    moversDays,
    setMoversDays,
    moversDirection,
    setMoversDirection,
    buyouts,
    buyoutsLoading,
    similar,
    similarLoading,
    anchorIds,
    setAnchorIds,
    slabLots,
    signals,
    signalsLoading,
    signalsLoadedAt,
    signalCategory,
    setSignalCategory,
    signalDirection,
    setSignalDirection,
    signalSort,
    setSignalSort,
  } = useInvestments();

  const topMovers = [...(movers?.rows ?? [])]
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 8);
  const topMover = topMovers[0] ?? null;
  const opportunityCount = opportunities?.count ?? opportunities?.rows.length ?? null;
  const signalsAnalyzed = signals?.pulse?.analyzedLast24h ?? null;

  return (
    <PageShell wide>
      <PageHeader
        eyebrow="Market"
        title="Investments"
        description="Find mispriced slabs, emerging trends, and scored market signals."
        actions={
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-inset px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-hover"
            aria-label="Refresh investments data"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatBlock
          label="Opportunities"
          value={opportunityCount ?? '—'}
          hint="Scored buy candidates live now"
        />
        <StatBlock
          label="Top mover"
          value={
            topMover
              ? `${topMover.changePct >= 0 ? '+' : ''}${topMover.changePct.toFixed(1)}%`
              : '—'
          }
          trend={topMover ? (topMover.changePct >= 0 ? 'up' : 'down') : undefined}
          hint={topMover?.cardName ?? 'No movers yet'}
        />
        <StatBlock label="Signals analyzed" value={signalsAnalyzed ?? '—'} hint="Last 24 hours" />
      </div>

      {topMovers.length > 0 && (
        <div className="marquee-container rounded-xl border border-border-subtle bg-surface-raised/60 py-2.5">
          <div className="marquee-content" style={{ animationDuration: '32s' }}>
            {[...topMovers, ...topMovers].map((m, i) => (
              <span
                key={`${m.cardId}-${i}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium"
              >
                {m.changePct >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-gain" aria-hidden />
                ) : (
                  <TrendingDown className="h-3 w-3 text-loss" aria-hidden />
                )}
                <span className="text-ink-secondary">{m.cardName ?? 'Unknown card'}</span>
                <span className={m.changePct >= 0 ? 'text-gain' : 'text-loss'}>
                  {m.changePct >= 0 ? '+' : ''}
                  {m.changePct.toFixed(1)}%
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'signals' && signalsLoadedAt && (
        <p className="text-xs text-ink-muted">
          Last updated {formatRelativeTime(signalsLoadedAt)}
          {signals?.pulse?.analyzedLast24h
            ? ` · ${signals.pulse.analyzedLast24h} signals analyzed in the last 24h`
            : signals?.count
              ? ` · ${signals.count} signals in feed`
              : ''}
        </p>
      )}

      {error && <InlineNotice>{error}</InlineNotice>}

      <div
        role="tablist"
        className="isolate flex w-fit gap-0.5 rounded-xl bg-surface-inset p-1 shadow-[inset_0_0_0_1px_var(--border-subtle)]"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex h-8 cursor-pointer items-center gap-2 rounded-lg px-3.5 text-[13px] font-medium transition-[color,transform] duration-150 ease-out active:scale-[0.97] [&_svg]:h-3.5 [&_svg]:w-3.5 ${
              activeTab === tab.id ? 'text-ink-primary' : 'text-ink-muted hover:text-ink-secondary'
            }`}
          >
            {activeTab === tab.id && (
              <motion.span
                layoutId="investments-tab"
                aria-hidden
                className="absolute inset-0 -z-10 rounded-lg bg-surface-raised shadow-[inset_0_0_0_1px_var(--border-default),0_1px_2px_rgba(0,0,0,0.2)]"
                transition={{ type: 'spring', duration: 0.35, bounce: 0.12 }}
              />
            )}
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === 'opportunities' && (
          <OpportunityListPanel
            data={opportunities}
            loading={opportunitiesLoading}
            minScore={minScore}
            onMinScoreChange={setMinScore}
            error={error}
          />
        )}
        {activeTab === 'movers' && (
          <SlabMoversPanel
            data={movers}
            loading={moversLoading}
            days={moversDays}
            onDaysChange={setMoversDays}
            direction={moversDirection}
            onDirectionChange={setMoversDirection}
            error={error}
          />
        )}
        {activeTab === 'buyouts' && (
          <BuyoutScannerPanel data={buyouts} loading={buyoutsLoading} error={error} />
        )}
        {activeTab === 'similar' && (
          <SimilarSlabsPanel
            data={similar}
            loading={similarLoading}
            anchorIds={anchorIds}
            onAnchorIdsChange={setAnchorIds}
            slabLots={slabLots}
            error={error}
          />
        )}
        {activeTab === 'signals' && (
          <SignalsPanel
            data={signals}
            loading={signalsLoading}
            category={signalCategory}
            onCategoryChange={setSignalCategory}
            direction={signalDirection}
            onDirectionChange={setSignalDirection}
            sort={signalSort}
            onSortChange={setSignalSort}
            error={error}
          />
        )}
      </motion.div>
    </PageShell>
  );
}

export default InvestmentsPage;
