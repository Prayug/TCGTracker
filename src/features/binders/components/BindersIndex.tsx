import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, BookOpen, Trash2, ShoppingCart, Heart } from 'lucide-react';
import { BinderPlanner } from './BinderPlanner';
import { BinderPlanReview } from './BinderPlanReview';
import { useBinderPlanner } from '../hooks/useBinderPlanner';
import { useToast } from '../../../components/common/Toast';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import type { Binder } from '../types';

export const BindersIndex: React.FC = () => {
  const {
    loading, error, plan, binders, constraintOptions,
    listBinders, createBinderWithPlan, deleteBinder,
    commitToVault, commitToWishlist, saving,
    fetchConstraints, generatePlan, clearError,
  } = useBinderPlanner();
  const { showToast } = useToast();
  const [showPlanner, setShowPlanner] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  useEffect(() => {
    listBinders();
    fetchConstraints();
  }, []);

  const handleSavePlan = async (name: string) => {
    const saved = await createBinderWithPlan(name);
    if (saved) {
      setShowPlanner(false);
      showToast('Binder saved!', 'success');
    }
  };

  const handleDelete = async () => {
    if (deleteConfirm === null) return;
    const ok = await deleteBinder(deleteConfirm);
    if (ok) {
      showToast('Binder deleted', 'success');
    }
    setDeleteConfirm(null);
  };

  const handleCommitToVault = async (binderId: number) => {
    const count = await commitToVault(binderId);
    if (count > 0) {
      showToast(`Added ${count} cards to vault!`, 'success');
    }
  };

  const handleCommitToWishlist = async (binderId: number) => {
    const cards = await commitToWishlist(binderId);
    if (cards.length > 0) {
      showToast(`Added ${cards.length} cards to wishlist!`, 'success');
      window.dispatchEvent(new CustomEvent('tcg:wishlist-updated'));
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-foil">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow-accent" aria-hidden />
            Collection
          </p>
          <h1 className="font-display text-h1 text-ink-primary">Binders</h1>
          <p className="text-sm text-ink-secondary">AI-powered binder page planner</p>
        </div>
        <button
          onClick={() => setShowPlanner(!showPlanner)}
          className="btn-primary shadow-glow-accent"
        >
          <Plus className="h-4 w-4" />
          New binder
        </button>
      </div>

      {showPlanner && (
        <div className="rounded-2xl border border-border-default bg-gradient-chrome p-5">
          <BinderPlanner
            loading={loading}
            error={error}
            plan={plan}
            constraintOptions={constraintOptions}
            generatePlan={generatePlan}
            fetchConstraints={fetchConstraints}
            clearError={clearError}
          />

          {plan && plan.filledSlots > 0 && (
            <div className="mt-6 border-t border-border-subtle pt-6">
              <BinderPlanReview
                plan={plan}
                onSave={handleSavePlan}
                saving={saving}
              />
            </div>
          )}
        </div>
      )}

      {loading && !showPlanner && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      )}

      {binders.length === 0 && !loading && !showPlanner && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-foil/30 bg-surface-raised/60 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/40 bg-accent/10 shadow-glow-accent">
            <BookOpen className="h-7 w-7 text-accent" />
          </div>
          <p className="font-display text-base font-semibold text-ink-primary">No binders yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            Create a binder to plan your next 3x3 page
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {binders.map(binder => (
          <BinderCard
            key={binder.id}
            binder={binder}
            onDelete={() => setDeleteConfirm(binder.id)}
            onCommitToVault={() => handleCommitToVault(binder.id)}
            onCommitToWishlist={() => handleCommitToWishlist(binder.id)}
          />
        ))}
      </div>

      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        title="Delete Binder?"
        message="This will permanently remove this binder and all its slots."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
};

interface BinderCardProps {
  binder: Binder;
  onDelete: () => void;
  onCommitToVault: () => void;
  onCommitToWishlist: () => void;
}

const BinderCard: React.FC<BinderCardProps> = ({
  binder,
  onDelete,
  onCommitToVault,
  onCommitToWishlist,
}) => {
  const filledSlots = binder.slots.filter(s => s.cardId).length;
  const totalSlots = binder.pages * binder.slotsPerPage;
  const cost = binder.totalCostCents ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border-default bg-gradient-chrome p-4 transition-all hover:border-accent/30 hover:shadow-glow-accent"
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-ink-primary">{binder.name}</h3>
          {binder.themeDescription && (
            <p className="mt-0.5 truncate text-xs text-ink-muted">{binder.themeDescription}</p>
          )}
        </div>
        <button
          onClick={onDelete}
          className="ml-2 shrink-0 rounded p-1 text-ink-muted transition-colors hover:bg-surface-hover hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mb-3 grid grid-cols-4 gap-1">
        {Array.from({ length: totalSlots }).map((_, i) => {
          const slot = binder.slots[i];
          const snapshot = slot?.cardSnapshot ? JSON.parse(slot.cardSnapshot) : null;
          return (
            <div
              key={i}
              className={`aspect-[5/7] rounded border ${
                snapshot
                  ? 'border-border-default overflow-hidden'
                  : 'border-dashed border-border-subtle bg-surface-inset'
              }`}
            >
              {snapshot?.imageSmall ? (
                <img
                  src={snapshot.imageSmall}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <span className="text-xs text-ink-muted">{snapshot?.cardName?.[0] || '?'}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>{filledSlots}/{totalSlots} slots</span>
        {cost > 0 && <span>${(cost / 100).toFixed(2)}</span>}
      </div>

      {filledSlots > 0 && (
        <div className="mt-3 flex gap-1.5">
          <button
            onClick={onCommitToVault}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent/10 px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-accent transition-all hover:bg-accent/20"
          >
            <ShoppingCart className="h-3 w-3" />
            Vault
          </button>
          <button
            onClick={onCommitToWishlist}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border-default px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-secondary transition-all hover:border-accent/50 hover:text-accent"
          >
            <Heart className="h-3 w-3" />
            Wishlist
          </button>
        </div>
      )}
    </motion.div>
  );
};
