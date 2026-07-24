import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Save, RefreshCw, DollarSign } from 'lucide-react';
import type { BinderPlan } from '../types';
import { BinderSlotCard } from './BinderSlotCard';

interface BinderPlanReviewProps {
  plan: BinderPlan;
  onSave: (name: string) => Promise<void>;
  saving: boolean;
  onRefresh?: () => void;
  onBinderSaved?: () => void;
}

export const BinderPlanReview: React.FC<BinderPlanReviewProps> = ({
  plan,
  onSave,
  saving,
  onRefresh,
  onBinderSaved,
}) => {
  const [showNameInput, setShowNameInput] = useState(false);
  const [name, setName] = useState('');

  const handleSave = async () => {
    const binderName = name.trim() || `Binder - ${new Date().toLocaleDateString()}`;
    await onSave(binderName);
    setShowNameInput(false);
    setName('');
    onBinderSaved?.();
  };

  const totalCostDollars = plan.totalCost / 100;
  const remainingDollars = plan.remainingBudget / 100;
  const hasBudget = plan.totalCost > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-ink-secondary">
          Your Binder Plan
        </h3>
        <span className="text-xs text-ink-muted">
          {plan.filledSlots}/{plan.totalSlots} slots filled
        </span>
      </div>

      {hasBudget && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-ink-secondary">
              <DollarSign className="h-3.5 w-3.5 text-accent" />
              Budget
            </span>
            <span className="font-semibold text-ink-primary">
              ${(totalCostDollars + remainingDollars).toFixed(2)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-inset">
            <motion.div
              initial={{ width: 0 }}
              animate={{
                width: `${(totalCostDollars / (totalCostDollars + remainingDollars)) * 100}%`,
              }}
              className="h-full rounded-full bg-accent transition-all"
            />
          </div>
          <div className="flex justify-between text-xs text-ink-muted">
            <span>Spent: ${totalCostDollars.toFixed(2)}</span>
            <span>Remaining: ${remainingDollars.toFixed(2)}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {plan.slots.map((card, i) => (
          <BinderSlotCard
            key={`${card.cardId}-${i}`}
            imageUrl={card.imageSmall}
            cardName={card.cardName}
            rarity={card.rarity}
            price={card.marketPrice ? Math.round(card.marketPrice * 100) : null}
          />
        ))}
        {Array.from({ length: Math.max(0, plan.totalSlots - plan.slots.length) }).map((_, i) => (
          <BinderSlotCard key={`empty-${i}`} empty />
        ))}
      </div>

      {plan.filledSlots > 0 && (
        <div className="flex flex-wrap gap-2">
          {!showNameInput ? (
            <button
              onClick={() => setShowNameInput(true)}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold uppercase tracking-wider text-black transition-all hover:brightness-110 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Save Binder
            </button>
          ) : (
            <div className="flex w-full items-center gap-2">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="My Awesome Binder"
                className="flex-1 rounded-lg border border-border-default bg-surface-inset px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                autoFocus
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold uppercase tracking-wider text-black transition-all hover:brightness-110 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="flex items-center gap-2 rounded-lg border border-border-default bg-surface-raised px-4 py-2 text-sm font-semibold text-ink-secondary transition-all hover:border-accent/50 hover:text-ink-primary"
            >
              <RefreshCw className="h-4 w-4" />
              Re-roll
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
};
