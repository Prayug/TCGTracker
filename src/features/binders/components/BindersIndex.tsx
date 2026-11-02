import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react';
import { BinderPlanner } from './BinderPlanner';
import { BinderPlanReview } from './BinderPlanReview';
import { BinderPages, PagePreview, pocketCard } from './BinderPages';
import { BINDER_COVERS, coverFor, setCover } from '../binderCovers';
import { CardSpotlight } from '../../../components/collectible/CardSpotlight';
import { Modal } from '../../../components/common/Modal';
import { CardArt } from '../../../components/exchange/CardArt';
import { useVault } from '../../../hooks/useVault';
import { getCardPrice } from '../../../utils/cardPrice';
import { cn } from '@/lib/utils';
import { useBinderPlanner } from '../hooks/useBinderPlanner';
import { binderService } from '../services/binderService';
import { useToast } from '../../../components/common/Toast';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { PageHeader, PageShell } from '../../../components/layout/PageShell';
import { Unavailable } from '../../../components/exchange/Price';
import { useAuth } from '../../../hooks/useAuth';
import { formatCurrency } from '../../../utils/cardDisplay';
import type { Binder } from '../types';
import { type Pocket, layoutPages, plannedCost, replaceUpdate, swapUpdates } from '../binderLayout';

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
            <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <OpenAlbumPreview />
              <div>
                <h2 className="font-display text-[clamp(1.8rem,3.4vw,2.8rem)] font-semibold leading-[1.02] tracking-[-0.02em]">
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

/** An album as an object: a coloured cover with a label plate that opens a little on hover. */
function Album({ binder, onOpen }: { binder: Binder; onOpen: () => void }) {
  const filled = binder.slots.filter((s) => s.cardId).length;
  const pages = Math.max(binder.pages, Math.ceil(filled / 9) || 1);
  const cover = coverFor(binder.id);
  const first = layoutPages(binder)
    .flat()
    .find((p) => p.card?.imageSmall || p.card?.imageLarge);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full text-left [perspective:1200px]"
    >
      <span className="relative block aspect-[5/7]">
        {/* First page, revealed when the cover swings */}
        <span className="binder-page absolute inset-0 rounded-xl p-3">
          <PagePreview binder={binder} />
        </span>
        <span
          className="binder-shell absolute inset-0 flex origin-left flex-col justify-between rounded-xl p-4 transition-transform duration-500 ease-out [transform-style:preserve-3d] motion-safe:group-hover:[transform:rotateY(-28deg)] motion-safe:group-focus-visible:[transform:rotateY(-28deg)]"
          style={{ background: cover.bg, color: cover.ink }}
        >
          <span aria-hidden className="absolute inset-y-0 left-0 w-4 rounded-l-xl bg-black/25" />
          <span className="relative ml-3 font-mono text-[11px] opacity-75">
            {filled} cards · {pages} page{pages === 1 ? '' : 's'}
          </span>
          {first ? (
            <span className="relative mx-auto w-[46%] rotate-[-4deg] rounded-[6%] bg-black/25 p-[4%] shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)] transition-transform duration-500 group-hover:rotate-0">
              <CardArt card={pocketCard(first)} />
            </span>
          ) : null}
          <span className="relative ml-3 rounded-lg bg-black/20 px-3 py-2 backdrop-blur-sm">
            <span className="block truncate font-display text-[18px] font-semibold leading-tight">
              {binder.name}
            </span>
            {binder.themeDescription ? (
              <span className="mt-0.5 block truncate text-[12px] opacity-75">
                {binder.themeDescription}
              </span>
            ) : null}
          </span>
        </span>
      </span>
    </button>
  );
}

/** An open, empty album: what a binder will look like before the first card goes in. */
function OpenAlbumPreview() {
  return (
    <div
      aria-hidden
      className="binder-shell mx-auto w-full max-w-[40rem] rounded-[22px] p-3"
      style={{ background: BINDER_COVERS[1].bg }}
    >
      <div className="relative grid grid-cols-2">
        {[0, 1].map((side) => (
          <div
            key={side}
            className={cn(
              'binder-page grid grid-cols-3 gap-2.5 p-4',
              side === 0 ? 'rounded-l-xl' : 'rounded-r-xl'
            )}
          >
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className="sleeve sleeve-empty block aspect-[63/88]" />
            ))}
          </div>
        ))}
        <span className="absolute inset-y-0 left-1/2 w-px bg-black/30" />
        {[0.18, 0.5, 0.82].map((t) => (
          <span
            key={t}
            className="binder-ring absolute left-1/2 h-4 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ top: `${t * 100}%` }}
          />
        ))}
      </div>
    </div>
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
  const [zoom, setZoom] = useState<Pocket | null>(null);
  const [replacing, setReplacing] = useState<Pocket | null>(null);
  const [coverId, setCoverId] = useState(() => coverFor(binder.id).id);
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
        <BinderPages
          binder={binder}
          onSwap={onSwap}
          busy={busy}
          onZoom={setZoom}
          onReplace={setReplacing}
        />
        <aside className="space-y-4 text-[13px]">
          <div className="border-t border-rule pt-2.5">
            <p className="text-meta text-ink-muted">Cover</p>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Binder cover">
              {BINDER_COVERS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={coverId === c.id}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => {
                    setCover(binder.id, c.id);
                    setCoverId(c.id);
                  }}
                  className={cn(
                    'h-8 w-8 rounded-full ring-offset-2 ring-offset-[var(--surface-base)] transition-transform active:scale-90',
                    coverId === c.id && 'ring-2 ring-[var(--ink-primary)]'
                  )}
                  style={{ background: c.bg }}
                />
              ))}
            </div>
            <p className="mt-1.5 text-[11.5px] text-ink-muted">Saved in this browser.</p>
          </div>
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
      <CardSpotlight
        card={zoom ? pocketCard(zoom) : null}
        onClose={() => setZoom(null)}
        title={zoom?.card?.cardName ?? 'Card'}
      >
        {zoom ? (
          <p className="text-[13.5px] text-white/70">
            Page {Math.floor(zoom.index / 9) + 1}, pocket {(zoom.index % 9) + 1}
            {zoom.slot?.marketPriceCents
              ? ` · planned at ${formatCurrency(zoom.slot.marketPriceCents / 100)}`
              : ''}
          </p>
        ) : null}
      </CardSpotlight>
      <ReplaceDialog
        pocket={replacing}
        onClose={() => setReplacing(null)}
        onPick={async (card) => {
          const pocket = replacing;
          setReplacing(null);
          if (!pocket) return;
          const u = replaceUpdate(pocket, card);
          if (!u) return;
          setBusy(true);
          try {
            const { slotId, ...data } = u;
            await binderService.updateSlot(binder.id, slotId, data);
            onChanged();
            showToast(`Put ${card.cardName} in the pocket`, 'success');
          } catch (e) {
            showToast(`Not saved: ${(e as Error).message}`, 'error');
          } finally {
            setBusy(false);
          }
        }}
      />
      {binder.slots.length === 0 ? (
        <Unavailable title="This binder is empty">
          Plan a new binder to fill its pockets.
        </Unavailable>
      ) : null}
    </div>
  );
}

/** Choose a card from the vault to put into a filled pocket. */
function ReplaceDialog({
  pocket,
  onClose,
  onPick,
}: {
  pocket: Pocket | null;
  onClose: () => void;
  onPick: (card: Parameters<typeof replaceUpdate>[1]) => void;
}) {
  const { cards } = useVault();
  const [q, setQ] = useState('');
  const list = cards
    .filter((vc) => !q || vc.card.name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 60);
  return (
    <Modal isOpen={pocket != null} onClose={onClose} size="medium" ariaLabel="Replace card">
      <h2 className="text-h2">Put a card from your vault in this pocket</h2>
      <p className="mt-1 text-[13px] text-ink-muted">
        Replaces {pocket?.card?.cardName ?? 'the card'}. The saved price is today’s market estimate.
      </p>
      <label htmlFor="replace-q" className="sr-only">
        Search your vault
      </label>
      <input
        id="replace-q"
        className="input mt-4"
        placeholder="Search your vault"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {list.length === 0 ? (
        <p className="mt-4 text-[13px] text-ink-muted">
          {cards.length ? 'No vault cards match.' : 'Your vault is empty.'}
        </p>
      ) : (
        <ul className="mt-4 grid max-h-[50vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
          {list.map((vc) => (
            <li key={vc.id}>
              <button
                type="button"
                className="block w-full text-left"
                onClick={() =>
                  onPick({
                    cardId: vc.card.id,
                    cardName: vc.card.name,
                    setId: vc.card.set?.id,
                    setName: vc.card.set?.name,
                    cardNumber: vc.card.number,
                    rarity: vc.card.rarity ?? '',
                    imageSmall: vc.card.images?.small ?? null,
                    imageLarge: vc.card.images?.large ?? null,
                    marketPrice: getCardPrice(vc.card) > 0 ? getCardPrice(vc.card) : null,
                  })
                }
              >
                <CardArt card={vc.card} />
                <span className="mt-1 block truncate text-[12.5px]">{vc.card.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
