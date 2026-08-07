import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Modal } from '../../../components/common/Modal';
import { BoxSession, OpenedPack, PullCard } from '../types';
import { PullCardView } from './PullCardView';
import { PackFan } from './PackFan';
import { opRarityStyle, OP_RARITY_LABELS } from './opRarityStyles';
import { rarityRank } from '../services/onePiecePackService';
import { formatCurrency } from '../../../utils/cardDisplay';
import { BookPlus, Check, ChevronRight, Package, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { fanCardsForPack, packMarketValue } from '../services/packOdds';

interface BoxSessionModalProps {
  session: BoxSession | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (cards: PullCard[], code: string, setName: string) => boolean;
}

export const BoxSessionModal: React.FC<BoxSessionModalProps> = ({
  session,
  isOpen,
  onClose,
  onSave,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saved, setSaved] = useState(false);
  const [packRipped, setPackRipped] = useState(false);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);

  useEffect(() => {
    if (isOpen && session) {
      setCurrentIndex(0);
      setSaved(false);
      setPackRipped(false);
      setFlippedIndices([]);
    }
  }, [isOpen, session]);

  useEffect(() => {
    setPackRipped(false);
    setFlippedIndices([]);
  }, [currentIndex]);

  const pack: OpenedPack | undefined = session?.packs[currentIndex];
  const isDone = session ? currentIndex >= session.packs.length : false;
  const revealedCount = session ? Math.min(currentIndex + 1, session.packs.length) : 0;

  const currentFanCards = useMemo(() => (pack ? fanCardsForPack(pack) : []), [pack]);

  const hitsSoFar = useMemo(() => {
    if (!session) return [];
    return session.packs
      .slice(0, revealedCount)
      .flatMap((p) => p.hits)
      .sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity));
  }, [session, revealedCount]);

  const liveBoxValue = useMemo(() => {
    if (!session) return 0;
    if (isDone) {
      return session.packs.reduce((sum, p) => sum + packMarketValue(p), 0);
    }
    const completed = session.packs
      .slice(0, currentIndex)
      .reduce((sum, p) => sum + packMarketValue(p), 0);
    const currentFlipped = flippedIndices.reduce(
      (sum, i) => sum + (currentFanCards[i]?.marketPrice ?? 0),
      0
    );
    return completed + currentFlipped;
  }, [session, isDone, currentIndex, flippedIndices, currentFanCards]);

  const handleFlippedChange = useCallback((indices: number[]) => {
    setFlippedIndices(indices);
  }, []);

  if (!session) return null;

  const handleSaveAll = () => {
    const cards = session.packs.flatMap((p) => fanCardsForPack(p));
    const ok = onSave(cards, session.code, session.setName);
    setSaved(ok);
  };

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-baseline gap-2">
        <span className="section-label">Box value</span>
        <motion.span
          key={liveBoxValue.toFixed(2)}
          initial={{ opacity: 0.55, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="font-display text-xl font-bold tabular-nums text-ink-primary"
        >
          {formatCurrency(liveBoxValue)}
        </motion.span>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border-default bg-surface-hover px-4 py-2.5 text-sm font-semibold text-ink-primary transition-colors hover:border-border-strong hover:bg-surface-overlay"
      >
        Close session
      </button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="pack" footer={footer} variant="stage">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="section-label">Booster box · {session.code} · {session.packs.length} packs</p>
            <h3 className="truncate font-display text-xl font-bold text-ink-primary">{session.setName}</h3>
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

        {/* Progress */}
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-hover">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-accent to-foil"
              animate={{ width: `${(revealedCount / session.packs.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-secondary">
            {Math.min(revealedCount, session.packs.length)} / {session.packs.length}
          </span>
        </div>

        {/* Running hits */}
        <div className="mt-3 flex min-h-[2rem] flex-wrap items-center gap-1.5">
          {hitsSoFar.length === 0 && (
            <span className="text-xs text-ink-muted">No hits yet — keep ripping.</span>
          )}
          {hitsSoFar.slice(0, 10).map((h, i) => (
            <span
              key={`${h.id}-${i}`}
              className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold', opRarityStyle(h.rarity).badge)}
              title={`${h.name} · ${OP_RARITY_LABELS[h.rarity]}`}
            >
              {OP_RARITY_LABELS[h.rarity]}
            </span>
          ))}
          {hitsSoFar.length > 10 && (
            <span className="text-[10px] text-ink-muted">+{hitsSoFar.length - 10} more</span>
          )}
        </div>

        {isDone ? (
          /* ---- Box summary ---- */
          <div className="mt-4 flex-1 overflow-y-auto pb-2 pr-1">
            <div className="mb-3 flex items-center gap-2">
              <Package className="h-4 w-4 text-gold" />
              <h4 className="text-sm font-bold text-ink-primary">Box summary — hits</h4>
            </div>
            {hitsSoFar.length === 0 ? (
              <p className="rounded-xl border border-border-subtle bg-surface-inset p-4 text-sm text-ink-muted">
                No chase cards this box. The case odds are unforgiving.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {hitsSoFar.map((card) => (
                  <div
                    key={card.id}
                    className={cn(
                      'overflow-hidden rounded-xl border bg-surface-raised',
                      opRarityStyle(card.rarity).border
                    )}
                  >
                    <PullCardView card={card} showPrice={false} />
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={saved}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all',
                  saved
                    ? 'bg-gain-muted text-gain'
                    : 'bg-accent text-primary-foreground shadow-glow-accent hover:bg-accent-hover'
                )}
              >
                {saved ? <Check className="h-4 w-4" /> : <BookPlus className="h-4 w-4" />}
                {saved ? 'All pulls saved' : 'Save all pulls to collection'}
              </button>
            </div>
          </div>
        ) : pack ? (
          /* ---- Current pack ---- */
          <>
            <div className="mt-2 min-h-0 flex-1">
              <PackFan
                key={pack.id}
                cards={currentFanCards}
                onDone={() => setPackRipped(true)}
                onFlippedChange={handleFlippedChange}
              />
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setCurrentIndex((i) => i + 1)}
                disabled={!packRipped}
                className={cn(
                  'inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all',
                  packRipped
                    ? 'bg-accent text-primary-foreground shadow-glow-accent hover:bg-accent-hover active:scale-[0.99]'
                    : 'cursor-not-allowed bg-surface-hover text-ink-muted'
                )}
              >
                {packRipped
                  ? currentIndex === session.packs.length - 1
                    ? 'See box summary'
                    : 'Next pack'
                  : 'Flip remaining cards'}
                {packRipped && <ChevronRight className="h-4 w-4" />}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
};
