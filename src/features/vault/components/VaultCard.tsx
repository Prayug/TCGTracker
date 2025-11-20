import React, { useState } from 'react';
import { VaultCard as VaultCardType } from '../../../types/pokemon';
import { TrendingUp, TrendingDown, Trash2, Edit, Package } from 'lucide-react';
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
        return 'bg-green-100 text-green-800';
      case 'lightly-played':
        return 'bg-blue-100 text-blue-800';
      case 'moderately-played':
        return 'bg-yellow-100 text-yellow-800';
      case 'heavily-played':
        return 'bg-orange-100 text-orange-800';
      case 'damaged':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300 border border-gray-200">
      <div className="flex flex-col md:flex-row">
        {/* Card Image */}
        <div className="md:w-48 flex-shrink-0 bg-gradient-to-br from-gray-50 to-gray-100 p-4">
          <img
            src={card.images.small}
            alt={card.name}
            className="w-full h-auto rounded-lg shadow-md hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              // Fallback to large image if small image fails
              const target = e.target as HTMLImageElement;
              if (target.src !== card.images.large && card.images.large) {
                target.src = card.images.large;
              } else if (!target.src.startsWith('data:')) {
                // Create a simple placeholder
                target.src = `data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="245" height="342" viewBox="0 0 245 342"%3E%3Crect width="245" height="342" fill="%23f3f4f6" rx="12"/%3E%3Ctext x="50%25" y="50%25" font-family="Arial,sans-serif" font-size="14" fill="%239ca3af" text-anchor="middle"%3E${encodeURIComponent(card.name)}%3C/text%3E%3C/svg%3E`;
              }
            }}
          />
          <div className="mt-2 flex items-center justify-center gap-1 text-xs text-gray-600">
            <Package className="w-3 h-3" />
            <span>{quantity}x owned</span>
          </div>
        </div>

        {/* Card Details */}
        <div className="flex-1 p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">{card.name}</h3>
              <p className="text-sm text-gray-600">
                {card.set.name} • #{card.number}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getConditionBadgeColor(condition)}`}>
                  {condition.replace('-', ' ')}
                </span>
                {card.rarity && (
                  <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-semibold">
                    {card.rarity}
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="p-2 hover:bg-blue-50 rounded-lg transition-colors text-blue-600"
                title="Edit"
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`Remove ${card.name} from vault?`)) {
                    onRemove(vaultCard.id);
                  }
                }}
                className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-600"
                title="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Edit Mode */}
          {isEditing && (
            <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Add notes about this card..."
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
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Price Information */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Purchase Price</p>
              <p className="text-lg font-bold text-gray-900">${purchasePrice.toFixed(2)}</p>
              <p className="text-xs text-gray-400">per card</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Current Price</p>
              <p className="text-lg font-bold text-gray-900">${currentPrice.toFixed(2)}</p>
              <p className="text-xs text-gray-400">per card</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Total Paid</p>
              <p className="text-lg font-bold text-blue-600">${totalPurchaseValue.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Current Value</p>
              <p className="text-lg font-bold text-purple-600">${totalCurrentValue.toFixed(2)}</p>
            </div>
          </div>

          {/* Profit/Loss */}
          <div className={`p-4 rounded-lg ${profit >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {profit >= 0 ? (
                  <TrendingUp className="w-5 h-5 text-green-600" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-600" />
                )}
                <span className="font-semibold text-gray-700">
                  {profit >= 0 ? 'Profit' : 'Loss'}
                </span>
              </div>
              <div className="text-right">
                <p className={`text-xl font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
                </p>
                <p className={`text-sm font-medium ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {profitPercentage >= 0 ? '+' : ''}{profitPercentage.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          {/* Purchase Date & Notes */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              Purchased on {formatDate(purchaseDate)}
            </p>
            {notes && !isEditing && (
              <p className="text-sm text-gray-700 mt-2 italic">"{notes}"</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

