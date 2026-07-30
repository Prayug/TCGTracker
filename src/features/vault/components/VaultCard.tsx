import React, { useEffect, useRef, useState } from 'react';
import { VaultCard as VaultCardType } from '../../../types/pokemon';
import { Trash2, MoreHorizontal, Pencil } from 'lucide-react';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { vaultService } from '../../../services/vaultService';
import { GradeBadge } from '../../grading/components/GradeBadge';
import { proxyImageUrl, formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { hasUsableCardImage, withResolvedCardImages } from '../../../utils/tcgPlayerImages';
import {
  effectiveCostBasis,
  holdingMarketValue,
  holdingProfit,
  isAssumedCost,
} from '../../../utils/vaultCost';
import { cn } from '@/lib/utils';

interface VaultCardProps {
  vaultCard: VaultCardType;
  onRemove: (id: string) => void;
  onUpdate: () => void;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  forceEdit?: boolean;
  onEditHandled?: () => void;
  view?: 'table' | 'grid';
}

function isSystemNote(notes?: string): boolean {
  if (!notes) return false;
  const n = notes.toLowerCase();
  return (
    n.includes('imported from') ||
    n.includes('csv condition') ||
    n.includes('valued at') ||
    n.startsWith('import')
  );
}

function shortCondition(condition: string): string {
  const map: Record<string, string> = {
    raw: 'Raw',
    'near-mint': 'NM',
    'lightly-played': 'LP',
    'moderately-played': 'MP',
    'heavily-played': 'HP',
    damaged: 'DMG',
  };
  return map[condition] ?? condition.replace(/-/g, ' ');
}

function displayCardName(name: string, number?: string): string {
  if (!number) return name;
  const trimmed = name
    .replace(new RegExp(`\\s*[-–]\\s*${number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/\\d+)?\\s*$`, 'i'), '')
    .trim();
  return trimmed || name;
}

export const VaultCard: React.FC<VaultCardProps> = ({
  vaultCard,
  onRemove,
  onUpdate,
  selected = false,
  onToggleSelect,
  forceEdit,
  onEditHandled,
  view = 'table',
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editQuantity, setEditQuantity] = useState(vaultCard.quantity);
  const [editPurchasePrice, setEditPurchasePrice] = useState(String(vaultCard.purchasePrice));
  const [editNotes, setEditNotes] = useState(vaultCard.notes || '');
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const { card: rawCard, purchaseDate, quantity, condition, notes, gradingResult } = vaultCard;
  const card = withResolvedCardImages(rawCard);
  const assumed = isAssumedCost(vaultCard);
  const totalPurchaseValue = effectiveCostBasis(vaultCard);
  const totalCurrentValue = holdingMarketValue(vaultCard);
  const { profit, profitPct } = holdingProfit(vaultCard);

  const rawImage = hasUsableCardImage(card.images)
    ? card.images.small?.trim() || card.images.large?.trim()
    : undefined;
  const imageSrc = !imgFailed ? proxyImageUrl(rawImage) || rawImage : undefined;
  const userNotes = notes && !isSystemNote(notes) ? notes : '';
  const title = displayCardName(card.name, card.number);
  const cond = shortCondition(condition);

  useEffect(() => {
    if (forceEdit) {
      setIsEditing(true);
      onEditHandled?.();
      rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [forceEdit, onEditHandled]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const handleSaveEdit = () => {
    const nextPrice = parseFloat(editPurchasePrice);
    vaultService.updateVaultCard(vaultCard.id, {
      quantity: editQuantity,
      notes: editNotes,
      ...(Number.isFinite(nextPrice) && nextPrice >= 0 ? { purchasePrice: nextPrice } : {}),
    });
    setIsEditing(false);
    onUpdate();
  };

  const purchasedLabel = new Date(purchaseDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  if (view === 'grid') {
    return (
      <>
        <article
          ref={rowRef}
          className="group relative overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised transition-colors hover:bg-surface-hover/40"
        >
          <button
            type="button"
            className="absolute left-2 top-2 z-10"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(vaultCard.id);
            }}
            aria-label={`Select ${title}`}
          >
            <input type="checkbox" checked={selected} readOnly className="h-4 w-4 cursor-pointer accent-[var(--accent)]" />
          </button>
          <button
            type="button"
            className="block w-full cursor-pointer p-3 text-left"
            onClick={() => setIsEditing(true)}
          >
            <div className="mx-auto aspect-[5/7] w-full max-w-[140px] overflow-hidden rounded-lg bg-surface-inset ring-1 ring-border-subtle">
              {imageSrc ? (
                <img
                  src={imageSrc}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                  onError={() => setImgFailed(true)}
                />
              ) : null}
            </div>
            <h3 className="mt-2 truncate text-sm font-medium text-ink-primary">{title}</h3>
            <p className="truncate text-[11px] text-ink-muted">
              {card.set?.name}
              {card.number ? ` · #${card.number}` : ''}
            </p>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium tabular-nums text-ink-primary">
                {formatCurrency(totalCurrentValue)}
              </span>
              <span
                className={cn(
                  'text-xs tabular-nums',
                  profit > 0 && 'text-gain',
                  profit < 0 && 'text-loss',
                  profit === 0 && 'text-ink-muted'
                )}
              >
                {formatPercent(profitPct, { signed: true })}
              </span>
            </div>
          </button>
        </article>
        {isEditing ? (
          <EditPanel
            vaultCardId={vaultCard.id}
            title={title}
            editQuantity={editQuantity}
            setEditQuantity={setEditQuantity}
            editPurchasePrice={editPurchasePrice}
            setEditPurchasePrice={setEditPurchasePrice}
            editNotes={editNotes}
            setEditNotes={setEditNotes}
            userNotes={userNotes}
            quantity={quantity}
            purchasePrice={vaultCard.purchasePrice}
            notes={notes || ''}
            onSave={handleSaveEdit}
            onCancel={() => {
              setIsEditing(false);
              setEditQuantity(quantity);
              setEditPurchasePrice(String(vaultCard.purchasePrice));
              setEditNotes(notes || '');
            }}
          />
        ) : null}
        <ConfirmDialog
          isOpen={showRemoveConfirm}
          onConfirm={() => {
            onRemove(vaultCard.id);
            setShowRemoveConfirm(false);
          }}
          onCancel={() => setShowRemoveConfirm(false)}
          title={`Remove ${title}?`}
          message={`Remove ${title} from your vault?`}
          confirmLabel="Remove"
          variant="destructive"
        />
      </>
    );
  }

  return (
    <>
      <div
        ref={rowRef}
        className={cn(
          'group grid items-center gap-x-3 border-b border-border-subtle px-3 py-2.5 last:border-b-0',
          'grid-cols-[1.5rem_2.75rem_minmax(0,1fr)_auto]',
          'sm:grid-cols-[1.5rem_2.75rem_minmax(0,1.4fr)_2.5rem_2.75rem_4.75rem_4.75rem_4.5rem_4rem_2rem]',
          selected && 'bg-accent/5',
          'hover:bg-surface-hover/50'
        )}
      >
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.(vaultCard.id);
          }}
          aria-label={`Select ${title}`}
        >
          <input
            type="checkbox"
            checked={selected}
            readOnly
            className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
          />
        </button>

        <button
          type="button"
          className="relative h-12 w-9 shrink-0 cursor-pointer overflow-hidden rounded-md bg-surface-inset ring-1 ring-border-subtle sm:h-[48px] sm:w-[34px]"
          onClick={() => setIsEditing((v) => !v)}
          aria-label={`Edit ${title}`}
        >
          {imageSrc ? (
            <img
              src={imageSrc}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[9px] text-ink-muted">
              —
            </div>
          )}
        </button>

        <button
          type="button"
          className="min-w-0 cursor-pointer text-left"
          onClick={() => setIsEditing((v) => !v)}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate text-[13px] font-medium leading-tight text-ink-primary">
              {title}
            </h3>
            {gradingResult ? (
              <GradeBadge grade={gradingResult.grade} label={gradingResult.gradeLabel} size="sm" />
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[11px] leading-tight text-ink-muted">
            {card.set?.name}
            {card.number ? (
              <span className="font-mono"> · #{card.number}</span>
            ) : null}
          </p>
        </button>

        <div className="flex items-center justify-end gap-2 sm:hidden">
          <p className="text-sm font-medium tabular-nums text-ink-primary">
            {formatCurrency(totalCurrentValue)}
          </p>
          <button
            type="button"
            onClick={() => setIsEditing((v) => !v)}
            className="btn-icon h-7 w-7"
            aria-label={`Edit ${title}`}
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>

        <p className="hidden text-right text-[13px] tabular-nums text-ink-secondary sm:block">
          {quantity}
        </p>

        <div className="hidden justify-end sm:flex">
          <span className="rounded-md bg-surface-inset px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-secondary ring-1 ring-border-subtle">
            {cond}
          </span>
        </div>

        <div className="hidden text-right sm:block">
          <p className="text-[13px] tabular-nums text-ink-secondary">
            {formatCurrency(totalPurchaseValue)}
          </p>
          {assumed ? (
            <p className="text-[10px] text-amber-400/90">At market</p>
          ) : null}
        </div>

        <p className="hidden text-right text-[13px] font-medium tabular-nums text-ink-primary sm:block">
          {formatCurrency(totalCurrentValue)}
        </p>

        <div className="hidden text-right sm:block">
          <p
            className={cn(
              'text-[13px] font-medium tabular-nums',
              profit > 0 && 'text-gain',
              profit < 0 && 'text-loss',
              profit === 0 && 'text-ink-muted'
            )}
          >
            {formatCurrency(profit, { signed: true })}
          </p>
          <p
            className={cn(
              'text-[10px] tabular-nums',
              profit > 0 && 'text-gain/80',
              profit < 0 && 'text-loss/80',
              profit === 0 && 'text-ink-muted'
            )}
          >
            {formatPercent(profitPct, { signed: true })}
          </p>
        </div>

        <p className="hidden text-right font-mono text-[11px] tabular-nums text-ink-muted sm:block">
          {purchasedLabel}
        </p>

        <div className="relative hidden justify-end sm:flex" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="btn-icon h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
            aria-label={`Actions for ${title}`}
            aria-expanded={menuOpen}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-border-default bg-surface-overlay py-1 shadow-popover"
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-secondary hover:bg-surface-hover"
                onClick={() => {
                  setMenuOpen(false);
                  setIsEditing(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-loss hover:bg-surface-hover"
                onClick={() => {
                  setMenuOpen(false);
                  setShowRemoveConfirm(true);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {isEditing ? (
        <EditPanel
          vaultCardId={vaultCard.id}
          title={title}
          editQuantity={editQuantity}
          setEditQuantity={setEditQuantity}
          editPurchasePrice={editPurchasePrice}
          setEditPurchasePrice={setEditPurchasePrice}
          editNotes={editNotes}
          setEditNotes={setEditNotes}
          userNotes={userNotes}
          quantity={quantity}
          purchasePrice={vaultCard.purchasePrice}
          notes={notes || ''}
          onSave={handleSaveEdit}
          onCancel={() => {
            setIsEditing(false);
            setEditQuantity(quantity);
            setEditPurchasePrice(String(vaultCard.purchasePrice));
            setEditNotes(notes || '');
          }}
        />
      ) : null}

      <ConfirmDialog
        isOpen={showRemoveConfirm}
        onConfirm={() => {
          onRemove(vaultCard.id);
          setShowRemoveConfirm(false);
        }}
        onCancel={() => setShowRemoveConfirm(false)}
        title={`Remove ${title}?`}
        message={`Remove ${title} from your vault?`}
        confirmLabel="Remove"
        variant="destructive"
      />
    </>
  );
};

function EditPanel({
  vaultCardId,
  editQuantity,
  setEditQuantity,
  editPurchasePrice,
  setEditPurchasePrice,
  editNotes,
  setEditNotes,
  userNotes,
  quantity,
  purchasePrice,
  notes,
  onSave,
  onCancel,
}: {
  vaultCardId: string;
  title: string;
  editQuantity: number;
  setEditQuantity: (n: number) => void;
  editPurchasePrice: string;
  setEditPurchasePrice: (s: string) => void;
  editNotes: string;
  setEditNotes: (s: string) => void;
  userNotes: string;
  quantity: number;
  purchasePrice: number;
  notes: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  void quantity;
  void purchasePrice;
  void notes;
  return (
    <div className="border-b border-border-subtle bg-surface-inset/70 px-3 py-3">
      <div className="grid max-w-xl gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`vault-qty-${vaultCardId}`} className="mb-1 block text-xs text-ink-muted">
            Qty
          </label>
          <input
            id={`vault-qty-${vaultCardId}`}
            type="number"
            min={1}
            value={editQuantity}
            onChange={(e) => setEditQuantity(parseInt(e.target.value) || 1)}
            className="input h-9"
          />
        </div>
        <div>
          <label htmlFor={`vault-paid-${vaultCardId}`} className="mb-1 block text-xs text-ink-muted">
            Paid / card
          </label>
          <input
            id={`vault-paid-${vaultCardId}`}
            type="number"
            min={0}
            step="0.01"
            value={editPurchasePrice}
            onChange={(e) => setEditPurchasePrice(e.target.value)}
            className="input h-9"
          />
        </div>
        <div>
          <label htmlFor={`vault-notes-${vaultCardId}`} className="mb-1 block text-xs text-ink-muted">
            Notes
          </label>
          <input
            id={`vault-notes-${vaultCardId}`}
            type="text"
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            className="input h-9"
            placeholder="Optional"
          />
        </div>
      </div>
      {userNotes ? <p className="mt-2 max-w-xl text-xs text-ink-muted">{userNotes}</p> : null}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onSave} className="btn-primary h-8 px-3 text-xs">
          Save
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost h-8">
          Cancel
        </button>
      </div>
    </div>
  );
}
