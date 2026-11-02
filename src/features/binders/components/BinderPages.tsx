import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Maximize2, Replace } from 'lucide-react';
import { CardArt } from '../../../components/exchange/CardArt';
import type { Binder } from '../types';
import { type Pocket, layoutPages } from '../binderLayout';
import { coverFor, type BinderCover } from '../binderCovers';
import { useIsMobileViewport, usePrefersReducedMotion } from '../../../hooks/useMotionPreferences';
import { cn } from '@/lib/utils';

function pocketLabel(p: Pocket): string {
  const where = `Page ${Math.floor(p.index / 9) + 1}, pocket ${(p.index % 9) + 1}`;
  return p.card ? `${where}: ${p.card.cardName ?? p.card.cardId ?? 'card'}` : `${where}: empty`;
}

export function pocketCard(p: Pocket) {
  return {
    id: p.card?.cardId,
    name: p.card?.cardName ?? 'Card',
    images: { small: p.card?.imageSmall ?? undefined, large: p.card?.imageLarge ?? undefined },
    number: p.card?.cardNumber,
    set: { name: p.card?.setName },
    rarity: p.card?.rarity,
  };
}

/** A pocket: the card behind a clear sleeve (lip, gloss, edge), or an empty sleeve. */
export function PocketFace({ pocket, small = false }: { pocket: Pocket; small?: boolean }) {
  return (
    <span
      className={cn('sleeve relative block aspect-[63/88] w-full', !pocket.card && 'sleeve-empty')}
    >
      {pocket.card ? (
        <CardArt card={pocketCard(pocket)} flat className="rounded-[3.5%/2.5%]" />
      ) : null}
      {!small ? <span aria-hidden className="sleeve-gloss" /> : null}
    </span>
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

/** Arrow-key movement across a grid of `cols` columns and 3 rows. */
function moveIn(pos: number, key: string, cols: number): number {
  const row = Math.floor(pos / cols);
  const col = pos % cols;
  switch (key) {
    case 'ArrowLeft':
      return col > 0 ? pos - 1 : pos;
    case 'ArrowRight':
      return col < cols - 1 ? pos + 1 : pos;
    case 'ArrowUp':
      return row > 0 ? pos - cols : pos;
    case 'ArrowDown':
      return row < 2 ? pos + cols : pos;
    case 'Home':
      return 0;
    case 'End':
      return cols * 3 - 1;
    default:
      return pos;
  }
}

/**
 * The binder: an open album. On wide screens two pages face each other
 * across a ringed spine; on phones it is one page. Pages turn like paper.
 * Rearrange by dragging a card onto another, or with the keyboard: focus a
 * pocket, Enter to pick it up, arrows to move, Enter to swap, Escape to
 * cancel. Every swap is saved straight away.
 */
export function BinderPages({
  binder,
  onSwap,
  busy,
  onZoom,
  onReplace,
}: {
  binder: Binder;
  onSwap: (a: Pocket, b: Pocket) => Promise<string | null>;
  busy: boolean;
  onZoom?: (p: Pocket) => void;
  onReplace?: (p: Pocket) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const single = useIsMobileViewport(1023);
  const per = single ? 1 : 2;
  const pages = layoutPages(binder);
  const spreads = Math.max(1, Math.ceil(pages.length / per));
  const [spread, setSpread] = useState(0);
  const [turn, setTurn] = useState<{ from: number; to: number } | null>(null);
  const [focus, setFocus] = useState(0);
  const [held, setHeld] = useState<Pocket | null>(null);
  const [dragFrom, setDragFrom] = useState<Pocket | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');
  const [cover, setCoverState] = useState<BinderCover>(() => coverFor(binder.id));
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const sync = () => setCoverState(coverFor(binder.id));
    window.addEventListener('tcg:binder-cover', sync);
    return () => window.removeEventListener('tcg:binder-cover', sync);
  }, [binder.id]);
  useEffect(() => setSpread((s) => Math.min(s, spreads - 1)), [spreads]);

  const pagesOf = (s: number) => pages.slice(s * per, s * per + per);
  const visible = pagesOf(spread);
  const cols = 3 * per;
  // Flatten the visible spread to a cols×3 grid for keyboard movement.
  const grid: Pocket[] = [];
  for (let r = 0; r < 3; r++)
    for (let pg = 0; pg < per; pg++)
      for (let c = 0; c < 3; c++) {
        const p = visible[pg]?.[r * 3 + c];
        if (p) grid.push(p);
      }

  const goSpread = (n: number) => {
    const next = Math.max(0, Math.min(spreads - 1, n));
    if (next === spread || turn) return;
    setAnnounce(
      `Page ${next * per + 1}${per === 2 && pages[next * per + 1] ? ` and ${next * per + 2}` : ''} of ${pages.length}${held ? `. Holding ${held.card?.cardName}` : ''}`
    );
    if (reduced) {
      setSpread(next);
      return;
    }
    setTurn({ from: spread, to: next });
  };

  const drop = async (from: Pocket, to: Pocket) => {
    if (from.index === to.index) return;
    const err = await onSwap(from, to);
    setAnnounce(
      err ?? `Swapped ${from.card?.cardName ?? 'card'} with ${to.card?.cardName ?? 'card'}. Saved.`
    );
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, pos: number) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const next = moveIn(pos, e.key, cols);
      if (
        next === pos &&
        e.key === 'ArrowRight' &&
        pos % cols === cols - 1 &&
        spread < spreads - 1
      ) {
        goSpread(spread + 1);
        setFocus(pos - (cols - 1));
        return;
      }
      if (next === pos && e.key === 'ArrowLeft' && pos % cols === 0 && spread > 0) {
        goSpread(spread - 1);
        setFocus(pos + (cols - 1));
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
      const pocket = grid[pos];
      if (!held) {
        if (!pocket?.card) {
          setAnnounce('This pocket is empty. Pick up a card first.');
          return;
        }
        setHeld(pocket);
        setAnnounce(
          `Picked up ${pocket.card.cardName}. Move to another card and press Enter to swap, or Escape to cancel.`
        );
      } else if (pocket) {
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

  const renderPage = (
    page: Pocket[] | undefined,
    side: 'left' | 'right' | 'single',
    interactive: boolean
  ): ReactNode => (
    <div
      className={cn(
        'binder-page relative h-full p-3 sm:p-5',
        side === 'left' && 'rounded-l-xl',
        side === 'right' && 'rounded-r-xl',
        side === 'single' && 'rounded-xl'
      )}
    >
      {page ? (
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5">
          {page.map((p) => {
            const gridPos = grid.indexOf(p);
            const isHeld = held?.index === p.index;
            const isOver = overIndex === p.index && dragFrom?.index !== p.index;
            if (!interactive) return <PocketFace key={p.index} pocket={p} />;
            return (
              <div key={p.index} role="gridcell" className="group/pocket relative">
                <motion.div
                  animate={
                    isHeld && !reduced
                      ? { y: -10, rotate: -2, scale: 1.04 }
                      : { y: 0, rotate: 0, scale: 1 }
                  }
                  transition={{ type: 'spring', stiffness: 380, damping: 24 }}
                >
                  <button
                    ref={(el) => {
                      refs.current[gridPos] = el;
                    }}
                    type="button"
                    tabIndex={gridPos === focus ? 0 : -1}
                    onFocus={() => setFocus(gridPos)}
                    onKeyDown={(e) => onKey(e, gridPos)}
                    onDoubleClick={() => p.card && onZoom?.(p)}
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
                    aria-label={`${pocketLabel(p)}${isHeld ? ', picked up' : ''}`}
                    className={cn(
                      'block w-full rounded-[4.6%/3.3%]',
                      p.card && 'cursor-grab active:cursor-grabbing',
                      isHeld &&
                        'shadow-[0_18px_30px_-12px_rgba(0,0,0,0.6)] outline outline-2 outline-offset-2 outline-accent',
                      isOver && 'outline outline-2 outline-offset-2 outline-[var(--gold-line)]',
                      dragFrom?.index === p.index && 'opacity-40'
                    )}
                    {...dragProps(p)}
                  >
                    <PocketFace pocket={p} />
                  </button>
                </motion.div>
                {p.card && (onZoom || onReplace) ? (
                  <div className="absolute right-1 top-1 flex gap-1 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/pocket:opacity-100 [@media(hover:hover)]:group-hover/pocket:opacity-100">
                    {onZoom ? (
                      <button
                        type="button"
                        onClick={() => onZoom(p)}
                        className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/80"
                        aria-label={`Zoom into ${p.card.cardName}`}
                      >
                        <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : null}
                    {onReplace ? (
                      <button
                        type="button"
                        onClick={() => onReplace(p)}
                        className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/80"
                        aria-label={`Replace ${p.card.cardName}`}
                      >
                        <Replace className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid h-full min-h-[12rem] place-items-center text-[13px] text-ink-muted">
          End of the binder
        </div>
      )}
      <span
        className="absolute bottom-2 font-mono text-[10.5px] text-ink-faint"
        style={side === 'left' ? { left: 14 } : { right: 14 }}
      >
        {page ? Math.floor(page[0].index / 9) + 1 : ''}
      </span>
    </div>
  );

  // While a page turns, the base shows the destination where the leaf has uncovered it.
  const forward = turn ? turn.to > turn.from : true;
  const base = turn
    ? per === 2
      ? forward
        ? [pagesOf(turn.from)[0], pagesOf(turn.to)[1]]
        : [pagesOf(turn.to)[0], pagesOf(turn.from)[1]]
      : [pagesOf(turn.to)[0]]
    : visible;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => goSpread(spread - 1)}
          disabled={spread === 0 || Boolean(turn)}
          className="btn-secondary h-10 rounded-full disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Previous
        </button>
        <p className="font-mono text-[13px] tabular-nums text-ink-secondary">
          {per === 2
            ? `Pages ${spread * 2 + 1}–${Math.min(pages.length, spread * 2 + 2)}`
            : `Page ${spread + 1}`}{' '}
          of {pages.length}
        </p>
        <button
          type="button"
          onClick={() => goSpread(spread + 1)}
          disabled={spread >= spreads - 1 || Boolean(turn)}
          className="btn-secondary h-10 rounded-full disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* The open album, framed by its cover. */}
      <div
        className="binder-shell mx-auto rounded-[22px] p-2.5 sm:p-3.5"
        style={{ background: cover.bg, maxWidth: per === 2 ? '68rem' : '34rem' }}
      >
        <div
          role="grid"
          aria-label={`${binder.name}, ${per === 2 ? `pages ${spread * 2 + 1} and ${spread * 2 + 2}` : `page ${spread + 1}`}`}
          aria-busy={busy}
          className="relative grid [perspective:2200px]"
          style={{ gridTemplateColumns: per === 2 ? '1fr 1fr' : '1fr' }}
        >
          {per === 2 ? (
            <>
              {renderPage(base[0], 'left', !turn)}
              {renderPage(base[1], 'right', !turn)}
              <Spine />
            </>
          ) : (
            renderPage(base[0], 'single', !turn)
          )}

          <AnimatePresence>
            {turn ? (
              <motion.div
                key={`${turn.from}-${turn.to}`}
                className="absolute inset-y-0 [transform-style:preserve-3d]"
                style={
                  per === 2
                    ? forward
                      ? { left: '50%', width: '50%', transformOrigin: 'left center' }
                      : { left: 0, width: '50%', transformOrigin: 'right center' }
                    : { left: 0, width: '100%', transformOrigin: 'left center' }
                }
                initial={{ rotateY: 0 }}
                animate={{ rotateY: forward ? -180 : 180 }}
                transition={{ duration: 0.75, ease: [0.645, 0.045, 0.355, 1] }}
                onAnimationComplete={() => {
                  setSpread(turn.to);
                  setTurn(null);
                  requestAnimationFrame(() =>
                    refs.current[Math.min(focus, grid.length - 1)]?.focus()
                  );
                }}
              >
                <div className="absolute inset-0 [backface-visibility:hidden]">
                  {renderPage(
                    per === 2
                      ? forward
                        ? pagesOf(turn.from)[1]
                        : pagesOf(turn.from)[0]
                      : pagesOf(turn.from)[0],
                    per === 2 ? (forward ? 'right' : 'left') : 'single',
                    false
                  )}
                  <motion.div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-gradient-to-l from-black/30 to-transparent"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.8, 0] }}
                    transition={{ duration: 0.75 }}
                  />
                </div>
                <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                  {per === 2 ? (
                    renderPage(
                      forward ? pagesOf(turn.to)[0] : pagesOf(turn.to)[1],
                      forward ? 'left' : 'right',
                      false
                    )
                  ) : (
                    <div className="binder-page h-full rounded-xl" />
                  )}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <p className="mx-auto mt-4 max-w-[46rem] text-center text-[12.5px] text-ink-muted">
        Drag a card onto another to swap them; each swap is saved. Keyboard: Enter picks a card up,
        arrows move, Enter swaps. Double-click a card to zoom in.
      </p>
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
    </div>
  );
}

function Spine() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-8 -translate-x-1/2"
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-black/30" />
      <div className="absolute inset-y-0 left-0 w-full bg-[linear-gradient(90deg,transparent,rgba(0,0,0,0.18)_45%,rgba(0,0,0,0.18)_55%,transparent)]" />
      {[0.18, 0.5, 0.82].map((t) => (
        <span
          key={t}
          className="binder-ring absolute left-1/2 h-4 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ top: `${t * 100}%` }}
        />
      ))}
    </div>
  );
}
