import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CardArt } from '../../../components/exchange/CardArt';
import type { Binder } from '../types';
import { type Pocket, layoutPages, moveWithin } from '../binderLayout';
import { cn } from '@/lib/utils';

function pocketLabel(p: Pocket, pageIndex: number): string {
  const where = `Page ${pageIndex + 1}, pocket ${(p.index % 9) + 1}`;
  return p.card ? `${where}: ${p.card.cardName ?? p.card.cardId ?? 'card'}` : `${where}: empty`;
}

/** A single pocket: card art in a sleeve, or an empty sleeve. */
export function PocketFace({ pocket, small = false }: { pocket: Pocket; small?: boolean }) {
  if (!pocket.card) {
    return (
      <span
        className={cn(
          'block aspect-[63/88] w-full rounded-[4.6%/3.3%] border border-dashed border-border-strong bg-surface-inset/60'
        )}
        aria-hidden
      />
    );
  }
  return (
    <CardArt
      card={{
        name: pocket.card.cardName ?? 'Card',
        images: {
          small: pocket.card.imageSmall ?? undefined,
          large: pocket.card.imageLarge ?? undefined,
        },
        number: pocket.card.cardNumber,
        set: { name: pocket.card.setName },
      }}
      flat={small}
    />
  );
}

/** Small read-only first page used on album covers. */
export function PagePreview({ binder }: { binder: Binder }) {
  const [first] = layoutPages(binder);
  return (
    <div className="grid grid-cols-3 gap-1">
      {first.map((p) => (
        <PocketFace key={p.index} pocket={p} small />
      ))}
    </div>
  );
}

/**
 * The binder editor: one 3×3 page at a time. Rearrange by dragging a card
 * onto another, or with the keyboard: focus a pocket, press Enter to pick
 * the card up, move with the arrow keys, press Enter to swap, Escape to
 * cancel.
 */
export function BinderPages({
  binder,
  onSwap,
  busy,
}: {
  binder: Binder;
  onSwap: (a: Pocket, b: Pocket) => Promise<string | null>;
  busy: boolean;
}) {
  const pages = layoutPages(binder);
  const [pageIndex, setPageIndex] = useState(0);
  const [focus, setFocus] = useState(0);
  const [held, setHeld] = useState<Pocket | null>(null);
  const [dragFrom, setDragFrom] = useState<Pocket | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const page = pages[Math.min(pageIndex, pages.length - 1)] ?? [];

  const goPage = (n: number) => {
    const next = Math.max(0, Math.min(pages.length - 1, n));
    setPageIndex(next);
    setAnnounce(
      `Page ${next + 1} of ${pages.length}${held ? `. Holding ${held.card?.cardName}` : ''}`
    );
  };

  const drop = async (from: Pocket, to: Pocket) => {
    if (from.index === to.index) return;
    const err = await onSwap(from, to);
    setAnnounce(
      err ?? `Swapped ${from.card?.cardName ?? 'card'} with ${to.card?.cardName ?? 'card'}.`
    );
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, pos: number) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const next = moveWithin(pos, e.key);
      if (next === pos && e.key === 'ArrowRight' && pos % 3 === 2 && pageIndex < pages.length - 1) {
        goPage(pageIndex + 1);
        setFocus(pos - 2);
        requestAnimationFrame(() => refs.current[pos - 2]?.focus());
        return;
      }
      if (next === pos && e.key === 'ArrowLeft' && pos % 3 === 0 && pageIndex > 0) {
        goPage(pageIndex - 1);
        setFocus(pos + 2);
        requestAnimationFrame(() => refs.current[pos + 2]?.focus());
        return;
      }
      setFocus(next);
      refs.current[next]?.focus();
      return;
    }
    if (e.key === 'Escape' && held) {
      e.preventDefault();
      setHeld(null);
      setAnnounce('Move cancelled.');
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const pocket = page[pos];
      if (!held) {
        if (!pocket.card) {
          setAnnounce('This pocket is empty. Pick up a card first.');
          return;
        }
        setHeld(pocket);
        setAnnounce(
          `Picked up ${pocket.card.cardName}. Move to another card and press Enter to swap, or Escape to cancel.`
        );
      } else {
        const from = held;
        setHeld(null);
        void drop(from, pocket);
      }
    }
  };

  const dragProps = (p: Pocket) => ({
    draggable: Boolean(p.card) && !busy,
    onDragStart: (e: DragEvent) => {
      setDragFrom(p);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(p.index));
    },
    onDragEnd: () => {
      setDragFrom(null);
      setOverIndex(null);
    },
    onDragOver: (e: DragEvent) => {
      if (!dragFrom) return;
      e.preventDefault();
      setOverIndex(p.index);
    },
    onDragLeave: () => setOverIndex((i) => (i === p.index ? null : i)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const from = dragFrom;
      setDragFrom(null);
      setOverIndex(null);
      if (from) void drop(from, p);
    },
  });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => goPage(pageIndex - 1)}
          disabled={pageIndex === 0}
          className="btn-ghost h-9 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Previous
        </button>
        <p className="font-mono text-[13px] tabular-nums text-ink-secondary">
          Page {pageIndex + 1} of {pages.length}
        </p>
        <button
          type="button"
          onClick={() => goPage(pageIndex + 1)}
          disabled={pageIndex >= pages.length - 1}
          className="btn-ghost h-9 disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* The page: a sheet with nine sleeves. */}
      <div
        role="grid"
        aria-label={`${binder.name}, page ${pageIndex + 1}`}
        aria-busy={busy}
        className="mx-auto max-w-[34rem] rounded-lg border border-border-default bg-surface-raised p-3 shadow-[var(--card-shadow)] sm:p-4"
      >
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            role="row"
            className="grid grid-cols-3 gap-2 sm:gap-3 [&+&]:mt-2 sm:[&+&]:mt-3"
          >
            {page.slice(row * 3, row * 3 + 3).map((p, i) => {
              const pos = row * 3 + i;
              const isHeld = held?.index === p.index;
              const isOver = overIndex === p.index && dragFrom?.index !== p.index;
              return (
                <div key={p.index} role="gridcell">
                  <button
                    ref={(el) => {
                      refs.current[pos] = el;
                    }}
                    type="button"
                    tabIndex={pos === focus ? 0 : -1}
                    onFocus={() => setFocus(pos)}
                    onKeyDown={(e) => onKey(e, pos)}
                    onClick={() => {
                      if (held) {
                        const from = held;
                        setHeld(null);
                        void drop(from, p);
                      } else if (p.card) {
                        setHeld(p);
                        setAnnounce(`Picked up ${p.card.cardName}. Choose another card to swap.`);
                      }
                    }}
                    aria-pressed={isHeld}
                    aria-label={`${pocketLabel(p, pageIndex)}${isHeld ? ', picked up' : ''}`}
                    className={cn(
                      'block w-full rounded-[4.6%/3.3%] transition-transform duration-100',
                      p.card && 'cursor-grab active:cursor-grabbing',
                      isHeld &&
                        'outline outline-2 outline-offset-2 outline-accent motion-safe:-translate-y-1',
                      isOver && 'outline outline-2 outline-offset-2 outline-gold-line',
                      dragFrom?.index === p.index && 'opacity-40'
                    )}
                    {...dragProps(p)}
                  >
                    <PocketFace pocket={p} />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="mx-auto mt-3 max-w-[34rem] text-[12px] text-ink-muted">
        Drag a card onto another to swap them. With a keyboard, press Enter to pick a card up, move
        with the arrow keys, and press Enter again to swap. Cards can only swap with other cards;
        empty pockets fill when you plan or refresh the binder.
      </p>
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
    </div>
  );
}
