import React, { useState, useEffect } from 'react';
import { VaultCard as VaultCardType } from '../types/pokemon';
import { vaultService } from '../services/vaultService';
import { VaultCard } from './VaultCard';
import { Vault, TrendingUp, TrendingDown, Package, DollarSign, Download, Upload, Trash2 } from 'lucide-react';

export const VaultView: React.FC = () => {
  const [vaultCards, setVaultCards] = useState<VaultCardType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadVaultCards();
  }, []);

  const loadVaultCards = () => {
    setIsLoading(true);
    const cards = vaultService.getVaultCards();
    setVaultCards(cards);
    setIsLoading(false);
  };

  const handleRemoveCard = (id: string) => {
    vaultService.removeFromVault(id);
    loadVaultCards();
  };

  const handleExport = () => {
    const data = vaultService.exportVault();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tcg-vault-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const content = e.target?.result as string;
            vaultService.importVault(content);
            loadVaultCards();
            alert('Vault imported successfully!');
          } catch (error) {
            alert('Error importing vault: Invalid file format');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleClearVault = () => {
    if (window.confirm('Are you sure you want to clear your entire vault? This cannot be undone!')) {
      vaultService.clearVault();
      loadVaultCards();
    }
  };

  const stats = vaultService.getVaultStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl shadow-lg">
            <Vault className="w-8 h-8 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-black bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              My Vault
            </h2>
            <p className="text-gray-600 text-sm">Your personal card collection</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors shadow-md"
            disabled={vaultCards.length === 0}
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={handleImport}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-md"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          {vaultCards.length > 0 && (
            <button
              onClick={handleClearVault}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors shadow-md"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {vaultCards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Cards */}
          <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-sm font-medium text-gray-600">Total Cards</p>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.totalCards}</p>
            <p className="text-xs text-gray-500 mt-1">{vaultCards.length} unique entries</p>
          </div>

          {/* Total Investment */}
          <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-sm font-medium text-gray-600">Total Invested</p>
            </div>
            <p className="text-3xl font-bold text-gray-900">${stats.totalValue.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-1">Purchase value</p>
          </div>

          {/* Current Value */}
          <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-sm font-medium text-gray-600">Current Value</p>
            </div>
            <p className="text-3xl font-bold text-gray-900">${stats.currentValue.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-1">Market value</p>
          </div>

          {/* Profit/Loss */}
          <div className={`rounded-xl p-6 shadow-lg border-2 ${
            stats.profit >= 0 
              ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-300' 
              : 'bg-gradient-to-br from-red-50 to-red-100 border-red-300'
          }`}>
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-lg ${stats.profit >= 0 ? 'bg-green-200' : 'bg-red-200'}`}>
                {stats.profit >= 0 ? (
                  <TrendingUp className="w-5 h-5 text-green-700" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-700" />
                )}
              </div>
              <p className={`text-sm font-medium ${stats.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {stats.profit >= 0 ? 'Total Profit' : 'Total Loss'}
              </p>
            </div>
            <p className={`text-3xl font-bold ${stats.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {stats.profit >= 0 ? '+' : ''}${stats.profit.toFixed(2)}
            </p>
            <p className={`text-xs font-semibold mt-1 ${stats.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {stats.profitPercentage >= 0 ? '+' : ''}{stats.profitPercentage.toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {vaultCards.length === 0 ? (
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-12 text-center shadow-lg border border-white/20">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-100 to-blue-100 rounded-full mb-6">
            <Vault className="w-10 h-10 text-purple-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-3">Your Vault is Empty</h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Start building your collection by searching for cards and adding them to your vault.
            Track purchases, monitor values, and watch your collection grow!
          </p>
          <div className="flex gap-4 justify-center">
            <p className="text-sm text-gray-500">
              💡 Tip: Use the "Card Explorer" tab to search for cards and add them to your vault.
            </p>
          </div>
        </div>
      ) : (
        /* Vault Cards Grid */
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900">
              Your Cards ({vaultCards.length})
            </h3>
          </div>
          
          <div className="space-y-4">
            {vaultCards.map((vaultCard) => (
              <VaultCard
                key={vaultCard.id}
                vaultCard={vaultCard}
                onRemove={handleRemoveCard}
                onUpdate={loadVaultCards}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

