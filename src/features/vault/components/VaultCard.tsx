import React, { useState } from 'react';
import { VaultCard as VaultCardType } from '../../../types/pokemon';
import { TrendingUp, TrendingDown, Trash2, Edit, Package } from 'lucide-react';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { vaultService } from '../../../services/vaultService';

interface VaultCardProps {
  vaultCard: VaultCardType;
  onRemove: (id: string) => void;
  onUpdate: () => void;
}

export const VaultCard: React.FC<VaultCardProps> = ({ vaultCard, onRemove, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editQuantity, setEditQuantity] = useState(vaultCard.quantity);
  const [editNotes, setEditNotes] = useState(vaultCard.notes || '');
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const { card, purchasePrice, purchaseDate, quantity, condition, notes } = vaultCard;
  const currentPrice = card.marketPrice || 0;
  const totalPurchaseValue = purchasePrice * quantity;
  const totalCurrentValue = currentPrice * quantity;
  const profit = totalCurrentValue - totalPurchaseValue;
  const profitPercentage = totalPurchaseValue > 0 ? (profit / totalPurchaseValue) * 100 : 0;

  const handleSaveEdit = () => {
    vaultService.updateVaultCard(vaultCard.id, {
      quantity: editQuantity,
      notes: editNotes
    });
    setIsEditing(false);
    onUpdate();
  };

  const formatDate = (isoDate: string) => {
    return new Date(isoDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getConditionBadgeColor = (cond: string) => {
    switch (cond) {
      case 'raw':
      case 'near-mint':
        return 'bg-green-500/10 text-green-300';
      case 'lightly-played':
        return 'bg-blue-500/10 text-blue-300';
      case 'moderately-played':
        return 'bg-yellow-500/10 text-yellow-300';
      case 'heavily-played':
        return 'bg-orange-500/10 text-orange-300';
      case 'damaged':
        return 'bg-red-500/10 text-red-300';
      default:
        return 'bg-white/10 text-ink-secondary';
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-inset shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-elevated">
      <div className="flex flex-col md:flex-row">
        {/* Card Image */}
        <div className="md:w-48 flex-shrink-0 bg-gradient-to-br from-white/[0.02] to-white/[0.06] p-4">
          {card.images?.small || card.images?.large ? (
            <img
              src={card.images.small || card.images.large}
              alt={card.name}
              className="w-full h-auto rounded-lg shadow-md hover:scale-105 transition-transform duration-300"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (target.src !== card.images.large && card.images.large) {
                  target.src = card.images.large;
                } else {
                  target.remove();
                }
              }}
            />
          ) : (
            <div className="flex aspect-[63/88] items-center justify-center rounded-lg border border-border-subtle text-xs text-ink-muted">
              No image
            </div>
          )}
          <div className="mt-2 flex items-center justify-center gap-1 text-xs text-ink-muted">
            <Package className="w-3 h-3" />
            <span>{quantity}x owned</span>
          </div>
        </div>

        {/* Card Details */}
        <div className="flex-1 p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-xl font-bold text-white mb-1">{card.name}</h3>
              <p className="text-sm text-ink-muted">
                {card.set.name} • #{card.number}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getConditionBadgeColor(condition)}`}>
                  {condition.replace('-', ' ')}
                </span>
                {card.rarity && (
                  <span className="px-2 py-1 bg-purple-500/10 text-purple-300 rounded-full text-xs font-semibold">
                    {card.rarity}
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="p-2 hover:bg-blue-500/10 rounded-lg transition-colors text-blue-400"
                title="Edit"
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowRemoveConfirm(true)}
                className="p-2 hover:bg-red-500/10 rounded-lg transition-colors text-red-400"
                title="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Edit Mode */}
          {isEditing && (
            <div className="mb-4 p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <label htmlFor="vault-card-qty" className="block text-sm font-medium text-ink-secondary mb-1">Quantity</label>
                  <input
                    id="vault-card-qty"
                    type="number"
                    min="1"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-border-subtle bg-surface-hover rounded-lg text-white focus:ring-2 focus:ring-accent focus:border-accent"
                    aria-label="Card quantity"
                  />
                </div>
              </div>
              <div className="mb-3">
                <label htmlFor="vault-card-notes" className="block text-sm font-medium text-ink-secondary mb-1">Notes</label>
                <textarea
                  id="vault-card-notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-border-subtle bg-surface-hover rounded-lg text-white focus:ring-2 focus:ring-accent focus:border-accent"
                    placeholder="Add notes about this card..."
                    aria-label="Card notes"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveEdit}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditQuantity(quantity);
                    setEditNotes(notes || '');
                  }}
                  className="px-4 py-2 bg-white/10 text-ink-secondary rounded-lg hover:bg-white/20 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Price Information */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-ink-muted mb-1">Purchase Price</p>
              <p className="text-lg font-bold text-white">${purchasePrice.toFixed(2)}</p>
              <p className="text-xs text-ink-muted">per card</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted mb-1">Current Price</p>
              <p className="text-lg font-bold text-white">${currentPrice.toFixed(2)}</p>
              <p className="text-xs text-ink-muted">per card</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted mb-1">Total Paid</p>
              <p className="text-lg font-bold text-blue-400">${totalPurchaseValue.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted mb-1">Current Value</p>
              <p className="text-lg font-bold text-purple-400">${totalCurrentValue.toFixed(2)}</p>
            </div>
          </div>

          {/* Profit/Loss */}
          <div className={`p-4 rounded-lg ${profit >= 0 ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {profit >= 0 ? (
                  <TrendingUp className="w-5 h-5 text-green-400" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-400" />
                )}
                <span className="font-semibold text-ink-secondary">
                  {profit >= 0 ? 'Profit' : 'Loss'}
                </span>
              </div>
              <div className="text-right">
                <p className={`text-xl font-bold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
                </p>
                <p className={`text-sm font-medium ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {profitPercentage >= 0 ? '+' : ''}{profitPercentage.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          {/* Purchase Date & Notes */}
          <div className="mt-4 pt-4 border-t border-border-subtle">
            <p className="text-xs text-ink-muted">
              Purchased on {formatDate(purchaseDate)}
            </p>
            {notes && !isEditing && (
              <p className="text-sm text-ink-muted mt-2 italic">"{notes}"</p>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showRemoveConfirm}
        onConfirm={() => { onRemove(vaultCard.id); setShowRemoveConfirm(false); }}
        onCancel={() => setShowRemoveConfirm(false)}
        title={`Remove ${card.name}?`}
        message={`Remove ${card.name} from your vault? This action can be undone by re-adding the card.`}
        confirmLabel="Remove"
        variant="destructive"
      />
    </div>
  );
};
