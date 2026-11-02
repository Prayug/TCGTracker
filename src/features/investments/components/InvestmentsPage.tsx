import {
  Compass,
  FlaskConical,
  Flame,
  Layers,
  Radio,
  RefreshCw,
  Target,
  TrendingUp,
} from 'lucide-react';
import { InvestmentsOverview } from './InvestmentsOverview';
import { PageHeader, PageShell } from '@/components/layout/PageShell';
import { useInvestments } from '../hooks/useInvestments';
import type { InvestmentsTab } from '../types';
import { OpportunityListPanel } from './OpportunityListPanel';
import { SlabMoversPanel } from './SlabMoversPanel';
import { BuyoutScannerPanel } from './BuyoutScannerPanel';
import { SimilarSlabsPanel } from './SimilarSlabsPanel';
import { SignalsPanel } from './SignalsPanel';
import { StrategyPanel } from './StrategyPanel';
import { InlineNotice } from '@/components/common/InlineNotice';

const TABS: { id: InvestmentsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Compass className="h-4 w-4" /> },
  { id: 'strategy', label: 'Strategy', icon: <FlaskConical className="h-4 w-4" /> },
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
    <PageShell wide>
      <PageHeader
        title="Investments"
        description="What buying cards has actually returned after fees, where it's fair to buy now, and the market signals behind it."
        actions={
          activeTab === 'strategy' ? undefined : (
            <button
              type="button"
              onClick={refresh}
              className="btn-secondary"
              aria-label="Refresh investments data"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          )
        }
      />

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

      {error && activeTab !== 'strategy' && activeTab !== 'overview' && (
        <InlineNotice>{error}</InlineNotice>
      )}

      <div
        role="tablist"
        aria-label="Investment views"
        className="flex gap-1 overflow-x-auto border-b border-rule"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`-mb-px flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-[13.5px] font-medium transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5 ${
              activeTab === tab.id
                ? 'border-ink-primary text-ink-primary'
                : 'border-transparent text-ink-muted hover:text-ink-primary'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'overview' && (
          <InvestmentsOverview
            opportunities={opportunities}
            loading={opportunitiesLoading}
            error={error}
            movers={movers}
            signals={signals}
            onTab={setActiveTab}
          />
        )}
        {activeTab === 'strategy' && <StrategyPanel />}
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
      </div>
    </PageShell>
  );
}

export default InvestmentsPage;
