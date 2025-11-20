import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, AlertCircle, Plus, Trash2, Search, Star, Target, Bell, Package } from 'lucide-react';
import { priceTrackingService, TrackedCard, PriceAlert } from '../../../services/priceTrackingService';
import { pokemonApi } from '../../../services/pokemonApi';
import { PokemonCard } from '../../../types/pokemon';

export const PriceTrackingDashboard: React.FC = () => {
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
    <div className="space-y-8">
      {/* Header */}
      <div className="animate-slide-up">
        <div className="flex items-center gap-4 mb-3">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary-600 to-accent-600 rounded-2xl blur opacity-60 group-hover:opacity-100 transition duration-500 animate-glow" />
            <div className="relative p-4 bg-gradient-to-br from-primary-600 to-accent-600 rounded-2xl shadow-xl">
              <TrendingUp className="w-10 h-10 text-white" />
            </div>
          </div>
          <div>
            <h2 className="text-4xl font-black gradient-text tracking-tight">
              Price Tracker
            </h2>
            <p className="text-gray-600 text-base font-medium mt-1">
              Monitor your favorite cards and set price alerts
            </p>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-slide-up">
        <div className="group card hover:border-primary-300 border-2 border-transparent p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-gradient-to-br from-primary-100 to-primary-200 rounded-xl group-hover:scale-110 transition-transform duration-300">
              <Package className="w-6 h-6 text-primary-600" />
            </div>
            <p className="text-sm font-semibold text-gray-600">Tracked Cards</p>
          </div>
          <p className="text-4xl font-black text-gray-900 mb-2">{stats.totalTracked}</p>
          <p className="text-sm text-gray-500 font-medium">Cards in watchlist</p>
        </div>

        <div className="group card hover:border-green-300 border-2 border-transparent p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-gradient-to-br from-green-100 to-emerald-200 rounded-xl group-hover:scale-110 transition-transform duration-300">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-sm font-semibold text-gray-600">Gainers</p>
          </div>
          <p className="text-4xl font-black text-gray-900 mb-2">{stats.totalGainers}</p>
          <p className="text-sm text-green-600 font-bold">
            {stats.avgChange > 0 ? '+' : ''}{stats.avgChange.toFixed(1)}% avg
          </p>
        </div>

        <div className="group card hover:border-red-300 border-2 border-transparent p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-gradient-to-br from-red-100 to-rose-200 rounded-xl group-hover:scale-110 transition-transform duration-300">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
            <p className="text-sm font-semibold text-gray-600">Losers</p>
          </div>
          <p className="text-4xl font-black text-gray-900 mb-2">{stats.totalLosers}</p>
          <p className="text-sm text-gray-500 font-medium">Cards down</p>
        </div>

        <div className="group card hover:border-yellow-300 border-2 border-transparent p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-gradient-to-br from-yellow-100 to-amber-200 rounded-xl group-hover:scale-110 transition-transform duration-300">
              <Bell className="w-6 h-6 text-yellow-600" />
            </div>
            <p className="text-sm font-semibold text-gray-600">Active Alerts</p>
          </div>
          <p className="text-4xl font-black text-gray-900 mb-2">{stats.totalAlerts}</p>
          <p className="text-sm text-gray-500 font-medium">Price notifications</p>
        </div>
      </div>

      {/* Add New Card to Track */}
      <div className="card p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-primary-600" />
          Add Card to Track
        </h3>
        
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search for a card to track..."
              className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-medium"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="px-8 py-3 bg-gradient-to-r from-primary-600 to-accent-600 text-white rounded-xl font-bold hover:from-primary-700 hover:to-accent-700 transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
            {searchResults.map((card) => {
              const price = getCardPrice(card);
              const isTracked = priceTrackingService.isTracked(card.id);
              
              return (
                <div
                  key={card.id}
                  className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <img
                    src={card.images.small}
                    alt={card.name}
                    className="w-16 h-22 object-contain rounded-lg"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (target.src !== card.images.large) {
                        target.src = card.images.large;
                      }
                    }}
                  />
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-900">{card.name}</h4>
                    <p className="text-sm text-gray-600">{card.set.name}</p>
                    {price > 0 && (
                      <p className="text-sm font-bold text-green-600 mt-1">
                        ${price.toFixed(2)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleTrackCard(card)}
                    disabled={isTracked}
                    className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                      isTracked
                        ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                        : 'bg-primary-600 text-white hover:bg-primary-700'
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
            <div className="card p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                Top Gainers
              </h3>
              <div className="space-y-3">
                {movers.gainers.map((mover, index) => (
                  <motion.div
                    key={mover.card.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center gap-3 p-3 bg-green-50 rounded-lg"
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
                      <h4 className="font-bold text-gray-900 text-sm line-clamp-1">
                        {mover.card.name}
                      </h4>
                      <p className="text-xs text-gray-600">${mover.currentPrice.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-green-600">+{mover.changePercent.toFixed(1)}%</p>
                      <p className="text-xs text-gray-600">+${Math.abs(mover.change).toFixed(2)}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Top Losers */}
          {movers.losers.length > 0 && (
            <div className="card p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-red-600" />
                Top Losers
              </h3>
              <div className="space-y-3">
                {movers.losers.map((mover, index) => (
                  <motion.div
                    key={mover.card.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center gap-3 p-3 bg-red-50 rounded-lg"
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
                      <h4 className="font-bold text-gray-900 text-sm line-clamp-1">
                        {mover.card.name}
                      </h4>
                      <p className="text-xs text-gray-600">${mover.currentPrice.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-red-600">{mover.changePercent.toFixed(1)}%</p>
                      <p className="text-xs text-gray-600">-${Math.abs(mover.change).toFixed(2)}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tracked Cards */}
      <div className="card p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-600" />
          Tracked Cards ({trackedCards.length})
        </h3>
        
        {trackedCards.length === 0 ? (
          <div className="text-center py-12">
            <Target className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">
              No cards tracked yet. Search and add cards to start monitoring their prices!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {trackedCards.map((tracked) => {
              const currentPrice = tracked.priceHistory[tracked.priceHistory.length - 1].price;
              const change = currentPrice - tracked.initialPrice;
              const changePercent = tracked.initialPrice > 0 ? (change / tracked.initialPrice) * 100 : 0;
              const isPositive = change >= 0;

              return (
                <div key={tracked.id} className="card p-4 border-2 border-gray-100">
                  <div className="flex items-start gap-4">
                    <img
                      src={tracked.card.images.small}
                      alt={tracked.card.name}
                      className="w-20 h-28 object-contain rounded-lg"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (target.src !== tracked.card.images.large) {
                          target.src = tracked.card.images.large;
                        }
                      }}
                    />
                    
                    <div className="flex-1">
                      <h4 className="font-bold text-gray-900 text-lg mb-1">
                        {tracked.card.name}
                      </h4>
                      <p className="text-sm text-gray-600 mb-3">{tracked.card.set.name}</p>
                      
                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div>
                          <p className="text-xs text-gray-500 font-semibold mb-1">Initial Price</p>
                          <p className="text-sm font-bold text-gray-900">
                            ${tracked.initialPrice.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 font-semibold mb-1">Current Price</p>
                          <p className="text-sm font-bold text-gray-900">
                            ${currentPrice.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 font-semibold mb-1">Change</p>
                          <p className={`text-sm font-black ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                            {isPositive ? '+' : ''}{changePercent.toFixed(1)}%
                          </p>
                        </div>
                      </div>

                      {/* Price Chart */}
                      {tracked.priceHistory.length > 1 && (
                        <div className="h-24 mb-3">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={tracked.priceHistory}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis 
                                dataKey="date" 
                                tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                tick={{ fontSize: 10 }}
                              />
                              <YAxis 
                                tickFormatter={(value) => `$${value}`}
                                tick={{ fontSize: 10 }}
                              />
                              <Tooltip 
                                formatter={(value: number) => [`$${value.toFixed(2)}`, 'Price']}
                                labelFormatter={(date) => new Date(date).toLocaleDateString()}
                              />
                              <Line 
                                type="monotone" 
                                dataKey="price" 
                                stroke={isPositive ? '#10b981' : '#ef4444'}
                                strokeWidth={2}
                                dot={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedCardForAlert(tracked);
                            setShowAlertForm(true);
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors font-semibold text-sm"
                        >
                          <AlertCircle className="w-4 h-4" />
                          Set Alert
                        </button>
                        <button
                          onClick={() => handleUntrack(tracked.id)}
                          className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-semibold text-sm"
                        >
                          <Trash2 className="w-4 h-4" />
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
        <div className="card p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5 text-yellow-600" />
            Price Alerts ({alerts.filter(a => a.isActive).length})
          </h3>
          
          <div className="space-y-3">
            {alerts.filter(a => a.isActive).map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg border border-yellow-200"
              >
                <div>
                  <h4 className="font-bold text-gray-900">{alert.cardName}</h4>
                  <p className="text-sm text-gray-600">
                    Alert when price goes {alert.alertType} ${alert.targetPrice.toFixed(2)}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteAlert(alert.id)}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-semibold"
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl"
          >
            <h3 className="text-2xl font-bold text-gray-900 mb-4">
              Create Price Alert
            </h3>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-1">Card</p>
              <p className="font-bold text-gray-900">{selectedCardForAlert.card.name}</p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Alert Type
              </label>
              <select
                value={alertType}
                onChange={(e) => setAlertType(e.target.value as 'above' | 'below')}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 font-medium"
              >
                <option value="above">Above Target Price</option>
                <option value="below">Below Target Price</option>
              </select>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Target Price ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={alertTarget}
                onChange={(e) => setAlertTarget(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 font-medium"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCreateAlert}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-primary-600 to-accent-600 text-white rounded-xl font-bold hover:from-primary-700 hover:to-accent-700 transition-all"
              >
                Create Alert
              </button>
              <button
                onClick={() => {
                  setShowAlertForm(false);
                  setSelectedCardForAlert(null);
                  setAlertTarget('');
                }}
                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300 transition-all"
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
