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
      {/* Enhanced Header */}
      <div className="flex justify-between items-center flex-wrap gap-4 animate-slide-up">
        <div className="flex items-center gap-4">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-accent-600 to-pink-600 rounded-2xl blur opacity-60 group-hover:opacity-100 transition duration-500 animate-glow" />
            <div className="relative p-4 bg-gradient-to-br from-accent-600 to-pink-600 rounded-2xl shadow-xl">
              <Vault className="w-10 h-10 text-white" />
            </div>
          </div>
          <div>
            <h2 className="text-4xl font-black gradient-text tracking-tight">
              My Vault
            </h2>
            <p className="text-gray-600 text-base font-medium mt-1">Your personal card collection</p>
          </div>
        </div>

        {/* Enhanced Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleExport}
            className="group flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            disabled={vaultCards.length === 0}
          >
            <Download className="w-4 h-4 group-hover:animate-bounce" />
            Export
          </button>
          <button
            onClick={handleImport}
            className="group flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-primary-600 to-accent-600 text-white rounded-xl hover:from-primary-700 hover:to-accent-700 font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
          >
            <Upload className="w-4 h-4 group-hover:animate-bounce" />
            Import
          </button>
          {vaultCards.length > 0 && (
            <button
              onClick={handleClearVault}
              className="group flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-xl hover:from-red-700 hover:to-rose-700 font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
            >
              <Trash2 className="w-4 h-4 group-hover:rotate-12 transition-transform" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Enhanced Stats Cards */}
      {vaultCards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-slide-up">
          {/* Total Cards */}
          <div className="group card hover:border-primary-300 border-2 border-transparent p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-3 bg-gradient-to-br from-primary-100 to-primary-200 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <Package className="w-6 h-6 text-primary-600" />
              </div>
              <p className="text-sm font-semibold text-gray-600">Total Cards</p>
            </div>
            <p className="text-4xl font-black text-gray-900 mb-2">{stats.totalCards}</p>
            <p className="text-sm text-gray-500 font-medium">{vaultCards.length} unique entries</p>
          </div>

          {/* Total Investment */}
          <div className="group card hover:border-accent-300 border-2 border-transparent p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-3 bg-gradient-to-br from-accent-100 to-accent-200 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <DollarSign className="w-6 h-6 text-accent-600" />
              </div>
              <p className="text-sm font-semibold text-gray-600">Total Invested</p>
            </div>
            <p className="text-4xl font-black text-gray-900 mb-2">${stats.totalValue.toFixed(2)}</p>
            <p className="text-sm text-gray-500 font-medium">Purchase value</p>
          </div>

          {/* Current Value */}
          <div className="group card hover:border-green-300 border-2 border-transparent p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-3 bg-gradient-to-br from-green-100 to-emerald-200 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
              <p className="text-sm font-semibold text-gray-600">Current Value</p>
            </div>
            <p className="text-4xl font-black text-gray-900 mb-2">${stats.currentValue.toFixed(2)}</p>
            <p className="text-sm text-gray-500 font-medium">Market value</p>
          </div>

          {/* Profit/Loss */}
          <div className={`group rounded-2xl p-6 shadow-card hover:shadow-card-hover transition-all duration-300 border-2 ${
            stats.profit >= 0 
              ? 'bg-gradient-to-br from-green-50 via-green-50 to-emerald-100 border-green-300 hover:border-green-400' 
              : 'bg-gradient-to-br from-red-50 via-red-50 to-rose-100 border-red-300 hover:border-red-400'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-3 rounded-xl group-hover:scale-110 transition-transform duration-300 ${stats.profit >= 0 ? 'bg-green-200/80' : 'bg-red-200/80'}`}>
                {stats.profit >= 0 ? (
                  <TrendingUp className="w-6 h-6 text-green-700" />
                ) : (
                  <TrendingDown className="w-6 h-6 text-red-700" />
                )}
              </div>
              <p className={`text-sm font-semibold ${stats.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {stats.profit >= 0 ? 'Total Profit' : 'Total Loss'}
              </p>
            </div>
            <p className={`text-4xl font-black mb-2 ${stats.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {stats.profit >= 0 ? '+' : ''}${stats.profit.toFixed(2)}
            </p>
            <p className={`text-sm font-bold ${stats.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
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

