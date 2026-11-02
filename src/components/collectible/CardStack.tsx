import { useCallback, useEffect, useMemo, useState, type PointerEvent } from 'react';
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { HolographicCard, type CollectibleSource } from './HolographicCard';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';
import { cn } from '@/lib/utils';

export interface StackItem {
  key: string;
  card: CollectibleSource;
}

interface Slot {
  x: string;
  y: string;
  rotate: number;
  scale: number;
  z: number;
  depth: number;
}

const WIDE: Slot[] = [
  { x: '0%', y: '0%', rotate: -3, scale: 1, z: 50, depth: 1 },
  { x: '-46%', y: '7%', rotate: -12, scale: 0.8, z: 40, depth: 0.6 },
  { x: '47%', y: '4%', rotate: 10, scale: 0.82, z: 39, depth: 0.6 },
  { x: '-84%', y: '16%', rotate: -19, scale: 0.64, z: 30, depth: 0.3 },
  { x: '86%', y: '13%', rotate: 17, scale: 0.64, z: 29, depth: 0.3 },
];

const COMPACT: Slot[] = [
  { x: '0%', y: '0%', rotate: -2, scale: 1, z: 50, depth: 1 },
  { x: '-30%', y: '5%', rotate: -9, scale: 0.84, z: 40, depth: 0.6 },
  { x: '31%', y: '4%', rotate: 8, scale: 0.84, z: 39, depth: 0.6 },
];

/**
 * A layered stack of real cards. The front card dominates; the rest sit
 * behind at depth. Pointer movement shifts the layers by depth, hover lifts a
 * card, dragging the front card sideways (or the arrows) cycles the stack, and
 * selecting the front card hands it to `onOpen` for a shared-element preview.
 */
export function CardStack({
  items,
  compact = false,
  onOpen,
  layoutPrefix,
  onFrontChange,
  className,
  cardClassName,
  hiddenKey,
}: {
  items: StackItem[];
  compact?: boolean;
  onOpen?: (item: StackItem, layoutId: string) => void;
  layoutPrefix: string;
  onFrontChange?: (item: StackItem) => void;
  className?: string;
  /** Width of a card, e.g. "w-[min(300px,26vw)]". */
  cardClassName?: string;
  /** Key of a card currently shown in a spotlight (its stack copy steps aside). */
  hiddenKey?: string | null;
}) {
  const reduced = usePrefersReducedMotion();
  const slots = compact ? COMPACT : WIDE;
  const visible = Math.min(items.length, slots.length);
  const [order, setOrder] = useState<number[]>(() => items.map((_, i) => i));
  const [hovered, setHovered] = useState<string | null>(null);

  // Reset ordering when the item set changes.
  const signature = items.map((i) => i.key).join('|');
  useEffect(() => {
    setOrder(items.map((_, i) => i));
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  const front = items[order[0]];
  useEffect(() => {
    if (front) onFrontChange?.(front);
  }, [front, onFrontChange]);

  const cycle = useCallback(
    (dir: 1 | -1) =>
      setOrder((o) =>
        o.length < 2 ? o : dir === 1 ? [...o.slice(1), o[0]] : [o[o.length - 1], ...o.slice(0, -1)]
      ),
    []
  );
  const bringToFront = (idx: number) => setOrder((o) => [idx, ...o.filter((i) => i !== idx)]);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 80, damping: 18 });
  const sy = useSpring(my, { stiffness: 80, damping: 18 });

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduced || e.pointerType === 'touch') return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width - 0.5) * 2);
    my.set(((e.clientY - r.top) / r.height - 0.5) * 2);
  };

  const rank = useMemo(() => {
    const m = new Map<number, number>();
    order.forEach((itemIdx, pos) => m.set(itemIdx, pos));
    return m;
  }, [order]);

  if (!items.length) return null;

  return (
    <div
      className={cn('relative', className)}
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured cards"
      onPointerMove={onMove}
      onPointerLeave={() => {
        mx.set(0);
        my.set(0);
      }}
    >
      <div className="relative mx-auto h-full w-full">
        {items.map((item, idx) => {
          const pos = rank.get(idx) ?? 0;
          if (pos >= visible) return null;
          const slot = slots[pos];
          const isFront = pos === 0;
          const layoutId = `${layoutPrefix}-${item.key}`;
          return (
            <ParallaxLayer
              key={item.key}
              mx={sx}
              my={sy}
              depth={slot.depth}
              reduced={reduced}
              z={hovered === item.key && !isFront ? 45 : slot.z}
            >
              <motion.div
                className={cn('pointer-events-auto relative', cardClassName)}
                initial={reduced ? false : { opacity: 0, x: '0%', y: '24%', rotate: 0, scale: 0.7 }}
                animate={{
                  opacity: hiddenKey === item.key ? 0 : 1,
                  x: slot.x,
                  y: hovered === item.key && !isFront ? `calc(${slot.y} - 6%)` : slot.y,
                  rotate: hovered === item.key && !isFront ? slot.rotate * 0.6 : slot.rotate,
                  scale: hovered === item.key && !isFront ? slot.scale + 0.05 : slot.scale,
                }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : {
                        type: 'spring',
                        stiffness: 170,
                        damping: 22,
                        delay: 0,
                        opacity: { duration: 0.35 },
                      }
                }
                drag={isFront && !reduced ? 'x' : false}
                dragSnapToOrigin
                dragElastic={0.6}
                dragDirectionLock
                // Horizontal drags cycle; vertical swipes still scroll the page on touch.
                style={isFront ? { touchAction: 'pan-y' } : undefined}
                whileDrag={{
                  scale: slot.scale * 1.03,
                  rotate: slot.rotate + 3,
                  cursor: 'grabbing',
                }}
                onDragEnd={(_, info) => {
                  if (Math.abs(info.offset.x) > 70 || Math.abs(info.velocity.x) > 500)
                    cycle(info.offset.x < 0 ? 1 : -1);
                }}
                onHoverStart={() => setHovered(item.key)}
                onHoverEnd={() => setHovered((h) => (h === item.key ? null : h))}
              >
                {isFront ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-[8%] -z-[1] rounded-[12%] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--hero-tone,#7f9bff)_45%,transparent),transparent)] blur-xl"
                  />
                ) : null}
                <HolographicCard
                  card={item.card}
                  layoutId={layoutId}
                  level={isFront ? 'showcase' : 'featured'}
                  size={isFront ? 'large' : 'small'}
                  priority={pos < 3}
                  label={
                    isFront ? `Preview ${item.card.name}` : `Bring ${item.card.name} to the front`
                  }
                  onSelect={() => (isFront ? onOpen?.(item, layoutId) : bringToFront(idx))}
                />
              </motion.div>
            </ParallaxLayer>
          );
        })}
      </div>
      {items.length > 1 ? (
        <div
          className="absolute inset-x-0 bottom-0 z-[60] flex items-center justify-center gap-3"
          role="toolbar"
          aria-label="Stack controls. Left and right arrow keys cycle the cards."
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') cycle(1);
            else if (e.key === 'ArrowLeft') cycle(-1);
          }}
        >
          <button
            type="button"
            onClick={() => cycle(-1)}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/30 text-white backdrop-blur hover:bg-black/50"
            aria-label="Previous card"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <div className="flex items-center gap-0.5">
            {items.map((item, idx) => (
              <button
                key={item.key}
                type="button"
                onClick={() => bringToFront(idx)}
                aria-current={order[0] === idx ? 'true' : undefined}
                aria-label={`Show ${item.card.name}, ${idx + 1} of ${items.length}`}
                className="group grid h-8 place-items-center px-1"
              >
                <span
                  className={cn(
                    'block h-1.5 rounded-full transition-all duration-300',
                    order[0] === idx
                      ? 'w-7 bg-[var(--hero-tone,#fff)]'
                      : 'w-1.5 bg-white/35 group-hover:bg-white/70'
                  )}
                />
              </button>
            ))}
            <span
              className="ml-1.5 font-mono text-[11.5px] tabular-nums text-white/55"
              aria-live="polite"
            >
              {(order[0] ?? 0) + 1} / {items.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => cycle(1)}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/30 text-white backdrop-blur hover:bg-black/50"
            aria-label="Next card"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ParallaxLayer({
  mx,
  my,
  depth,
  reduced,
  z,
  children,
}: {
  mx: MotionValue<number>;
  my: MotionValue<number>;
  depth: number;
  reduced: boolean;
  z: number;
  children: React.ReactNode;
}) {
  const x = useTransform(mx, (v) => (reduced ? 0 : v * 22 * (1.2 - depth)));
  const y = useTransform(my, (v) => (reduced ? 0 : v * 14 * (1.2 - depth)));
  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0 top-0 flex justify-center"
      style={{ x, y, zIndex: z }}
    >
      {children}
    </motion.div>
  );
}
