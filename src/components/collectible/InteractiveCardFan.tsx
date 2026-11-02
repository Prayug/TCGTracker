import { useRef, useState, type KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import { HolographicCard, type CollectibleSource } from './HolographicCard';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';
import { cn } from '@/lib/utils';

export interface FanItem {
  key: string;
  card: CollectibleSource;
  label?: string;
}

/**
 * A hand of cards fanned from a pivot below. Hover lifts a card and eases its
 * neighbours apart; click, arrow keys, or dragging across the hand selects one.
 * Selection is controlled so the caller can show the matching details.
 */
export function InteractiveCardFan({
  items,
  selectedKey,
  onSelect,
  className,
  cardWidth = 150,
  spread = 46,
}: {
  items: FanItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  className?: string;
  cardWidth?: number;
  /** Total arc in degrees. */
  spread?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const n = items.length;
  const mid = (n - 1) / 2;
  const step = n > 1 ? spread / (n - 1) : 0;
  const gap = cardWidth * 0.36;
  const sel = items.findIndex((i) => i.key === selectedKey);

  const pickAt = (clientX: number) => {
    const el = ref.current;
    if (!el || n === 0) return;
    const r = el.getBoundingClientRect();
    const rel = (clientX - (r.left + r.width / 2)) / gap + mid;
    const idx = Math.max(0, Math.min(n - 1, Math.round(rel)));
    if (items[idx] && items[idx].key !== selectedKey) onSelect(items[idx].key);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = Math.max(
      0,
      Math.min(n - 1, (sel < 0 ? 0 : sel) + (e.key === 'ArrowRight' ? 1 : -1))
    );
    onSelect(items[next].key);
    const btn = ref.current?.querySelectorAll<HTMLButtonElement>('button[data-fan]')[next];
    btn?.focus();
  };

  return (
    <motion.div
      ref={ref}
      role="group"
      aria-label="Card fan. Use the arrow keys to move through the cards."
      onKeyDown={onKey}
      onPan={(_, info) => !reduced && pickAt(info.point.x - window.scrollX)}
      className={cn('relative touch-pan-y select-none', className)}
      style={{ height: cardWidth * 1.4 * 1.32 }}
    >
      {items.map((item, i) => {
        const offset = i - mid;
        const isSel = i === sel;
        const isHover = i === hover;
        const push =
          hover == null || isHover
            ? 0
            : Math.sign(i - hover) * (Math.abs(i - hover) === 1 ? 16 : 8);
        return (
          <motion.div
            key={item.key}
            className="absolute bottom-[14%] left-1/2"
            style={{
              width: cardWidth,
              marginLeft: -cardWidth / 2,
              transformOrigin: '50% 140%',
              zIndex: isHover ? 60 : isSel ? 50 : 10 + i,
            }}
            initial={reduced ? false : { rotate: 0, x: 0, y: 40, opacity: 0 }}
            animate={{
              rotate: offset * step,
              x: offset * gap + push,
              y: isSel ? -34 : isHover ? -22 : Math.abs(offset) * 4,
              opacity: 1,
              scale: isSel ? 1.06 : 1,
            }}
            transition={
              reduced ? { duration: 0 } : { type: 'spring', stiffness: 240, damping: 24, delay: 0 }
            }
            onHoverStart={() => setHover(i)}
            onHoverEnd={() => setHover((h) => (h === i ? null : h))}
          >
            <button
              type="button"
              data-fan
              tabIndex={isSel || (sel < 0 && i === 0) ? 0 : -1}
              aria-pressed={isSel}
              aria-label={item.label ?? item.card.name}
              onClick={() => onSelect(item.key)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover((h) => (h === i ? null : h))}
              className={cn(
                'block w-full rounded-[4.6%/3.3%] focus-visible:outline-offset-4',
                isSel && 'ring-2 ring-white/80 ring-offset-2 ring-offset-transparent'
              )}
            >
              <HolographicCard card={item.card} level={isSel ? 'showcase' : 'standard'} />
            </button>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
