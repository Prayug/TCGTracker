import React, { useState, useEffect } from 'react';
import { PokemonCard, CardCondition } from '../../../types/pokemon';
import { GradingResult } from '../../../types/grading';
import { vaultService } from '../../../services/vaultService';
import { markOnboardingStep } from '../../../components/common/OnboardingChecklist';
import { Modal } from '../../../components/common/Modal';
import { pokemonApi } from '../../../services/pokemonApi';
import { useToast } from '../../../components/common/Toast';
import { CardArt } from '../../../components/exchange/CardArt';
import { formatCurrency } from '../../../utils/cardDisplay';

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
    // Only prefill a cost the caller actually knows. Market price is shown as
    // a reference, never silently used as the purchase price.
    const pref =
      initialPurchasePrice != null &&
      Number.isFinite(initialPurchasePrice) &&
      initialPurchasePrice >= 0
        ? initialPurchasePrice
        : null;
    setPurchasePrice(pref != null ? pref.toFixed(2) : '');
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
    // Blank = unknown cost. It is stored as unknown, not as today's market price.
    const price = Number.isFinite(raw) && raw >= 0 ? raw : null;

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

  const marketRef = card.marketPrice || pokemonApi.extractCardPrice(card);
  const parsedPrice = purchasePrice.trim() === '' ? NaN : parseFloat(purchasePrice);
  const costKnown = Number.isFinite(parsedPrice) && parsedPrice >= 0;
  const totalCost = costKnown ? parsedPrice * quantity : null;
  const fieldClass = 'input h-10';

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="medium"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-meta text-ink-muted">
            {totalCost != null
              ? `Cost basis ${formatCurrency(totalCost)} for ${quantity}`
              : 'Cost not recorded · excluded from P/L until added'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="btn-ghost"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Adding…' : 'Add to vault'}
            </button>
          </div>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="space-y-5"
      >
        <div className="flex items-start gap-4 border-b border-rule pb-4">
          <div className="w-20 shrink-0">
            <CardArt card={card} />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-[22px] leading-tight">Add to vault</h2>
            <p className="mt-1 truncate text-[14px] font-medium">{card.name}</p>
            <p className="text-meta text-ink-muted">
              {card.set?.name}
              {card.number ? ` · No. ${card.number}` : ''}
              {card.rarity ? ` · ${card.rarity}` : ''}
            </p>
            {marketRef > 0 ? (
              <p className="mt-2 text-meta text-ink-muted">
                Market reference{' '}
                <span className="font-mono text-ink-secondary">{formatCurrency(marketRef)}</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="purchase-price" className="mb-1 block text-[13px] font-medium">
              Price paid per card
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-ink-muted">
                $
              </span>
              <input
                id="purchase-price"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                className={`${fieldClass} pl-7 font-mono`}
                placeholder="Unknown"
                aria-describedby="purchase-price-help"
              />
            </div>
            <p id="purchase-price-help" className="mt-1 text-meta text-ink-muted">
              Leave blank if you don’t know. Enter 0 for a gift or pull.
            </p>
          </div>
          <div>
            <label htmlFor="quantity" className="mb-1 block text-[13px] font-medium">
              Quantity
            </label>
            <input
              id="quantity"
              type="number"
              inputMode="numeric"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              className={`${fieldClass} font-mono`}
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="card-condition" className="mb-1 block text-[13px] font-medium">
            Condition
          </label>
          <select
            id="card-condition"
            value={condition}
            onChange={(e) => setCondition(e.target.value as CardCondition)}
            className={fieldClass}
          >
            <option value="raw">Raw (condition not assessed)</option>
            <option value="near-mint">Near Mint</option>
            <option value="lightly-played">Lightly Played</option>
            <option value="moderately-played">Moderately Played</option>
            <option value="heavily-played">Heavily Played</option>
            <option value="damaged">Damaged</option>
          </select>
        </div>

        <div>
          <label htmlFor="notes" className="mb-1 block text-[13px] font-medium">
            Notes <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="input h-auto resize-none py-2"
            placeholder="Where you bought it, sleeve, binder…"
          />
        </div>
        {gradingResult ? (
          <p className="text-meta text-ink-muted">
            The photo grading estimate will be attached to this holding.
          </p>
        ) : null}
      </form>
    </Modal>
  );
};
