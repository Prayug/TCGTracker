import React, { useState } from 'react';
import type { BinderPlan } from '../types';
import { CardArt } from '../../../components/exchange/CardArt';
import { Price } from '../../../components/exchange/Price';
import { formatCurrency } from '../../../utils/cardDisplay';

interface BinderPlanReviewProps {
  plan: BinderPlan;
  onSave: (name: string) => Promise<void>;
  saving: boolean;
}

/** The planned page, as it would sit in the binder, with what it costs today. */
export const BinderPlanReview: React.FC<BinderPlanReviewProps> = ({ plan, onSave, saving }) => {
  const [name, setName] = useState('');
  const spent = plan.totalCost / 100;
  const budget = (plan.totalCost + plan.remainingBudget) / 100;
  const hasBudget = plan.remainingBudget > 0 || plan.totalCost > 0;
  const pockets = Math.max(9, plan.totalSlots);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-h2">The plan</h2>
        <span className="font-mono text-[12px] text-ink-muted">
          {plan.filledSlots} of {plan.totalSlots} pockets
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-lg border border-border-default bg-surface-raised p-3">
        {Array.from({ length: pockets }).map((_, i) => {
          const card = plan.slots[i];
          return card ? (
            <figure key={`${card.cardId}-${i}`} className="min-w-0">
              <CardArt
                card={{
                  name: card.cardName,
                  images: {
                    small: card.imageSmall ?? undefined,
                    large: card.imageLarge ?? undefined,
                  },
                  number: card.cardNumber,
                  set: { name: card.setName },
                }}
                flat
              />
              <figcaption className="mt-1 flex items-baseline justify-between gap-1">
                <span
                  className="truncate text-[11.5px]"
                  title={`${card.cardName} · ${card.setName}`}
                >
                  {card.cardName}
                </span>
                <Price
                  value={card.marketPrice}
                  size="sm"
                  className="text-[11.5px]"
                  unavailableLabel="—"
                />
              </figcaption>
            </figure>
          ) : (
            <span
              key={`empty-${i}`}
              className="block aspect-[63/88] rounded-[4.6%/3.3%] border border-dashed border-border-strong bg-surface-inset/60"
              aria-hidden
            />
          );
        })}
      </div>

      {hasBudget ? (
        <div>
          <div className="flex justify-between text-[12.5px]">
            <span className="text-ink-muted">Today’s market cost</span>
            <span className="font-mono tabular-nums">
              {formatCurrency(spent)}
              {budget > spent ? (
                <span className="text-ink-muted"> of {formatCurrency(budget)}</span>
              ) : null}
            </span>
          </div>
          {budget > 0 ? (
            <span
              className="mt-1.5 block h-1.5 overflow-hidden rounded-sm bg-surface-hover"
              aria-hidden
            >
              <span
                className="block h-full bg-ink-primary"
                style={{ width: `${Math.min(100, (spent / budget) * 100)}%` }}
              />
            </span>
          ) : null}
        </div>
      ) : null}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(name.trim() || `Binder · ${new Date().toLocaleDateString()}`).then(() =>
            setName('')
          );
        }}
      >
        <label className="min-w-[12rem] flex-1" htmlFor="binder-name">
          <span className="mb-1 block text-[13px] font-medium">Name</span>
          <input
            id="binder-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Fire and sunset"
            className="input h-10"
          />
        </label>
        <button type="submit" disabled={saving} className="btn-primary h-10">
          {saving ? 'Saving…' : 'Save binder'}
        </button>
      </form>
    </div>
  );
};
