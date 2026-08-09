import React, { useState, useEffect } from 'react';
import { PokemonCard, CardCondition } from '../../../types/pokemon';
import { GradingResult } from '../../../types/grading';
import { vaultService } from '../../../services/vaultService';
import { markOnboardingStep } from '../../../components/common/OnboardingChecklist';
import { Modal } from '../../../components/common/Modal';
import { Vault, DollarSign, Package, FileText } from 'lucide-react';
import { pokemonApi } from '../../../services/pokemonApi';
import { useToast } from '../../../components/common/Toast';

interface AddToVaultModalProps {
  card: PokemonCard | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  game?: 'pokemon' | 'onepiece';
  /** Prefill condition when opening (e.g. from AI grading). */
  initialCondition?: CardCondition;
  /** Prefill notes when opening. */
  initialNotes?: string;
  /** Prefill purchase price; falls back to market when omitted. */
  initialPurchasePrice?: number;
  /** Attach AI grading result to the vault entry on save. */
  gradingResult?: GradingResult;
}

export const AddToVaultModal: React.FC<AddToVaultModalProps> = ({
  card,
  isOpen,
  onClose,
  onSuccess,
  game = 'pokemon',
  initialCondition,
  initialNotes,
  initialPurchasePrice,
  gradingResult,
}) => {
  const [purchasePrice, setPurchasePrice] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState<CardCondition>('raw');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!isOpen || !card) return;

    const marketPrice = card.marketPrice || pokemonApi.extractCardPrice(card);
    const pref =
      initialPurchasePrice != null &&
      Number.isFinite(initialPurchasePrice) &&
      initialPurchasePrice >= 0
        ? initialPurchasePrice
        : marketPrice;
    setPurchasePrice(pref > 0 ? pref.toFixed(2) : '');
    setQuantity(1);
    setCondition(initialCondition ?? 'raw');
    setNotes(initialNotes ?? '');
  }, [isOpen, card, initialCondition, initialNotes, initialPurchasePrice]);

  const resetForm = () => {
    setPurchasePrice('');
    setQuantity(1);
    setCondition('raw');
    setNotes('');
  };

  const handleSubmit = () => {
    if (!card) return;

    const raw = purchasePrice.trim() === '' ? NaN : parseFloat(purchasePrice);
    const price = Number.isFinite(raw) && raw >= 0 ? raw : 0;

    if (quantity < 1) {
      showToast('Quantity must be at least 1', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      const entry = vaultService.addToVault(
        card,
        price,
        quantity,
        condition,
        notes || undefined,
        game
      );
      if (gradingResult) {
        vaultService.updateVaultCard(entry.id, { gradingResult }, game);
      }
      markOnboardingStep('vault');

      showToast(`Added ${quantity}x ${card.name} to your vault!`, 'success');

      resetForm();

      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      showToast('Error adding card to vault. Please try again.', 'error');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!card) return null;

  const marketFallback = card.marketPrice || pokemonApi.extractCardPrice(card);
  const parsedPrice = purchasePrice.trim() === '' ? NaN : parseFloat(purchasePrice);
  const effectiveUnit =
    Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : marketFallback;
  const totalCost = effectiveUnit * quantity;
  const usingMarketDefault = !(Number.isFinite(parsedPrice) && parsedPrice > 0);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} variant="slab" size="medium">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl shadow-lg">
            <Vault className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-ink-primary">Add to Vault</h2>
            <p className="text-sm text-ink-muted">Store this card in your collection</p>
          </div>
        </div>

        <div className="bg-surface-inset rounded-xl p-4 mb-6 flex items-center gap-4">
          <img
            src={card.images.small}
            alt={card.name}
            className="w-24 h-auto rounded-lg shadow-md"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (target.src !== card.images.large) {
                target.src = card.images.large;
              }
            }}
          />
          <div className="flex-1">
            <h3 className="font-bold text-lg text-ink-primary">{card.name}</h3>
            <p className="text-sm text-ink-muted">{card.set.name} &bull; #{card.number}</p>
            {card.rarity && (
              <span className="inline-block mt-2 px-2 py-1 bg-accent-muted text-accent rounded-full text-xs font-semibold">
                {card.rarity}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="purchase-price" className="flex items-center gap-2 text-sm font-semibold text-ink-secondary mb-2">
                <DollarSign className="w-4 h-4" />
                Purchase Price (per card)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted font-medium">$</span>
                <input
                  id="purchase-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  className="w-full pl-8 pr-4 py-3 border-2 border-border-default rounded-xl bg-surface-inset text-ink-primary focus:ring-2 focus:ring-accent focus:border-accent transition-colors font-medium"
                  placeholder={marketFallback > 0 ? marketFallback.toFixed(2) : '0.00'}
                />
              </div>
              <p className="mt-1.5 text-xs text-ink-muted">Defaults to market if left blank</p>
            </div>

            <div>
              <label htmlFor="quantity" className="flex items-center gap-2 text-sm font-semibold text-ink-secondary mb-2">
                <Package className="w-4 h-4" />
                Quantity
              </label>
              <input
                id="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className="w-full px-4 py-3 border-2 border-border-default rounded-xl bg-surface-inset text-ink-primary focus:ring-2 focus:ring-accent focus:border-accent transition-colors font-medium"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="card-condition" className="block text-sm font-semibold text-ink-secondary mb-2">
              Card Condition
            </label>
            <select
              id="card-condition"
              value={condition}
              onChange={(e) => setCondition(e.target.value as CardCondition)}
              className="w-full px-4 py-3 border-2 border-border-default rounded-xl bg-surface-inset text-ink-primary focus:ring-2 focus:ring-accent focus:border-accent transition-colors font-medium"
            >
              <option value="raw">Raw (Ungraded)</option>
              <option value="near-mint">Near Mint</option>
              <option value="lightly-played">Lightly Played</option>
              <option value="moderately-played">Moderately Played</option>
              <option value="heavily-played">Heavily Played</option>
              <option value="damaged">Damaged</option>
            </select>
          </div>

          <div>
            <label htmlFor="notes" className="flex items-center gap-2 text-sm font-semibold text-ink-secondary mb-2">
              <FileText className="w-4 h-4" />
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 border-2 border-border-default rounded-xl bg-surface-inset text-ink-primary focus:ring-2 focus:ring-accent focus:border-accent transition-colors resize-none"
              placeholder="Add notes about this purchase..."
            />
          </div>

          {totalCost > 0 && (
            <div className="bg-accent-muted border-2 border-accent/20 rounded-xl p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-ink-primary">
                  {usingMarketDefault ? 'Cost at market' : 'Total Cost'}
                </span>
                <span className="text-2xl font-bold tabular-nums text-accent">
                  ${totalCost.toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-ink-muted mt-1">
                {quantity}x cards @ ${effectiveUnit.toFixed(2)} each
                {usingMarketDefault ? ' (market default)' : ''}
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-border-default">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-6 py-3 bg-surface-inset hover:bg-surface-hover text-ink-primary font-semibold rounded-xl transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Adding...' : 'Add to Vault'}
            </button>
          </div>
        </div>

        <div className="mt-6 p-4 bg-accent-muted border border-accent/20 rounded-xl">
          <p className="text-xs text-ink-muted">
            Your vault is stored locally in your browser. Use the Export feature in the Vault view to backup your collection.
          </p>
        </div>
      </div>
    </Modal>
  );
};
