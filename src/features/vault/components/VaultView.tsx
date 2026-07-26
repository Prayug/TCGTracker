import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { VaultCard as VaultCardType } from '../../../types/pokemon';
import { vaultService } from '../../../services/vaultService';
import { useGame } from '../../../contexts/GameContext';
import { VaultCard } from './VaultCard';
import { VaultPortfolioBySet } from './VaultPortfolioBySet';
import { VaultHeatmap } from './VaultHeatmap';
import { VaultPerformanceReport } from './VaultPerformanceReport';
import { SectionLabel } from '../../../components/common/SectionLabel';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import { CountUp } from '../../../components/common/CountUp';
import { Vault, TrendingUp, TrendingDown, Download, Upload, Trash2, Camera, Search } from 'lucide-react';

interface VaultViewProps {
  onOpenSet?: (setId: string) => void;
}

export const VaultView: React.FC<VaultViewProps> = ({ onOpenSet }) => {
  const { game, isPokemon } = useGame();
  const { showToast } = useToast();
  const [vaultCards, setVaultCards] = useState<VaultCardType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const loadVaultCards = useCallback(() => {
    setIsLoading(true);
    const cards = vaultService.getVaultCards(game);
    setVaultCards(cards);
    setIsLoading(false);
  }, [game]);

  useEffect(() => {
    loadVaultCards();

    const onVaultUpdated = () => loadVaultCards();
    window.addEventListener('tcg:vault-updated', onVaultUpdated);
    return () => window.removeEventListener('tcg:vault-updated', onVaultUpdated);
  }, [loadVaultCards]);

  const handleRemoveCard = (id: string) => {
    vaultService.removeFromVault(id, game);
    loadVaultCards();
  };

  const handleExport = () => {
    const data = vaultService.exportVault(game);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tcg-vault-${game}-${new Date().toISOString().split('T')[0]}.json`;
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
            vaultService.importVault(content, game);
            loadVaultCards();
            showToast('Vault imported successfully!', 'success');
          } catch {
            showToast('Error importing vault: Invalid file format', 'error');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleClearVault = () => {
    setShowClearConfirm(true);
  };

  const handleClearConfirm = () => {
    vaultService.clearVault(game);
    loadVaultCards();
    setShowClearConfirm(false);
    showToast('Vault cleared successfully', 'info');
  };

  const stats = vaultService.getVaultStats(game);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" role="status" aria-live="polite">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-border-subtle border-t-accent"></div>
      </div>
    );
  }

  const gain = stats.profit >= 0;
  const gameLabel = isPokemon ? 'Pokemon' : 'One Piece';

  return (
    <>
      {/* Portfolio header — the numbers are the design */}
      <div className="animate-slide-up">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <SectionLabel>Portfolio</SectionLabel>
            <h1 className="mt-1 text-h1 text-ink-primary">My {gameLabel} Vault</h1>
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
              <p className="text-gradient font-mono text-[32px] font-bold leading-tight tabular-nums">
                <CountUp end={stats.currentValue} prefix="$" decimals={2} />
              </p>
              <motion.p
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className={`mt-0.5 inline-flex items-center gap-1 text-sm font-semibold tabular-nums ${
                  gain ? 'text-gain' : 'text-loss'
                }`}
              >
                {gain ? (
                  <TrendingUp className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <TrendingDown className="h-4 w-4" aria-hidden="true" />
                )}
                {stats.profit >= 0 ? '+' : ''}
                <CountUp end={Math.abs(stats.profit)} prefix="$" decimals={2} />
                {' ('}
                {stats.profitPercentage >= 0 ? '+' : ''}
                {stats.profitPercentage.toFixed(1)}%) all time
              </motion.p>
            </div>
            <dl className="flex flex-wrap gap-x-8 gap-y-3 border-l border-border-default pl-8">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.35 }}
              >
                <dt className="text-xs font-medium text-ink-muted">Cost basis</dt>
                <dd className="text-lg font-semibold tabular-nums text-ink-secondary">
                  <CountUp end={stats.totalValue} prefix="$" decimals={2} />
                </dd>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.35 }}
              >
                <dt className="text-xs font-medium text-ink-muted">Cards held</dt>
                <dd className="text-lg font-semibold tabular-nums text-ink-secondary">
                  <CountUp end={stats.totalCards} />
                  <span className="ml-1 text-xs font-normal text-ink-muted">
                    ({vaultCards.length} entries)
                  </span>
                </dd>
              </motion.div>
            </dl>
          </div>
        )}
      </div>

      {/* Empty State */}
      {vaultCards.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="card-glass-scene mt-6 flex flex-col items-center p-16 text-center"
        >
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-accent/25 bg-accent-muted shadow-[0_0_24px_rgba(168,132,26,0.15)]">
            <Vault className="h-10 w-10 text-accent" aria-hidden="true" />
          </div>
          <h3 className="mb-2 text-2xl font-display font-bold text-ink-primary">Your vault is empty</h3>
          <p className="mx-auto mb-8 max-w-sm text-sm text-ink-muted">
            {isPokemon
              ? 'Scan your first card or browse the marketplace to start building your collection.'
              : 'Browse One Piece cards to add your first entry.'}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {isPokemon && (
              <Link to="/scanner" className="btn-primary gap-3 px-6 py-3 text-base">
                <Camera className="h-5 w-5" aria-hidden="true" />
                Scan a card
              </Link>
            )}
            <Link to="/browse" className="btn-primary gap-3 px-6 py-3 text-base">
              <Search className="h-5 w-5" aria-hidden="true" />
              Browse {gameLabel} cards
            </Link>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-8">
          <VaultPerformanceReport vaultCards={vaultCards} />
          {isPokemon && (
            <>
              <VaultHeatmap vaultCards={vaultCards} onOpenSet={onOpenSet} />
              <VaultPortfolioBySet vaultCards={vaultCards} onOpenSet={onOpenSet} />
            </>
          )}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink-primary">
                Holdings <span className="text-sm font-normal tabular-nums text-ink-muted">({vaultCards.length})</span>
              </h2>
            </div>
            <div className="stagger-children space-y-4">
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

      <ConfirmDialog
        isOpen={showClearConfirm}
        onConfirm={handleClearConfirm}
        onCancel={() => setShowClearConfirm(false)}
        title="Clear vault?"
        message="Are you sure you want to clear your entire vault? This cannot be undone!"
        confirmLabel="Clear vault"
        variant="destructive"
      />
    </>
  );
};
