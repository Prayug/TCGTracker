import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { TrendingUp, TrendingDown, AlertCircle, Download, Calendar, Filter, Search } from 'lucide-react';

interface PriceSnapshot {
  date: string;
  totalCards: number;
  avgPrice: number;
  medianPrice: number;
  totalVolume: number;
  topGainers: Array<{
    productName: string;
    currentPrice: number;
    previousPrice: number;
    changePercent: number;
  }>;
  topLosers: Array<{
    productName: string;
    currentPrice: number;
    previousPrice: number;
    changePercent: number;
  }>;
}

interface PriceAlert {
  id: number;
  cardId?: string;
  productId?: number;
  targetPrice: number;
  alertType: 'above' | 'below' | 'change_percent';
  threshold: number;
  isActive: boolean;
  createdAt: string;
}

export const PriceTrackingDashboard: React.FC = () => {
  const [snapshots, setSnapshots] = useState<PriceSnapshot[]>([]);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState('30');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewAlertForm, setShowNewAlertForm] = useState(false);
  const [newAlert, setNewAlert] = useState({
    cardId: '',
    productId: '',
    targetPrice: '',
    alertType: 'above' as const,
    threshold: ''
  });

  useEffect(() => {
    fetchDashboardData();
  }, [selectedTimeframe]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [snapshotsRes, alertsRes] = await Promise.all([
        fetch(`/api/prices/snapshots/daily?days=${selectedTimeframe}`),
        fetch('/api/prices/alerts')
      ]);

      const snapshotsData = await snapshotsRes.json();
      const alertsData = await alertsRes.json();

      setSnapshots(snapshotsData.data || []);
      setAlerts(alertsData.data || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/prices/alerts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cardId: newAlert.cardId || null,
          productId: newAlert.productId ? parseInt(newAlert.productId) : null,
          targetPrice: parseFloat(newAlert.targetPrice),
          alertType: newAlert.alertType,
          threshold: parseFloat(newAlert.threshold)
        }),
      });

      if (response.ok) {
        setShowNewAlertForm(false);
        setNewAlert({
          cardId: '',
          productId: '',
          targetPrice: '',
          alertType: 'above',
          threshold: ''
        });
        fetchDashboardData();
      }
    } catch (error) {
      console.error('Error creating alert:', error);
    }
  };

  const handleDeleteAlert = async (alertId: number) => {
    try {
      await fetch(`/api/prices/alerts/${alertId}`, {
        method: 'DELETE',
      });
      fetchDashboardData();
    } catch (error) {
      console.error('Error deleting alert:', error);
    }
  };

  const exportData = async (productId: string, format: 'json' | 'csv' = 'csv') => {
    try {
      const response = await fetch(`/api/prices/export/${productId}?format=${format}`);
      if (format === 'csv') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `price_history_${productId}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const data = await response.json();
        console.log('Exported data:', data);
      }
    } catch (error) {
      console.error('Error exporting data:', error);
    }
  };

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;

  const getLatestSnapshot = () => snapshots[0] || null;
  const getPreviousSnapshot = () => snapshots[1] || null;

  const calculateMarketChange = () => {
    const latest = getLatestSnapshot();
    const previous = getPreviousSnapshot();
    
    if (!latest || !previous) return null;
    
    const change = latest.avgPrice - previous.avgPrice;
    const changePercent = (change / previous.avgPrice) * 100;
    
    return {
      change,
      changePercent,
      isPositive: change >= 0
    };
  };

  const marketChange = calculateMarketChange();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Price Tracking Dashboard</h1>
          <p className="text-gray-600">Monitor market trends and set price alerts</p>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={selectedTimeframe}
            onChange={(e) => setSelectedTimeframe(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </select>
        </div>
      </div>

      {/* Market Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Market Average</p>
              <p className="text-2xl font-bold text-gray-900">
                {getLatestSnapshot() ? formatPrice(getLatestSnapshot()!.avgPrice) : '--'}
              </p>
            </div>
            <div className={`p-2 rounded-full ${
              marketChange?.isPositive ? 'bg-green-100' : 'bg-red-100'
            }`}>
              {marketChange?.isPositive ? (
                <TrendingUp className="h-5 w-5 text-green-600" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-600" />
              )}
            </div>
          </div>
          {marketChange && (
            <div className={`mt-2 text-sm ${
              marketChange.isPositive ? 'text-green-600' : 'text-red-600'
            }`}>
              {marketChange.isPositive ? '+' : ''}{marketChange.changePercent.toFixed(1)}% from yesterday
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Cards Tracked</p>
              <p className="text-2xl font-bold text-gray-900">
                {getLatestSnapshot()?.totalCards.toLocaleString() || '--'}
              </p>
            </div>
            <div className="p-2 rounded-full bg-blue-100">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Alerts</p>
              <p className="text-2xl font-bold text-gray-900">
                {alerts.filter(a => a.isActive).length}
              </p>
            </div>
            <div className="p-2 rounded-full bg-yellow-100">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Median Price</p>
              <p className="text-2xl font-bold text-gray-900">
                {getLatestSnapshot() ? formatPrice(getLatestSnapshot()!.medianPrice) : '--'}
              </p>
            </div>
            <div className="p-2 rounded-full bg-purple-100">
              <Filter className="h-5 w-5 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Market Trends Chart */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold mb-4">Market Trends</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={snapshots.slice().reverse()}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(date) => new Date(date).toLocaleDateString()}
              />
              <YAxis tickFormatter={formatPrice} />
              <Tooltip 
                formatter={(value: number) => [formatPrice(value), 'Average Price']}
                labelFormatter={(date) => new Date(date).toLocaleDateString()}
              />
              <Line 
                type="monotone" 
                dataKey="avgPrice" 
                stroke="#3B82F6" 
                strokeWidth={2}
                dot={{ fill: '#3B82F6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Gainers and Losers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-600" />
            Top Gainers Today
          </h3>
          <div className="space-y-3">
            {getLatestSnapshot()?.topGainers.slice(0, 5).map((gainer, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex-1">
                  <p className="font-medium text-gray-900 truncate">{gainer.productName}</p>
                  <p className="text-sm text-gray-600">{formatPrice(gainer.currentPrice)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-green-600">+{gainer.changePercent.toFixed(1)}%</p>
                  <p className="text-sm text-gray-600">+{formatPrice(gainer.currentPrice - gainer.previousPrice)}</p>
                </div>
              </div>
            )) || <p className="text-gray-500">No data available</p>}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-red-600" />
            Top Losers Today
          </h3>
          <div className="space-y-3">
            {getLatestSnapshot()?.topLosers.slice(0, 5).map((loser, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                <div className="flex-1">
                  <p className="font-medium text-gray-900 truncate">{loser.productName}</p>
                  <p className="text-sm text-gray-600">{formatPrice(loser.currentPrice)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-red-600">{loser.changePercent.toFixed(1)}%</p>
                  <p className="text-sm text-gray-600">{formatPrice(loser.currentPrice - loser.previousPrice)}</p>
                </div>
              </div>
            )) || <p className="text-gray-500">No data available</p>}
          </div>
        </div>
      </div>

      {/* Price Alerts */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Price Alerts</h3>
          <button
            onClick={() => setShowNewAlertForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Alert
          </button>
        </div>

        {showNewAlertForm && (
          <form onSubmit={handleCreateAlert} className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <input
                type="text"
                placeholder="Card ID (optional)"
                value={newAlert.cardId}
                onChange={(e) => setNewAlert({...newAlert, cardId: e.target.value})}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Product ID (optional)"
                value={newAlert.productId}
                onChange={(e) => setNewAlert({...newAlert, productId: e.target.value})}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="number"
                placeholder="Target Price"
                value={newAlert.targetPrice}
                onChange={(e) => setNewAlert({...newAlert, targetPrice: e.target.value})}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
              <select
                value={newAlert.alertType}
                onChange={(e) => setNewAlert({...newAlert, alertType: e.target.value as any})}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="above">Above</option>
                <option value="below">Below</option>
                <option value="change_percent">% Change</option>
              </select>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewAlertForm(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        )}

        <div className="space-y-3">
          {alerts.filter(a => a.isActive).map((alert) => (
            <div key={alert.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">
                  {alert.cardId ? `Card: ${alert.cardId}` : `Product: ${alert.productId}`}
                </p>
                <p className="text-sm text-gray-600">
                  Alert when price is {alert.alertType} ${alert.targetPrice}
                </p>
              </div>
              <button
                onClick={() => handleDeleteAlert(alert.id)}
                className="px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
              >
                Delete
              </button>
            </div>
          ))}
          {alerts.filter(a => a.isActive).length === 0 && (
            <p className="text-gray-500 text-center py-8">No active alerts</p>
          )}
        </div>
      </div>
    </div>
  );
}; 