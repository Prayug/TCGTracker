import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from '../../../components/common/Modal';
import { BulkOpenSession, PullCard } from '../types';
import { PullCardView } from './PullCardView';
import { opRarityStyle, OP_RARITY_LABELS } from './opRarityStyles';
import { rarityRank } from '../services/onePiecePackService';
import { formatCurrency } from '../../../utils/cardDisplay';
import { BookPlus, Check, Layers, Package, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { fanCardsForPack } from '../services/packOdds';

interface BulkOpenModalProps {
  session: BulkOpenSession | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (cards: PullCard[], code: string, setName: string) => boolean;
  onRipAgain: () => void;
}

export const BulkOpenModal: React.FC<BulkOpenModalProps> = ({
  session,
  isOpen,
  onClose,
  onSave,
  onRipAgain,
}) => {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) setSaved(false);
  }, [isOpen, session]);

  const hitSummary = useMemo(() => {
    if (!session) return [];
    const counts = new Map<string, number>();
    for (const h of session.hits) {
      counts.set(h.rarity, (counts.get(h.rarity) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => rarityRank(a[0] as PullCard['rarity']) - rarityRank(b[0] as PullCard['rarity']))
      .map(([rarity, count]) => ({ rarity: rarity as PullCard['rarity'], count }));
  }, [session]);

  /** Collapse duplicate hits into one tile + corner qty (×N). */
  const stackedHits = useMemo(() => {
    if (!session) return [];
    const byId = new Map<string, { card: PullCard; count: number }>();
    for (const card of session.hits) {
      const key = card.id || `${card.number}::${card.rarity}::${card.name}`;
      const entry = byId.get(key);
      if (entry) entry.count += 1;
      else byId.set(key, { card, count: 1 });
    }
    return [...byId.values()].sort((a, b) => {
      const rank = rarityRank(a.card.rarity) - rarityRank(b.card.rarity);
      if (rank !== 0) return rank;
      return b.count - a.count;
    });
  }, [session]);

  if (!session) return null;

  const handleSave = () => {
    const cards = session.boxes.flatMap((b) => b.packs.flatMap((p) => fanCardsForPack(p)));
    setSaved(onSave(cards, session.code, session.setName));
  };

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-baseline gap-2">
        <span className="section-label">Total value</span>
        <span className="font-display text-xl font-bold tabular-nums text-ink-primary">
          {formatCurrency(session.totalValue)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onRipAgain}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border-default bg-surface-hover px-4 py-2.5 text-sm font-semibold text-ink-primary transition-colors hover:border-border-strong hover:bg-surface-overlay"
        >
          <Layers className="h-4 w-4 text-foil" />
          Rip again
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saved}
          className={cn(
            'inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all',
            saved
              ? 'bg-gain-muted text-gain'
              : 'bg-accent text-primary-foreground shadow-glow-accent hover:bg-accent-hover'
          )}
        >
          {saved ? <Check className="h-4 w-4" /> : <BookPlus className="h-4 w-4" />}
          {saved ? 'Saved' : 'Save all pulls'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border-default bg-surface-hover px-4 py-2.5 text-sm font-semibold text-ink-primary transition-colors hover:border-border-strong"
        >
          Close
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="pack"
      footer={footer}
      variant="stage"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="section-label">
              {session.isCase ? 'Case rip' : 'Bulk rip'} · {session.code} · {session.boxCount}{' '}
              {session.boxCount === 1 ? 'box' : 'boxes'} · {session.packCount} packs
            </p>
            <h3 className="truncate font-display text-xl font-bold text-ink-primary">
              {session.setName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {hitSummary.length === 0 ? (
            <span className="text-xs text-ink-muted">No chase cards this rip.</span>
          ) : (
            hitSummary.map(({ rarity, count }) => (
              <span
                key={rarity}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] font-bold tabular-nums',
                  opRarityStyle(rarity).badge
                )}
              >
                {count}× {OP_RARITY_LABELS[rarity]}
              </span>
            ))
          )}
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pb-2 pr-1">
          <div className="mb-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-gold" />
            <h4 className="text-sm font-bold text-ink-primary">
              Chase hits ({session.hits.length}
              {stackedHits.length !== session.hits.length
                ? ` · ${stackedHits.length} unique`
                : ''}
              )
            </h4>
          </div>
          {stackedHits.length === 0 ? (
            <p className="rounded-xl border border-border-subtle bg-surface-inset p-4 text-sm text-ink-muted">
              Cold rip — no alternate arts, secrets, or chase variants this time.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {stackedHits.map(({ card, count }) => (
                <div
                  key={card.id || `${card.number}::${card.rarity}`}
                  className={cn(
                    'overflow-hidden rounded-xl border bg-surface-raised',
                    opRarityStyle(card.rarity).border
                  )}
                >
                  <PullCardView card={card} count={count} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
