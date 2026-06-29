import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, AlertCircle, Plus, Trash2, Search, Star, Target, Bell, Package, LineChart } from 'lucide-react';
import { priceTrackingService, TrackedCard, PriceAlert } from '../../../services/priceTrackingService';
import { pokemonApi } from '../../../services/pokemonApi';
import { PokemonCard } from '../../../types/pokemon';
import { useGame } from '../../../contexts/GameContext';
import { SectionLabel } from '../../../components/common/SectionLabel';
import { PageEmptyState } from '../../../components/common/PageEmptyState';
import { MiniSparkline } from '../../../components/common/MiniSparkline';
import { TrackerStatCard, buildSparklinePrices } from './TrackerStatCard';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { markOnboardingStep } from '../../../components/common/OnboardingChecklist';

export const PriceTrackingDashboard: React.FC = () => {
  const { isOnePiece } = useGame();
  const [trackedCards, setTrackedCards] = useState<TrackedCard[]>([]);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PokemonCard[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [selectedCardForAlert, setSelectedCardForAlert] = useState<TrackedCard | null>(null);
  const [alertTarget, setAlertTarget] = useState('');
  const [alertType, setAlertType] = useState<'above' | 'below'>('above');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setTrackedCards(priceTrackingService.getTrackedCards());
    setAlerts(priceTrackingService.getAlerts());
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const results = await pokemonApi.searchCards(searchQuery);
      setSearchResults(results.slice(0, 10));
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleTrackCard = (card: PokemonCard) => {
    priceTrackingService.trackCard(card);
    markOnboardingStep('track');
    loadData();
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleUntrack = (cardId: string) => {
    priceTrackingService.untrackCard(cardId);
    loadData();
  };

  const handleCreateAlert = () => {
    if (!selectedCardForAlert || !alertTarget) return;
    
    priceTrackingService.createAlert(
      selectedCardForAlert.id,
      selectedCardForAlert.card.name,
      parseFloat(alertTarget),
      alertType
    );
    
    setShowAlertForm(false);
    setSelectedCardForAlert(null);
    setAlertTarget('');
    loadData();
  };

  const handleDeleteAlert = (alertId: string) => {
    priceTrackingService.deleteAlert(alertId);
    loadData();
  };

  const stats = priceTrackingService.getStats();
  const movers = priceTrackingService.getTopMovers();

  const getCardPrice = (card: PokemonCard) => {
    return card.marketPrice || card.tcgplayer?.prices?.holofoil?.market || 0;
  };

  return (
    <div className="section-stack">
      {/* One Piece coming soon */}
      {isOnePiece && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border-strong bg-surface-raised p-12 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-border-default bg-surface-inset">
            <LineChart className="h-8 w-8 text-ink-muted" aria-hidden="true" />
          </div>
          <h3 className="mb-2 text-xl font-semibold text-ink-primary">Coming Soon</h3>
          <p className="mx-auto mb-6 max-w-md text-sm text-ink-muted">
            One Piece price tracking is under development. Browse One Piece cards to see market prices!
          </p>
          <a href="/browse" className="btn-secondary">
            <Package className="h-4 w-4" aria-hidden="true" />
            Browse One Piece Cards
          </a>
        </div>
      )}

      <div className="animate-slide-up">
        <SectionLabel className="text-violet-300/90">Price tracker</SectionLabel>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Watchlist & alerts</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Monitor favorites, spot 7-day moves, and set price triggers.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 animate-slide-up">
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
          helper={stats.totalGainers === 0 ? 'No positive movers yet' : `${formatPercent(stats.avgChange, { signed: true })} avg`}
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
          value={stats.totalAlerts}
          helper={stats.totalAlerts === 0 ? 'Set alerts from any tracked card' : 'Price notifications'}
          tone="alert"
        />
      </div>

      <div className="card">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
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
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search for a card to track..."
              className="input pl-10"
            />
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={isSearching}
            className="btn-primary justify-center px-6 py-2.5 disabled:opacity-50"
          >
            {isSearching ? 'Searching…' : 'Search'}
          </button>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
            {searchResults.map((card) => {
              const price = getCardPrice(card);
              const isTracked = priceTrackingService.isTracked(card.id);

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
                    <h4 className="truncate font-semibold text-white">{card.name}</h4>
                    <p className="text-xs text-ink-muted">{card.set.name}</p>
                    {price > 0 && (
                      <p className="mt-1 text-sm font-bold text-emerald-300">{formatCurrency(price)}</p>
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

      {/* Top Movers */}
      {(movers.gainers.length > 0 || movers.losers.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Gainers */}
          {movers.gainers.length > 0 && (
            <div className="card">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
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
                      className="w-12 h-16 object-contain rounded"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (target.src !== mover.card.images.large) {
                          target.src = mover.card.images.large;
                        }
                      }}
                    />
                    <div className="flex-1">
                      <h4 className="line-clamp-1 text-sm font-semibold text-white">{mover.card.name}</h4>
                      <p className="text-xs text-ink-muted">{formatCurrency(mover.currentPrice)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-emerald-300">+{mover.changePercent.toFixed(1)}%</p>
                      <p className="text-xs text-ink-muted">+{formatCurrency(Math.abs(mover.change))}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Top Losers */}
          {movers.losers.length > 0 && (
            <div className="card">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
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
                      className="w-12 h-16 object-contain rounded"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (target.src !== mover.card.images.large) {
                          target.src = mover.card.images.large;
                        }
                      }}
                    />
                    <div className="flex-1">
                      <h4 className="line-clamp-1 text-sm font-semibold text-white">{mover.card.name}</h4>
                      <p className="text-xs text-ink-muted">{formatCurrency(mover.currentPrice)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-rose-300">{mover.changePercent.toFixed(1)}%</p>
                      <p className="text-xs text-ink-muted">-{formatCurrency(Math.abs(mover.change))}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
          <Star className="h-5 w-5 text-amber-400" />
          Tracked cards ({trackedCards.length})
        </h3>

        {trackedCards.length === 0 ? (
          <PageEmptyState
            icon={Target}
            title="No cards tracked yet"
            message="Search above and tap Track to start monitoring prices and 7-day movement."
          />
        ) : (
          <div className="space-y-3">
            {trackedCards.map((tracked) => {
              const currentPrice = tracked.priceHistory[tracked.priceHistory.length - 1].price;
              const change = currentPrice - tracked.initialPrice;
              const changePercent =
                tracked.initialPrice > 0 ? (change / tracked.initialPrice) * 100 : 0;
              const isPositive = change >= 0;
              const sparkData = buildSparklinePrices(tracked.priceHistory);

              return (
                <div
                  key={tracked.id}
                  className="rounded-xl border border-border-subtle bg-surface-inset p-4"
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
                          <h4 className="text-lg font-semibold text-white">{tracked.card.name}</h4>
                          <p className="text-sm text-ink-muted">{tracked.card.set.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="section-label !text-[10px]">7-day trend</p>
                          <MiniSparkline data={sparkData} positive={isPositive} width={112} height={36} />
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-3">
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
                            Initial
                          </p>
                          <p className="text-sm font-bold tabular-nums text-white">
                            {formatCurrency(tracked.initialPrice)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
                            Current
                          </p>
                          <p className="text-sm font-bold tabular-nums text-white">
                            {formatCurrency(currentPrice)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
                            Change
                          </p>
                          <p
                            className={`text-sm font-bold tabular-nums ${isPositive ? 'text-emerald-300' : 'text-rose-300'}`}
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
                            // Prefill at +10% of current — most alerts are "tell me when it pops".
                            setAlertTarget(currentPrice > 0 ? (currentPrice * 1.1).toFixed(2) : '');
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
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Price Alerts */}
      {alerts.length > 0 && (
        <div className="card">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
            <Bell className="h-5 w-5 text-amber-400" />
            Price alerts ({alerts.filter((a) => a.isActive).length})
          </h3>

          <div className="space-y-3">
            {alerts
              .filter((a) => a.isActive)
              .map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-surface-inset p-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate font-semibold text-white">{alert.cardName}</h4>
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
                        Armed
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm tabular-nums text-ink-muted">
                      Triggers {alert.alertType === 'above' ? '≥' : '≤'}{' '}
                      <span className="font-semibold text-ink-secondary">{formatCurrency(alert.targetPrice)}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteAlert(alert.id)}
                    className="btn-destructive"
                  >
                    Delete
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Create Alert Modal */}
      {showAlertForm && selectedCardForAlert && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 ">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md rounded-2xl border border-border-strong bg-surface-overlay p-6"
          >
            <h3 className="text-xl font-bold text-white">Create price alert</h3>
            <p className="mt-1 text-sm text-ink-muted">{selectedCardForAlert.card.name}</p>

            <div className="mt-4 space-y-4">
              <div>
                <span className="section-label mb-2 block">Trigger when price goes</span>
                <div
                  className="inline-flex w-full rounded-lg border border-border-default bg-surface-inset p-1"
                  role="radiogroup"
                  aria-label="Alert condition"
                >
                  {(['above', 'below'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      role="radio"
                      aria-checked={alertType === type}
                      onClick={() => setAlertType(type)}
                      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                        alertType === type
                          ? 'bg-surface-hover text-white'
                          : 'text-ink-muted hover:text-ink-secondary'
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
                  inputMode="decimal"
                  value={alertTarget}
                  onChange={(e) => setAlertTarget(e.target.value)}
                  placeholder="0.00"
                  className="input tabular-nums"
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                />
              </label>
            </div>

            <div className="mt-6 flex gap-3">
              <button type="button" onClick={handleCreateAlert} className="btn-primary flex-1 justify-center">
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
