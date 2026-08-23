import { motion } from 'framer-motion';
import { Flame, Layers, Radio, RefreshCw, Target, TrendingUp } from 'lucide-react';
import { useInvestments } from '../hooks/useInvestments';
import type { InvestmentsTab } from '../types';
import { OpportunityListPanel } from './OpportunityListPanel';
import { SlabMoversPanel } from './SlabMoversPanel';
import { BuyoutScannerPanel } from './BuyoutScannerPanel';
import { SimilarSlabsPanel } from './SimilarSlabsPanel';
import { SignalsPanel } from './SignalsPanel';

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

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-foil">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow-accent" aria-hidden />
            Market
          </p>
          <h1 className="font-display text-h1 text-ink-primary">Investments</h1>
          <p className="text-sm text-ink-secondary sm:text-base">
            Find mispriced slabs, emerging trends, and scored market signals
          </p>
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
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-inset px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-hover"
          aria-label="Refresh investments data"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="mb-6 flex gap-1 rounded-xl border border-border-default bg-surface-inset p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-accent/15 text-accent shadow-sm'
                : 'text-ink-muted hover:bg-surface-hover hover:text-ink-secondary'
            }`}
          >
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
          />
        )}
        {activeTab === 'buyouts' && <BuyoutScannerPanel data={buyouts} loading={buyoutsLoading} />}
        {activeTab === 'similar' && (
          <SimilarSlabsPanel
            data={similar}
            loading={similarLoading}
            anchorIds={anchorIds}
            onAnchorIdsChange={setAnchorIds}
            slabLots={slabLots}
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
          />
        )}
      </motion.div>
    </div>
  );
}

export default InvestmentsPage;
