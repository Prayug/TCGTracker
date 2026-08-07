import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Modal } from '../../../components/common/Modal';
import { OpenedPack, PullCard } from '../types';
import { PackFan } from './PackFan';
import { opRarityStyle, OP_RARITY_LABELS } from './opRarityStyles';
import { rarityRank } from '../services/onePiecePackService';
import { formatCurrency } from '../../../utils/cardDisplay';
import { BookPlus, Check, Sparkles, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { fanCardsForPack } from '../services/packOdds';

interface PackRevealModalProps {
  pack: OpenedPack | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (cards: PullCard[], code: string, setName: string) => boolean;
  onOpenAnother: () => void;
}

export const PackRevealModal: React.FC<PackRevealModalProps> = ({
  pack,
  isOpen,
  onClose,
  onSave,
  onOpenAnother,
}) => {
  const [saved, setSaved] = useState(false);
  const [allFlipped, setAllFlipped] = useState(false);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSaved(false);
      setAllFlipped(false);
      setFlippedIndices([]);
    }
  }, [isOpen, pack]);

  const revealOrder = useMemo(() => (pack ? fanCardsForPack(pack) : []), [pack]);

  const liveValue = useMemo(
    () =>
      flippedIndices.reduce((sum, i) => sum + (revealOrder[i]?.marketPrice ?? 0), 0),
    [flippedIndices, revealOrder]
  );

  const handleFlippedChange = useCallback((indices: number[]) => {
    setFlippedIndices(indices);
  }, []);

  if (!pack) return null;

  const hits = revealOrder
    .filter((c) => c.isChase)
    .sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity));

  const handleSave = () => {
    const ok = onSave(revealOrder, pack.code, pack.setName);
    setSaved(ok);
  };

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-baseline gap-2">
        <span className="section-label">Pack value</span>
        <motion.span
          key={liveValue.toFixed(2)}
          initial={{ opacity: 0.55, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="font-display text-xl font-bold tabular-nums text-ink-primary"
        >
          {formatCurrency(liveValue)}
        </motion.span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onOpenAnother}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border-default bg-surface-hover px-4 py-2.5 text-sm font-semibold text-ink-primary transition-colors hover:border-border-strong hover:bg-surface-overlay"
        >
          <Sparkles className="h-4 w-4 text-foil" />
          Open another pack
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saved || !allFlipped}
          className={cn(
            'inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all',
            saved
              ? 'bg-gain-muted text-gain'
              : allFlipped
                ? 'bg-accent text-primary-foreground shadow-glow-accent hover:bg-accent-hover'
                : 'cursor-not-allowed bg-surface-hover text-ink-muted'
          )}
        >
          {saved ? <Check className="h-4 w-4" /> : <BookPlus className="h-4 w-4" />}
          {saved ? 'Saved to collection' : allFlipped ? 'Save to collection' : 'Flip cards to save…'}
        </button>
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="pack" footer={footer} variant="stage">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="section-label">Pack opening · {pack.code}</p>
            <h3 className="font-display text-xl font-bold text-ink-primary">
              {pack.setName}
              <span className="ml-2 align-middle text-xs font-medium text-ink-muted">
                {revealOrder.length} cards
              </span>
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

        {allFlipped && hits.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-gold/25 bg-gold/5 px-3 py-2">
            <Sparkles className="h-4 w-4 shrink-0 text-gold" />
            {hits.slice(0, 4).map((h, i) => (
              <span
                key={`${h.id}-${i}`}
                className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold', opRarityStyle(h.rarity).badge)}
                title={`${h.name} · ${OP_RARITY_LABELS[h.rarity]}`}
              >
                {OP_RARITY_LABELS[h.rarity]}
              </span>
            ))}
          </div>
        )}

        <div className="mt-2 min-h-0 flex-1">
          <PackFan
            key={pack.id}
            cards={revealOrder}
            onDone={() => setAllFlipped(true)}
            onFlippedChange={handleFlippedChange}
          />
        </div>
      </div>
    </Modal>
  );
};
