import { GradeComparisonStage } from './GradeComparisonStage';
import React, { useCallback, useEffect, useState } from 'react';
import { Modal } from '../../../components/common/Modal';
import { Activity, BookMarked, Brain, Layers, Scale, Sparkles } from 'lucide-react';
import type { ServerAlertType } from '../../../services/alertService';
import { unifiedAlertService } from '../../../services/unifiedAlertService';
import { useGame } from '../../../contexts/GameContext';
import { PageEmptyState } from '../../../components/common/PageEmptyState';
import { formatCurrency } from '../../../utils/cardDisplay';
import { vaultService } from '../../../services/vaultService';
import { calculateGradedValue } from '../../../services/gradingService';
import { authService } from '../../../services/authService';
import { fetchTopGradedPremiums, GradedSpreadRow } from '../../../services/gradedPricesApi';
import { GradeWorthinessList } from './GradeWorthinessList';
import { CrossGraderArbPanel, PremiumMoversPanel, TopPremiumsPanel } from './SlabMarketPanels';
import {
  CrackRegradePanel,
  GradeLadderPanel,
  PopRegimePanel,
  SlabBookPanel,
} from './SlabInsightsPanels';
import { FilterChip, PageHeader } from '../../../components/layout/PageShell';
import { CardComparePanel } from './CardComparePanel';
import { SlabInsightsPanel } from '../../market-insights/components/MarketInsightsPage';
import { priceTrackingService, TrackedCard } from '../../../services/priceTrackingService';
import { markOnboardingStep } from '../../../components/common/OnboardingChecklist';

type SlabTab = 'grade' | 'arb' | 'owned' | 'pulse' | 'insights';

const SLAB_TAB_COPY: Record<SlabTab, string> = {
  grade: 'Cards worth sending to PSA.',
  arb: 'Cross-grader and crack gaps.',
  owned: 'Cost basis vs live slab marks.',
  pulse: 'Premium momentum, pop shocks, and ladders.',
  insights: 'PSA 10 predictions, backtests, and model health.',
};

export const PriceTrackingDashboard: React.FC = () => {
  const { game, isOnePiece, isPokemon } = useGame();
  const [trackedCards, setTrackedCards] = useState<TrackedCard[]>([]);
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [selectedCardForAlert, setSelectedCardForAlert] = useState<TrackedCard | null>(null);
  const [alertTarget, setAlertTarget] = useState('');
  const [alertCondition, setAlertCondition] = useState<'above' | 'below'>('above');
  const [alertKind, setAlertKind] = useState<ServerAlertType>('price_threshold');
  const [alertThresholdPct, setAlertThresholdPct] = useState('10');
  const [topPremiums, setTopPremiums] = useState<GradedSpreadRow[]>([]);
  const [slabTab, setSlabTab] = useState<SlabTab>('grade');
  const [tradeableOnly, setTradeableOnly] = useState(true);
  const [gradeVaultOnly, setGradeVaultOnly] = useState(false);

  const loadTracked = useCallback(() => {
    setTrackedCards(priceTrackingService.getTrackedCards(game));
  }, [game]);

  useEffect(() => {
    loadTracked();
  }, [loadTracked]);

  useEffect(() => {
    markOnboardingStep('slabs');
  }, []);

  useEffect(() => {
    if (!isPokemon) {
      setTopPremiums([]);
      return;
    }
    let cancelled = false;
    void fetchTopGradedPremiums(12, { tradeableOnly }).then((rows) => {
      if (!cancelled) setTopPremiums(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [isPokemon, tradeableOnly]);

  const openGradedPremiumAlert = (card: {
    cardId: string;
    cardName: string;
    premiumPct: number;
    rawPrice: number;
  }) => {
    const tracked =
      trackedCards.find((t) => t.id === card.cardId) ??
      ({
        id: card.cardId,
        card: {
          id: card.cardId,
          name: card.cardName,
          images: { small: '', large: '' },
          set: { id: '', name: '', releaseDate: '', total: 0 },
          number: '',
          marketPrice: card.rawPrice,
        },
        initialPrice: card.rawPrice,
        priceHistory: [{ price: card.rawPrice, date: new Date().toISOString() }],
        addedAt: new Date().toISOString(),
      } as TrackedCard);

    const suggested = Math.max(5, Math.round(card.premiumPct * 0.85));
    setSelectedCardForAlert(tracked);
    setAlertKind('graded_premium');
    setAlertCondition('below');
    setAlertThresholdPct(String(suggested));
    setAlertTarget(card.rawPrice > 0 ? card.rawPrice.toFixed(2) : '');
    setShowAlertForm(true);
  };

  const handleCreateAlert = async () => {
    if (!selectedCardForAlert) return;
    const needsPct =
      alertKind === 'percent_change' ||
      alertKind === 'volume_drop' ||
      alertKind === 'graded_premium';
    const needsPrice = alertKind === 'price_threshold';
    if (needsPrice && !alertTarget) return;
    if (needsPct && !alertThresholdPct) return;

    const lastPrice =
      selectedCardForAlert.priceHistory[selectedCardForAlert.priceHistory.length - 1]?.price ??
      selectedCardForAlert.initialPrice;
    const targetPrice = needsPrice ? parseFloat(alertTarget) : lastPrice > 0 ? lastPrice : 0;
    const thresholdPct = needsPct ? parseFloat(alertThresholdPct) : undefined;

    await unifiedAlertService.createAlert(
      selectedCardForAlert.id,
      selectedCardForAlert.card.name,
      targetPrice,
      alertCondition,
      {
        alertType: alertKind,
        thresholdPct: Number.isFinite(thresholdPct) ? thresholdPct : undefined,
        baselinePrice: lastPrice > 0 ? lastPrice : undefined,
      }
    );
    if (!authService.isAuthenticated() && alertKind === 'price_threshold') {
      priceTrackingService.createAlert(
        selectedCardForAlert.id,
        selectedCardForAlert.card.name,
        targetPrice,
        alertCondition,
        game
      );
    }
    setShowAlertForm(false);
    setSelectedCardForAlert(null);
    setAlertTarget('');
    setAlertKind('price_threshold');
    setAlertThresholdPct('10');
  };

  const vaultCardIds = (() => {
    const ids = new Set<string>();
    for (const vc of vaultService.getVaultCards(game)) {
      if (vc.card?.id) ids.add(vc.card.id);
    }
    return [...ids];
  })();
  const gradedVaultCards = vaultService
    .getVaultCards(game)
    .filter((vc) => vc.gradingResult != null);
  // Only cards with a known raw price count; a missing price is not $0.
  const gradingDiff = gradedVaultCards.reduce(
    (acc, vc) => {
      const raw = vc.card.marketPrice;
      if (raw == null || !Number.isFinite(raw) || raw <= 0) {
        acc.skipped += 1;
        return acc;
      }
      const graded =
        vc.gradingResult!.estimatedGradedValue ??
        calculateGradedValue(raw, vc.gradingResult!.grade);
      acc.raw += raw * vc.quantity;
      acc.graded += graded * vc.quantity;
      acc.counted += 1;
      return acc;
    },
    { raw: 0, graded: 0, counted: 0, skipped: 0 }
  );
  const gradingUpliftTotal = gradingDiff.graded - gradingDiff.raw;

  return (
    <div className="section-stack">
      <PageHeader
        title="Slabs"
        description={
          isPokemon ? SLAB_TAB_COPY[slabTab] : 'Graded market tools are available for Pokémon.'
        }
      />

      {isOnePiece && (
        <PageEmptyState
          icon={Layers}
          title="Pokemon only"
          message="Switch to Pokemon to browse grade-worthiness, arb, pulse, and slab insights."
        />
      )}

      {isPokemon && (
        <>
          <GradeComparisonStage rows={topPremiums} />
          <div className="space-y-1.5">
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:thin]">
              {(
                [
                  { id: 'grade' as const, label: 'Grade', icon: Sparkles },
                  { id: 'arb' as const, label: 'Arb', icon: Scale },
                  { id: 'owned' as const, label: 'Owned', icon: BookMarked },
                  { id: 'pulse' as const, label: 'Pulse', icon: Activity },
                  { id: 'insights' as const, label: 'Insights', icon: Brain },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <FilterChip
                  key={id}
                  active={slabTab === id}
                  onClick={() => setSlabTab(id)}
                  className="shrink-0 text-xs"
                >
                  <Icon className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                  {label}
                </FilterChip>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {slabTab === 'grade' && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <FilterChip
                    active={!gradeVaultOnly}
                    onClick={() => setGradeVaultOnly(false)}
                    className="text-xs"
                  >
                    Market
                  </FilterChip>
                  <FilterChip
                    active={gradeVaultOnly}
                    onClick={() => setGradeVaultOnly(true)}
                    className="text-xs"
                  >
                    My vault
                    {vaultCardIds.length > 0 ? ` · ${vaultCardIds.length}` : ''}
                  </FilterChip>
                </div>
                <GradeWorthinessList
                  limit={gradeVaultOnly ? Math.max(25, Math.min(vaultCardIds.length, 100)) : 10}
                  cardIds={gradeVaultOnly ? vaultCardIds : undefined}
                  title={gradeVaultOnly ? 'Vault cards worth grading' : 'Best cards to grade'}
                  subtitle={
                    gradeVaultOnly
                      ? 'Ranked from your vault · net after PSA fees × gem rate'
                      : 'Net after PSA fees × gem rate'
                  }
                  emptyMessage={
                    gradeVaultOnly
                      ? vaultCardIds.length === 0
                        ? 'Add cards to your vault to see grade-worthy holdings.'
                        : 'No vault cards scored yet — need verified PSA 10 quotes for those ids.'
                      : undefined
                  }
                  onAlertPremium={openGradedPremiumAlert}
                />
              </>
            )}

            {slabTab === 'arb' && (
              <>
                <CrossGraderArbPanel />
                <CrackRegradePanel />
                <TopPremiumsPanel
                  rows={topPremiums}
                  onAlertPremium={openGradedPremiumAlert}
                  tradeableOnly={tradeableOnly}
                  onTradeableOnlyChange={setTradeableOnly}
                />
              </>
            )}

            {slabTab === 'owned' && (
              <>
                {gradingDiff.counted > 0 && (
                  <section aria-labelledby="graded-diff" className="border-t border-rule pt-3">
                    <h3 id="graded-diff" className="text-h3">
                      Photo-graded vault cards: raw vs estimated graded
                    </h3>
                    <p className="text-[12px] text-ink-muted">
                      {gradingDiff.counted} card{gradingDiff.counted === 1 ? '' : 's'} with a photo
                      grade estimate
                      {gradingDiff.skipped
                        ? `; ${gradingDiff.skipped} left out because they have no raw price`
                        : ''}
                      . Graded values are estimates, not sales.
                    </p>
                    <dl className="mt-3 grid max-w-xl grid-cols-3 gap-4">
                      <div>
                        <dt className="text-meta text-ink-muted">Raw market</dt>
                        <dd className="font-mono text-[15px] tabular-nums">
                          {formatCurrency(gradingDiff.raw)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-meta text-ink-muted">Estimated graded</dt>
                        <dd className="font-mono text-[15px] tabular-nums">
                          {formatCurrency(gradingDiff.graded)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-meta text-ink-muted">Difference</dt>
                        <dd
                          className={`font-mono text-[15px] tabular-nums ${
                            gradingUpliftTotal >= 0 ? 'text-gain' : 'text-loss'
                          }`}
                        >
                          {formatCurrency(gradingUpliftTotal, { signed: true })}
                        </dd>
                      </div>
                    </dl>
                  </section>
                )}
                <SlabBookPanel />
              </>
            )}

            {slabTab === 'pulse' && (
              <>
                <PremiumMoversPanel onAlertPremium={openGradedPremiumAlert} />
                <PopRegimePanel />
                <GradeLadderPanel />
                <CardComparePanel />
              </>
            )}

            {slabTab === 'insights' && <SlabInsightsPanel />}
          </div>
        </>
      )}

      <Modal
        isOpen={showAlertForm && selectedCardForAlert != null}
        onClose={() => setShowAlertForm(false)}
        size="small"
        ariaLabel="Create alert"
      >
        {selectedCardForAlert ? (
          <div>
            <h3 className="text-h2">Create alert</h3>
            <p className="mt-1 text-sm text-ink-muted">{selectedCardForAlert.card.name}</p>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="section-label mb-2 block">Alert type</span>
                <select
                  value={alertKind}
                  onChange={(e) => setAlertKind(e.target.value as ServerAlertType)}
                  className="input"
                >
                  <option value="price_threshold">Price threshold</option>
                  <option value="percent_change">Percent change</option>
                  <option value="volume_drop">Volume drop</option>
                  <option value="category_change">Category change</option>
                  <option value="graded_premium">Graded premium</option>
                </select>
              </label>

              {(alertKind === 'price_threshold' || alertKind === 'percent_change') && (
                <div>
                  <span className="section-label mb-2 block">
                    {alertKind === 'percent_change' ? 'Direction' : 'Trigger when price goes'}
                  </span>
                  <div className="inline-flex w-full rounded-lg border border-border-default bg-surface-inset p-1">
                    {(['above', 'below'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setAlertCondition(type)}
                        className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
                          alertCondition === type
                            ? 'bg-surface-hover text-ink-primary'
                            : 'text-ink-muted'
                        }`}
                      >
                        {type === 'above' ? '↑ Above' : '↓ Below'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {alertKind === 'price_threshold' && (
                <label className="block">
                  <span className="section-label mb-2 block">Target price ($)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={alertTarget}
                    onChange={(e) => setAlertTarget(e.target.value)}
                    className="input tabular-nums"
                  />
                </label>
              )}

              {(alertKind === 'percent_change' || alertKind === 'volume_drop') && (
                <label className="block">
                  <span className="section-label mb-2 block">
                    {alertKind === 'volume_drop' ? 'Volume drop (%)' : 'Change threshold (%)'}
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={alertThresholdPct}
                    onChange={(e) => setAlertThresholdPct(e.target.value)}
                    className="input tabular-nums"
                  />
                </label>
              )}

              {alertKind === 'graded_premium' && (
                <>
                  <div>
                    <span className="section-label mb-2 block">Trigger when premium goes</span>
                    <div className="inline-flex w-full rounded-lg border border-border-default bg-surface-inset p-1">
                      {(['above', 'below'] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setAlertCondition(type)}
                          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
                            alertCondition === type
                              ? 'bg-surface-hover text-ink-primary'
                              : 'text-ink-muted'
                          }`}
                        >
                          {type === 'above' ? '↑ Above' : '↓ Below'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="block">
                    <span className="section-label mb-2 block">Premium threshold (%)</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={alertThresholdPct}
                      onChange={(e) => setAlertThresholdPct(e.target.value)}
                      className="input tabular-nums"
                    />
                  </label>
                </>
              )}

              {alertKind === 'category_change' && (
                <p className="text-sm text-ink-muted">
                  Fires when the card&apos;s market category changes between price updates.
                </p>
              )}
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => void handleCreateAlert()}
                className="btn-primary flex-1 justify-center"
              >
                Create alert
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAlertForm(false);
                  setSelectedCardForAlert(null);
                  setAlertTarget('');
                  setAlertKind('price_threshold');
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
