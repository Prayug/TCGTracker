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
    loading,
    error,
    plan,
    binders,
    constraintOptions,
    listBinders,
    createBinderWithPlan,
    deleteBinder,
    commitToVault,
    commitToWishlist,
    saving,
    fetchConstraints,
    generatePlan,
    clearError,
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="font-display text-h1 text-ink-primary">Binders</h1>
          <p className="text-sm text-ink-secondary">Plan pages like sleeves on the desk</p>
        </div>
        <button onClick={() => setShowPlanner(!showPlanner)} className="btn-primary">
          <Plus className="h-4 w-4" />
          New binder
        </button>
      </div>

      {showPlanner && (
        <div
          className="border border-border-page bg-sleeve/50 p-4 sm:p-5"
          style={{ borderRadius: 'var(--radius-ui)' }}
        >
          <div
            className="felt-chrome mb-4 flex items-center justify-between gap-3 px-3 py-2"
            style={{ borderRadius: 'var(--radius-ui)' }}
          >
            <p className="text-sm font-medium text-felt-ink">Page planner</p>
            <p className="font-mono text-xs text-felt-muted">3×3 slots</p>
          </div>
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
            <div className="mt-6 border-t border-border-page pt-6">
              <BinderPlanReview plan={plan} onSave={handleSavePlan} saving={saving} />
            </div>
          )}
        </div>
      )}

      {loading && !showPlanner && (
        <div className="flex items-center justify-center py-12">
          <div
            className="h-6 w-6 animate-spin border-2 border-sticker border-t-transparent"
            style={{ borderRadius: '9999px' }}
          />
        </div>
      )}

      {binders.length === 0 && !loading && !showPlanner && (
        <div
          className="flex flex-col items-center justify-center border border-dashed border-border-page bg-sleeve/50 py-16 text-center"
          style={{ borderRadius: 'var(--radius-ui)' }}
        >
          <div className="mb-4 flex h-14 w-14 items-center justify-center border border-border-page bg-page">
            <BookOpen className="h-7 w-7 text-sticker" />
          </div>
          <p className="font-display text-base font-semibold text-ink-primary">No binders yet</p>
          <p className="mt-1 text-sm text-ink-muted">Create a binder to plan your next 3×3 page</p>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {binders.map((binder) => (
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
  const filledSlots = binder.slots.filter((s) => s.cardId).length;
  const totalSlots = binder.pages * binder.slotsPerPage;
  const cost = binder.totalCostCents ?? 0;
  const cols = binder.slotsPerPage === 12 ? 4 : 3;

  return (
    <motion.div
      initial={{ opacity: 0, rotateY: -8 }}
      animate={{ opacity: 1, rotateY: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="binder-page overflow-hidden"
      style={{ transformOrigin: 'left center' }}
    >
      <div className="felt-chrome flex items-start justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-sm font-bold text-felt-ink">{binder.name}</h3>
          {binder.themeDescription && (
            <p className="mt-0.5 truncate text-xs text-felt-muted">{binder.themeDescription}</p>
          )}
        </div>
        <button
          onClick={onDelete}
          className="ml-2 shrink-0 p-1 text-felt-muted transition-colors hover:text-loss"
          style={{ borderRadius: 'var(--radius-ui)' }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        className={`grid gap-1.5 p-3`}
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: totalSlots }).map((_, i) => {
          const slot = binder.slots[i];
          const snapshot = slot?.cardSnapshot ? JSON.parse(slot.cardSnapshot) : null;
          return (
            <div
              key={i}
              className={`aspect-[5/7] overflow-hidden ${
                snapshot ? 'sleeve-window' : 'sleeve-slot-empty'
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
                  <span className="text-[10px] text-ink-muted">
                    {snapshot?.cardName?.[0] || ''}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="action-tray flex items-center justify-between px-3 py-2 text-xs text-ink-muted">
        <span className="font-mono">
          {filledSlots}/{totalSlots} slots
        </span>
        {cost > 0 && <span className="stamp-price text-xs">${(cost / 100).toFixed(2)}</span>}
      </div>

      {filledSlots > 0 && (
        <div className="flex gap-1.5 border-t border-border-page px-3 py-2.5">
          <button
            onClick={onCommitToVault}
            className="flex flex-1 items-center justify-center gap-1 bg-sticker/10 px-2 py-1.5 text-[11px] font-semibold text-sticker transition-all hover:bg-sticker/20"
            style={{ borderRadius: 'var(--radius-ui)' }}
          >
            <ShoppingCart className="h-3 w-3" />
            Vault
          </button>
          <button
            onClick={onCommitToWishlist}
            className="flex flex-1 items-center justify-center gap-1 border border-border-page px-2 py-1.5 text-[11px] font-semibold text-ink-secondary transition-all hover:border-foil/50 hover:text-ink-primary"
            style={{ borderRadius: 'var(--radius-ui)' }}
          >
            <Heart className="h-3 w-3" />
            Wishlist
          </button>
        </div>
      )}
    </motion.div>
  );
};
