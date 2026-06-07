import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { VaultCard as VaultCardType } from '../../../types/pokemon';
import { vaultService } from '../../../services/vaultService';
import { VaultCard } from './VaultCard';
import { VaultPortfolioBySet } from './VaultPortfolioBySet';
import { VaultHeatmap } from './VaultHeatmap';
import { SectionLabel } from '../../../components/common/SectionLabel';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { Vault, TrendingUp, TrendingDown, Download, Upload, Trash2, Camera, Search } from 'lucide-react';

interface VaultViewProps {
  onOpenSet?: (setId: string) => void;
}

export const VaultView: React.FC<VaultViewProps> = ({ onOpenSet }) => {
  const [vaultCards, setVaultCards] = useState<VaultCardType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadVaultCards();

    const onVaultUpdated = () => loadVaultCards();
    window.addEventListener('tcg:vault-updated', onVaultUpdated);
    return () => window.removeEventListener('tcg:vault-updated', onVaultUpdated);
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
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-border-subtle border-t-accent"></div>
      </div>
    );
  }

  const gain = stats.profit >= 0;

  return (
    <div className="space-y-8">
      {/* Portfolio header — the numbers are the design */}
      <div className="animate-slide-up">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <SectionLabel>Portfolio</SectionLabel>
            <h1 className="mt-1 text-h1 text-ink-primary">My Vault</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={handleExport} className="btn-secondary" disabled={vaultCards.length === 0}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Export
            </button>
            <button onClick={handleImport} className="btn-secondary">
              <Upload className="h-4 w-4" aria-hidden="true" />
              Import
            </button>
            {vaultCards.length > 0 && (
              <button onClick={handleClearVault} className="btn-destructive">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Clear
              </button>
            )}
          </div>
        </div>

        {vaultCards.length > 0 && (
          <div className="mt-5 flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <p className="text-xs font-medium text-ink-muted">Current value</p>
              <p className="font-mono text-[32px] font-bold leading-tight tabular-nums text-ink-primary">
                {formatCurrency(stats.currentValue)}
              </p>
              <p
                className={`mt-0.5 inline-flex items-center gap-1 text-sm font-semibold tabular-nums ${
                  gain ? 'text-gain' : 'text-loss'
                }`}
              >
                {gain ? (
                  <TrendingUp className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <TrendingDown className="h-4 w-4" aria-hidden="true" />
                )}
                {formatCurrency(stats.profit, { signed: true })} (
                {formatPercent(stats.profitPercentage, { signed: true })}) all time
              </p>
            </div>
            <dl className="flex flex-wrap gap-x-8 gap-y-3 border-l border-border-default pl-8">
              <div>
                <dt className="text-xs font-medium text-ink-muted">Cost basis</dt>
                <dd className="text-lg font-semibold tabular-nums text-ink-secondary">
                  {formatCurrency(stats.totalValue)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-muted">Cards held</dt>
                <dd className="text-lg font-semibold tabular-nums text-ink-secondary">
                  {stats.totalCards}
                  <span className="ml-1 text-xs font-normal text-ink-muted">
                    ({vaultCards.length} entries)
                  </span>
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      {/* Empty State */}
      {vaultCards.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border-strong bg-surface-raised p-12 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-border-default bg-surface-inset">
            <Vault className="h-8 w-8 text-ink-muted" aria-hidden="true" />
          </div>
          <h3 className="mb-2 text-xl font-semibold text-ink-primary">No cards yet</h3>
          <p className="mx-auto mb-6 max-w-md text-sm text-ink-muted">
            Scan or browse to add your first.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/scanner" className="btn-primary">
              <Camera className="h-4 w-4" aria-hidden="true" />
              Scan a card
            </Link>
            <Link to="/browse" className="btn-secondary">
              <Search className="h-4 w-4" aria-hidden="true" />
              Browse cards
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <VaultHeatmap vaultCards={vaultCards} onOpenSet={onOpenSet} />
          <VaultPortfolioBySet vaultCards={vaultCards} onOpenSet={onOpenSet} />
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink-primary">
                Holdings <span className="text-sm font-normal tabular-nums text-ink-muted">({vaultCards.length})</span>
              </h2>
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
        </div>
      )}
    </div>
  );
};
