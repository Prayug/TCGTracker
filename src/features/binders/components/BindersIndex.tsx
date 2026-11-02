import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react';
import { BinderPlanner } from './BinderPlanner';
import { BinderPlanReview } from './BinderPlanReview';
import { BinderPages, PagePreview } from './BinderPages';
import { useBinderPlanner } from '../hooks/useBinderPlanner';
import { binderService } from '../services/binderService';
import { useToast } from '../../../components/common/Toast';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { PageHeader, PageShell } from '../../../components/layout/PageShell';
import { Unavailable } from '../../../components/exchange/Price';
import { useAuth } from '../../../hooks/useAuth';
import { formatCurrency } from '../../../utils/cardDisplay';
import type { Binder } from '../types';
import { type Pocket, plannedCost, swapUpdates } from '../binderLayout';

/**
 * Binder library and editor. Albums are shown as objects (cover, spine,
 * first page); opening one shows its pages for rearranging.
 */
export const BindersIndex: React.FC = () => {
  const planner = useBinderPlanner();
  const { binders, listBinders, fetchConstraints } = planner;
  const { showToast } = useToast();
  const { user, openAuthModal } = useAuth();
  const [params, setParams] = useSearchParams();
  const openId = Number(params.get('b')) || null;
  const planning = params.get('new') === '1';
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void listBinders().finally(() => setLoaded(true));
    void fetchConstraints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (patch: Record<string, string | null>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) next.delete(k);
        else next.set(k, v);
      }
      return next;
    });

  const open = binders.find((b) => b.id === openId) ?? null;

  const save = async (name: string) => {
    const saved = await planner.createBinderWithPlan(name);
    if (saved) {
      showToast('Binder saved', 'success');
      go({ new: null, b: String(saved.id) });
    }
  };

  const remove = async () => {
    if (deleteId == null) return;
    if (await planner.deleteBinder(deleteId)) {
      showToast('Binder deleted', 'info');
      if (openId === deleteId) go({ b: null });
    }
    setDeleteId(null);
  };

  return (
    <PageShell wide className="space-y-8">
      {open ? (
        <BinderDetail
          binder={open}
          onBack={() => go({ b: null })}
          onDelete={() => setDeleteId(open.id)}
          onChanged={() => void listBinders()}
          commitToVault={planner.commitToVault}
          commitToWishlist={planner.commitToWishlist}
        />
      ) : (
        <>
          <PageHeader
            title="Binders"
            meta={
              binders.length
                ? `${binders.length} album${binders.length === 1 ? '' : 's'}`
                : undefined
            }
            actions={
              <button
                type="button"
                onClick={() => go({ new: planning ? null : '1' })}
                className={planning ? 'btn-secondary' : 'btn-primary'}
                aria-expanded={planning}
              >
                {planning ? (
                  <X className="h-4 w-4" aria-hidden />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden />
                )}
                {planning ? 'Close planner' : 'Plan a binder'}
              </button>
            }
          />

          {planning ? (
            <section
              aria-label="Binder planner"
              className="grid gap-8 border-b border-rule pb-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
            >
              <BinderPlanner
                loading={planner.loading}
                error={planner.error}
                plan={planner.plan}
                constraintOptions={planner.constraintOptions}
                generatePlan={planner.generatePlan}
                fetchConstraints={planner.fetchConstraints}
                clearError={planner.clearError}
              />
              <div>
                {planner.plan && planner.plan.filledSlots > 0 ? (
                  <BinderPlanReview plan={planner.plan} onSave={save} saving={planner.saving} />
                ) : (
                  <EmptyPagePreview caption="Your plan appears here as a page you can save." />
                )}
                {!user ? (
                  <p className="mt-3 text-[12.5px] text-ink-muted">
                    You can plan as a guest.{' '}
                    <button
                      type="button"
                      onClick={() => openAuthModal('login')}
                      className="text-accent hover:underline"
                    >
                      Sign in
                    </button>{' '}
                    to save binders to your account.
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          {!loaded ? (
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton aspect-[4/5] rounded-md" />
              ))}
            </div>
          ) : binders.length === 0 && !planning ? (
            <section className="grid items-center gap-8 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
              <EmptyPagePreview />
              <div>
                <h2 className="font-display text-[24px] leading-tight">
                  Plan a page before you buy for it
                </h2>
                <p className="mt-2 max-w-[52ch] text-[14px] text-ink-secondary">
                  Describe a theme and a budget. The planner fills nine pockets with real catalog
                  cards at today’s prices, and you can rearrange them, then send the cards to your
                  vault or wishlist.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button type="button" onClick={() => go({ new: '1' })} className="btn-primary">
                    <Plus className="h-4 w-4" aria-hidden />
                    Plan a binder
                  </button>
                  {!user ? (
                    <button
                      type="button"
                      onClick={() => openAuthModal('login')}
                      className="btn-ghost"
                    >
                      Sign in to see saved binders
                    </button>
                  ) : null}
                </div>
              </div>
            </section>
          ) : (
            <ul className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {binders.map((b) => (
                <li key={b.id}>
                  <Album binder={b} onOpen={() => go({ b: String(b.id) })} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <ConfirmDialog
        isOpen={deleteId !== null}
        title="Delete this binder?"
        message="The binder and its pages are removed. Cards already sent to your vault or wishlist stay there."
        confirmLabel="Delete binder"
        variant="destructive"
        onConfirm={() => void remove()}
        onCancel={() => setDeleteId(null)}
      />
    </PageShell>
  );
};

function EmptyPagePreview({ caption }: { caption?: string }) {
  return (
    <figure>
      <div
        className="grid grid-cols-3 gap-2 rounded-lg border border-border-default bg-surface-raised p-3"
        aria-hidden
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <span
            key={i}
            className="block aspect-[63/88] rounded-[4.6%/3.3%] border border-dashed border-border-strong bg-surface-inset/60"
          />
        ))}
      </div>
      {caption ? (
        <figcaption className="mt-2 text-[12.5px] text-ink-muted">{caption}</figcaption>
      ) : null}
    </figure>
  );
}

/** An album as an object: spine, cover with its first page, label. */
function Album({ binder, onOpen }: { binder: Binder; onOpen: () => void }) {
  const filled = binder.slots.filter((s) => s.cardId).length;
  const pages = Math.max(binder.pages, Math.ceil(filled / 9) || 1);
  return (
    <button type="button" onClick={onOpen} className="group block w-full text-left">
      <span className="relative flex rounded-md border border-border-strong bg-surface-raised shadow-[var(--card-shadow)] transition-transform duration-150 motion-safe:group-hover:-translate-y-1">
        <span
          className="w-3 shrink-0 rounded-l-md border-r border-border-strong bg-ink-primary/90"
          aria-hidden
        />
        <span className="block flex-1 p-2.5">
          <PagePreview binder={binder} />
        </span>
      </span>
      <span className="mt-2.5 block truncate text-[14px] font-medium group-hover:underline">
        {binder.name}
      </span>
      <span className="block font-mono text-[11.5px] text-ink-muted">
        {filled} cards · {pages} page{pages === 1 ? '' : 's'}
      </span>
    </button>
  );
}

function BinderDetail({
  binder,
  onBack,
  onDelete,
  onChanged,
  commitToVault,
  commitToWishlist,
}: {
  binder: Binder;
  onBack: () => void;
  onDelete: () => void;
  onChanged: () => void;
  commitToVault: (id: number) => Promise<number>;
  commitToWishlist: (id: number) => Promise<unknown[]>;
}) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const filled = binder.slots.filter((s) => s.cardId).length;
  const cost = plannedCost(binder);

  const onSwap = useCallback(
    async (a: Pocket, b: Pocket): Promise<string | null> => {
      const updates = swapUpdates(a, b);
      if (!updates) return 'Cards can only swap with other cards. That pocket is empty.';
      setBusy(true);
      try {
        for (const u of updates) {
          const { slotId, ...data } = u;
          await binderService.updateSlot(binder.id, slotId, data);
        }
        onChanged();
        return null;
      } catch (e) {
        return `The swap was not saved: ${(e as Error).message}`;
      } finally {
        setBusy(false);
      }
    },
    [binder.id, onChanged]
  );

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All binders
      </button>
      <PageHeader
        title={binder.name}
        meta={`${filled} cards`}
        description={binder.themeDescription ?? undefined}
        actions={
          <>
            <button
              type="button"
              disabled={!filled}
              onClick={async () => {
                const n = await commitToVault(binder.id);
                if (n > 0) showToast(`Added ${n} cards to your vault`, 'success');
              }}
              className="btn-secondary"
            >
              Add all to vault
            </button>
            <button
              type="button"
              disabled={!filled}
              onClick={async () => {
                const cards = await commitToWishlist(binder.id);
                if (cards.length) {
                  showToast(`Added ${cards.length} cards to your wishlist`, 'success');
                  window.dispatchEvent(new CustomEvent('tcg:wishlist-updated'));
                }
              }}
              className="btn-secondary"
            >
              Add all to wishlist
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="btn-ghost text-loss"
              aria-label={`Delete ${binder.name}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </>
        }
      />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <BinderPages binder={binder} onSwap={onSwap} busy={busy} />
        <aside className="space-y-4 text-[13px]">
          <div className="border-t border-rule pt-2.5">
            <p className="text-meta text-ink-muted">Planned cost</p>
            <p className="font-mono text-[22px] font-medium tabular-nums">
              {cost.priced ? formatCurrency(cost.cents / 100) : '—'}
            </p>
            <p className="text-[12px] text-ink-muted">
              Prices saved when the binder was planned
              {cost.priced < filled
                ? `; ${filled - cost.priced} card${filled - cost.priced === 1 ? '' : 's'} had no price`
                : ''}
              . Today’s market may differ.
            </p>
          </div>
          {binder.budgetCents ? (
            <div className="border-t border-rule pt-2.5">
              <p className="text-meta text-ink-muted">Budget</p>
              <p className="font-mono text-[15px] tabular-nums">
                {formatCurrency(binder.budgetCents / 100)}
              </p>
            </div>
          ) : null}
          <div className="border-t border-rule pt-2.5">
            <p className="text-meta text-ink-muted">Created</p>
            <p>
              {new Date(binder.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>
        </aside>
      </div>
      {binder.slots.length === 0 ? (
        <Unavailable title="This binder is empty">
          Plan a new binder to fill its pockets.
        </Unavailable>
      ) : null}
    </div>
  );
}
