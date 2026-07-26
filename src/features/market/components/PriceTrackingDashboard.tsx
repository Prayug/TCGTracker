import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Plus,
  Trash2,
  Search,
  Star,
  Target,
  Bell,
  Package,
  CheckCheck,
} from 'lucide-react';
import {
  priceTrackingService,
  TrackedCard,
  TrackableCard,
} from '../../../services/priceTrackingService';
import {
  unifiedAlertService,
  UnifiedAlert,
  AlertDigestEntry,
} from '../../../services/unifiedAlertService';
import { pokemonApi } from '../../../services/pokemonApi';
import { onePieceApi } from '../../../services/onepieceApi';
import { useGame } from '../../../contexts/GameContext';
import { SectionLabel } from '../../../components/common/SectionLabel';
import { PageEmptyState } from '../../../components/common/PageEmptyState';
import { MiniSparkline } from '../../../components/common/MiniSparkline';
import { TrackerStatCard, buildSparklinePrices } from './TrackerStatCard';
import { CardComparePanel } from './CardComparePanel';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { markOnboardingStep } from '../../../components/common/OnboardingChecklist';
import { vaultService } from '../../../services/vaultService';
import { calculateGradedValue } from '../../../services/gradingService';
import { getCardPrice } from '../../../utils/cardPrice';
import { authService } from '../../../services/authService';

export const PriceTrackingDashboard: React.FC = () => {
  const { game, isOnePiece, isPokemon } = useGame();
  const [trackedCards, setTrackedCards] = useState<TrackedCard[]>([]);
  const [alerts, setAlerts] = useState<UnifiedAlert[]>([]);
  const [digest, setDigest] = useState<AlertDigestEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TrackableCard[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [selectedCardForAlert, setSelectedCardForAlert] = useState<TrackedCard | null>(null);
  const [alertTarget, setAlertTarget] = useState('');
  const [alertType, setAlertType] = useState<'above' | 'below'>('above');

  const loadData = useCallback(async () => {
    setTrackedCards(priceTrackingService.getTrackedCards(game));
    try {
      const nextAlerts = await unifiedAlertService.getAlerts();
      setAlerts(nextAlerts);
    } catch {
      setAlerts(priceTrackingService.getAlerts(game).map((a) => ({
        id: a.id,
        cardId: a.cardId,
        cardName: a.cardName,
        targetPrice: a.targetPrice,
        condition: a.alertType,
        isActive: a.isActive,
        createdAt: a.createdAt,
        source: 'local' as const,
      })));
    }
    setDigest(unifiedAlertService.getDigest());
  }, [game]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const prices: Record<string, number> = {};
    for (const t of priceTrackingService.getTrackedCards(game)) {
      const last = t.priceHistory[t.priceHistory.length - 1]?.price ?? t.initialPrice;
      prices[t.id] = last;
    }
    void unifiedAlertService.evaluateDigest(prices).then(() => {
      setDigest(unifiedAlertService.getDigest());
    });
  }, [game, trackedCards.length]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      if (isOnePiece) {
        const results = await onePieceApi.searchCards(searchQuery);
        setSearchResults(results.slice(0, 10));
      } else {
        const results = await pokemonApi.searchCards(searchQuery);
        setSearchResults(results.slice(0, 10));
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleTrackCard = (card: TrackableCard) => {
    priceTrackingService.trackCard(card, game);
    markOnboardingStep('track');
    void loadData();
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleUntrack = (cardId: string) => {
    priceTrackingService.untrackCard(cardId, game);
    void loadData();
  };

  const handleCreateAlert = async () => {
    if (!selectedCardForAlert || !alertTarget) return;
    await unifiedAlertService.createAlert(
      selectedCardForAlert.id,
      selectedCardForAlert.card.name,
      parseFloat(alertTarget),
      alertType
    );
    // Also keep a local mirror for anonymous / offline digest evaluation
    if (!authService.isAuthenticated()) {
      priceTrackingService.createAlert(
        selectedCardForAlert.id,
        selectedCardForAlert.card.name,
        parseFloat(alertTarget),
        alertType,
        game
      );
    }
    setShowAlertForm(false);
    setSelectedCardForAlert(null);
    setAlertTarget('');
    await loadData();
  };

  const handleDeleteAlert = async (alert: UnifiedAlert) => {
    await unifiedAlertService.deleteAlert(alert);
    if (alert.source === 'local') {
      priceTrackingService.deleteAlert(alert.id, game);
    }
    await loadData();
  };

  const stats = priceTrackingService.getStats(game);
  const movers = priceTrackingService.getTopMovers(game);
  const serverMode = unifiedAlertService.isServerMode();
  const unreadDigest = digest.filter((d) => !d.read).length;

  const gradedVaultCards = vaultService
    .getVaultCards(game)
    .filter((vc) => vc.gradingResult != null);
  const gradingDiff = gradedVaultCards.reduce(
    (acc, vc) => {
      const raw = vc.card.marketPrice || 0;
      const graded =
        vc.gradingResult!.estimatedGradedValue ??
        calculateGradedValue(raw, vc.gradingResult!.grade);
      acc.raw += raw * vc.quantity;
      acc.graded += graded * vc.quantity;
      return acc;
    },
    { raw: 0, graded: 0 }
  );
  const gradingUpliftTotal = gradingDiff.graded - gradingDiff.raw;

  return (
    <div className="section-stack">
      <div className="animate-slide-up">
        <SectionLabel className="text-accent/90">Price tracker</SectionLabel>
        <h2 className="text-gradient mt-2 font-display text-3xl font-bold tracking-tight">
          Watchlist & alerts
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          Monitor favorites, spot movers, and set price triggers
          {isOnePiece ? ' for One Piece' : ''}
          {serverMode ? ' · synced to your account' : ' · stored on this device'}.
        </p>
      </div>

      {digest.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <Bell className="h-4 w-4 text-amber-300" />
              Alert digest
              {unreadDigest > 0 && (
                <span className="rounded-full bg-amber-500/25 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                  {unreadDigest} new
                </span>
              )}
            </h3>
            <button
              type="button"
              onClick={() => {
                unifiedAlertService.markDigestRead();
                setDigest(unifiedAlertService.getDigest());
              }}
              className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink-primary"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          </div>
          <ul className="space-y-2">
            {digest.slice(0, 8).map((entry) => (
              <li
                key={entry.id}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  entry.read
                    ? 'border-border-subtle text-ink-muted'
                    : 'border-amber-500/20 bg-surface-inset text-ink-primary'
                }`}
              >
                <span className="font-medium">{entry.cardName}</span>
                {' hit '}
                {entry.condition === 'above' ? '≥' : '≤'} {formatCurrency(entry.targetPrice)}
                {' · now '}
                {formatCurrency(entry.currentPrice)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="stagger-children grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <TrackerStatCard
          icon={Package}
          label="Tracked cards"
          value={stats.totalTracked}
          helper={stats.totalTracked === 0 ? 'Search below to add your first card' : 'Cards in watchlist'}
        />
        <TrackerStatCard
          icon={TrendingUp}
          label="Gainers"
          value={stats.totalGainers}
          helper={
            stats.totalGainers === 0
              ? 'No positive movers yet'
              : `${formatPercent(stats.avgChange, { signed: true })} avg`
          }
          tone="gain"
        />
        <TrackerStatCard
          icon={TrendingDown}
          label="Losers"
          value={stats.totalLosers}
          helper={stats.totalLosers === 0 ? 'No decliners in watchlist' : 'Cards trending down'}
          tone="loss"
        />
        <TrackerStatCard
          icon={Bell}
          label="Active alerts"
          value={alerts.filter((a) => a.isActive).length}
          helper={
            alerts.filter((a) => a.isActive).length === 0
              ? 'Set alerts from any tracked card'
              : serverMode
                ? 'Cloud alerts'
                : 'Local alerts'
          }
          tone="alert"
        />
      </div>

      {isPokemon && gradedVaultCards.length > 0 && (
        <div className="card-glass-scene">
          <h3 className="mb-1 text-sm font-semibold text-ink-primary">
            Graded vs raw differential
          </h3>
          <p className="mb-3 text-xs text-ink-muted">
            From {gradedVaultCards.length} AI-graded vault card
            {gradedVaultCards.length === 1 ? '' : 's'}
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-muted">Raw total</p>
              <p className="font-mono text-sm font-semibold tabular-nums text-ink-primary">
                {formatCurrency(gradingDiff.raw)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-muted">Est. graded</p>
              <p className="font-mono text-sm font-semibold tabular-nums text-ink-primary">
                {formatCurrency(gradingDiff.graded)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-muted">Uplift</p>
              <p
                className={`font-mono text-sm font-semibold tabular-nums ${
                  gradingUpliftTotal >= 0 ? 'text-gain' : 'text-loss'
                }`}
              >
                {gradingUpliftTotal >= 0 ? '+' : ''}
                {formatCurrency(gradingUpliftTotal)}
              </p>
            </div>
          </div>
        </div>
      )}

      {isPokemon && <CardComparePanel />}

      <div className="card-glass-scene">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-ink-primary">
          <Plus className="h-5 w-5 text-emerald-400" />
          Add card to track
        </h3>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
              placeholder={
                isOnePiece
                  ? 'Search One Piece cards to track…'
                  : 'Search for a card to track…'
              }
              className="input pl-10"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleSearch()}
            disabled={isSearching}
            className="btn-primary justify-center px-6 py-2.5 disabled:opacity-50"
          >
            {isSearching ? 'Searching…' : 'Search'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
            {searchResults.map((card) => {
              const price = getCardPrice(card);
              const isTracked = priceTrackingService.isTracked(card.id, game);
              return (
                <div
                  key={card.id}
                  className="flex items-center gap-4 rounded-xl border border-border-subtle bg-surface-inset p-3 hover:bg-surface-hover"
                >
                  <img
                    src={card.images.small}
                    alt={card.name}
                    className="h-16 w-11 object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate font-semibold text-ink-primary">{card.name}</h4>
                    <p className="text-xs text-ink-muted">{card.set.name}</p>
                    {price > 0 && (
                      <p className="mt-1 text-sm font-bold text-emerald-300">
                        {formatCurrency(price)}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTrackCard(card)}
                    disabled={isTracked}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                      isTracked
                        ? 'cursor-not-allowed border border-border-subtle text-ink-muted'
                        : 'btn-primary'
                    }`}
                  >
                    {isTracked ? 'Tracked' : 'Track'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(movers.gainers.length > 0 || movers.losers.length > 0) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {movers.gainers.length > 0 && (
            <div className="card">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-ink-primary">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
                Top gainers
              </h3>
              <div className="space-y-3">
                {movers.gainers.map((mover, index) => (
                  <motion.div
                    key={mover.card.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3"
                  >
                    <img
                      src={mover.card.images.small}
                      alt={mover.card.name}
                      className="h-16 w-12 rounded object-contain"
                    />
                    <div className="flex-1">
                      <h4 className="line-clamp-1 text-sm font-semibold text-ink-primary">
                        {mover.card.name}
                      </h4>
                      <p className="text-xs text-ink-muted">{formatCurrency(mover.currentPrice)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-emerald-300">
                        +{mover.changePercent.toFixed(1)}%
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
          {movers.losers.length > 0 && (
            <div className="card">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-ink-primary">
                <TrendingDown className="h-5 w-5 text-rose-400" />
                Top losers
              </h3>
              <div className="space-y-3">
                {movers.losers.map((mover, index) => (
                  <motion.div
                    key={mover.card.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center gap-3 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3"
                  >
                    <img
                      src={mover.card.images.small}
                      alt={mover.card.name}
                      className="h-16 w-12 rounded object-contain"
                    />
                    <div className="flex-1">
                      <h4 className="line-clamp-1 text-sm font-semibold text-ink-primary">
                        {mover.card.name}
                      </h4>
                      <p className="text-xs text-ink-muted">{formatCurrency(mover.currentPrice)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-rose-300">
                        {mover.changePercent.toFixed(1)}%
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card-glass-scene">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-ink-primary">
          <Star className="h-5 w-5 text-amber-400" />
          Tracked cards ({trackedCards.length})
        </h3>

        {trackedCards.length === 0 ? (
          <PageEmptyState
            icon={Target}
            title="No cards tracked yet"
            message="Search above and tap Track to start monitoring prices."
          />
        ) : (
          <div className="space-y-3">
            {trackedCards.map((tracked) => {
              const currentPrice =
                tracked.priceHistory[tracked.priceHistory.length - 1]?.price ??
                tracked.initialPrice;
              const change = currentPrice - tracked.initialPrice;
              const changePercent =
                tracked.initialPrice > 0 ? (change / tracked.initialPrice) * 100 : 0;
              const isPositive = change >= 0;
              const sparkData = buildSparklinePrices(tracked.priceHistory);

              return (
                <motion.div
                  key={tracked.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-border-default bg-gradient-surface p-4"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <img
                      src={tracked.card.images.small}
                      alt={tracked.card.name}
                      className="h-24 w-16 shrink-0 object-contain"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h4 className="text-lg font-semibold text-ink-primary">
                            {tracked.card.name}
                          </h4>
                          <p className="text-sm text-ink-muted">{tracked.card.set.name}</p>
                        </div>
                        <MiniSparkline
                          data={sparkData.map((price) => ({ price }))}
                          width={112}
                          height={36}
                          color={isPositive ? 'var(--gain)' : 'var(--loss)'}
                        />
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-3">
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
                            Initial
                          </p>
                          <p className="text-sm font-bold tabular-nums">
                            {formatCurrency(tracked.initialPrice)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
                            Current
                          </p>
                          <p className="text-sm font-bold tabular-nums">
                            {formatCurrency(currentPrice)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
                            Change
                          </p>
                          <p
                            className={`text-sm font-bold tabular-nums ${
                              isPositive ? 'text-emerald-300' : 'text-rose-300'
                            }`}
                          >
                            {formatPercent(changePercent, { signed: true })}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCardForAlert(tracked);
                            setAlertType('above');
                            setAlertTarget(
                              currentPrice > 0 ? (currentPrice * 1.1).toFixed(2) : ''
                            );
                            setShowAlertForm(true);
                          }}
                          className="btn-alert"
                        >
                          <AlertCircle className="h-4 w-4" />
                          Set alert
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUntrack(tracked.id)}
                          className="btn-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {alerts.length > 0 && (
        <div className="card-glass-scene">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-ink-primary">
            <Bell className="h-5 w-5 text-amber-400" />
            Price alerts ({alerts.filter((a) => a.isActive).length})
          </h3>
          <div className="space-y-3">
            {alerts
              .filter((a) => a.isActive)
              .map((alert) => (
                <div
                  key={`${alert.source}-${alert.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-accent/30 border-l-4 border-l-accent bg-surface-inset p-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate font-semibold text-ink-primary">{alert.cardName}</h4>
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                        {alert.source === 'server' ? 'Cloud' : 'Local'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm tabular-nums text-ink-muted">
                      Triggers {alert.condition === 'above' ? '≥' : '≤'}{' '}
                      <span className="font-semibold text-ink-secondary">
                        {formatCurrency(alert.targetPrice)}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteAlert(alert)}
                    className="btn-destructive"
                  >
                    Delete
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {showAlertForm && selectedCardForAlert && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md rounded-2xl border border-border-strong bg-surface-overlay p-6 shadow-elevated"
          >
            <h3 className="text-xl font-bold text-ink-primary">Create price alert</h3>
            <p className="mt-1 text-sm text-ink-muted">{selectedCardForAlert.card.name}</p>
            <div className="mt-4 space-y-4">
              <div>
                <span className="section-label mb-2 block">Trigger when price goes</span>
                <div className="inline-flex w-full rounded-lg border border-border-default bg-surface-inset p-1">
                  {(['above', 'below'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setAlertType(type)}
                      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
                        alertType === type
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
                <span className="section-label mb-2 block">Target price ($)</span>
                <input
                  type="number"
                  step="0.01"
                  value={alertTarget}
                  onChange={(e) => setAlertTarget(e.target.value)}
                  className="input tabular-nums"
                />
              </label>
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
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
