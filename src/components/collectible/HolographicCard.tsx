import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { CardArt, type CardArtSource } from '../exchange/CardArt';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';
import { finishOf, type Finish, type FinishSource } from './finish';
import { CardBack } from './CardBack';
import { cn } from '@/lib/utils';

export type CardLevel = 'standard' | 'featured' | 'showcase';

export type CollectibleSource = CardArtSource & FinishSource & { id?: string | null };

const TILT: Record<CardLevel, number> = { standard: 0, featured: 11, showcase: 16 };
const LIFT: Record<CardLevel, number> = { standard: -6, featured: -10, showcase: -4 };
const SPRING = { stiffness: 220, damping: 22, mass: 0.6 };

/**
 * The TCGTracker signature card. One physical object with three levels:
 *  - standard: lifts and deepens its shadow on hover, no tilt;
 *  - featured: tilts toward the pointer with a moving glare;
 *  - showcase: stronger tilt plus a foil layer that follows the print's real finish.
 * Foil appears only when the catalog finish is a foil (see finishOf).
 * Reduced motion: no tilt or lift; the foil is shown still.
 */
export function HolographicCard({
  card,
  level = 'featured',
  finish: finishOverride,
  layoutId,
  onSelect,
  label,
  flipped = false,
  size = 'small',
  priority = false,
  className,
  artClassName,
  interactive = true,
  elevated = true,
}: {
  card: CollectibleSource;
  level?: CardLevel;
  finish?: Finish;
  layoutId?: string;
  onSelect?: () => void;
  /** Accessible name when the card is a button. */
  label?: string;
  flipped?: boolean;
  size?: 'small' | 'large';
  priority?: boolean;
  className?: string;
  artClassName?: string;
  /** Turn off pointer response (e.g. inside a dragging stack). */
  interactive?: boolean;
  /** Draw the floor shadow. */
  elevated?: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  const finish = finishOverride ?? finishOf(card);
  const tiltLimit = reduced || !interactive ? 0 : TILT[level];
  const showFoil = finish !== 'none' && level !== 'standard';

  // Pointer position on the card, 0..1. Rest = centre.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const hover = useMotionValue(0);
  const sx = useSpring(px, SPRING);
  const sy = useSpring(py, SPRING);
  const sh = useSpring(hover, { stiffness: 260, damping: 26 });

  const rotateY = useTransform(sx, [0, 1], [-tiltLimit, tiltLimit]);
  const rotateX = useTransform(sy, [0, 1], [tiltLimit, -tiltLimit]);
  const lift = useTransform(sh, [0, 1], [0, reduced || !interactive ? 0 : LIFT[level]]);
  const scale = useTransform(sh, [0, 1], [1, reduced || !interactive ? 1 : 1.025]);

  const gx = useTransform(sx, (v) => v * 100);
  const gy = useTransform(sy, (v) => v * 100);
  const glare = useMotionTemplate`radial-gradient(farthest-corner circle at ${gx}% ${gy}%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.14) 28%, rgba(0,0,0,0.18) 85%)`;
  const glareOpacity = useTransform(sh, [0, 1], [0, level === 'standard' ? 0.18 : 0.55]);
  const foilPos = useMotionTemplate`${useTransform(sx, [0, 1], [0, 100])}% ${useTransform(sy, [0, 1], [0, 100])}%`;
  const foilOpacity = useTransform(sh, [0, 1], [reduced ? 0.42 : 0.28, 0.78]);

  const shadowX = useTransform(sx, [0, 1], [14, -14]);
  const shadowY = useTransform(sh, [0, 1], [10, 22]);
  const shadowBlur = useTransform(sh, [0, 1], [18, 34]);
  const shadow = useMotionTemplate`${shadowX}px ${shadowY}px ${shadowBlur}px -12px rgba(5,8,15,0.6), 0 2px 4px rgba(5,8,15,0.25)`;

  const ref = useRef<HTMLDivElement>(null);
  const [pressed, setPressed] = useState(false);

  const track = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (!interactive) return;
      const el = ref.current;
      if (!el) return;
      if (e.pointerType === 'touch' && e.buttons === 0) return;
      const r = el.getBoundingClientRect();
      px.set(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
      py.set(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
      hover.set(1);
    },
    [hover, interactive, px, py]
  );
  const rest = useCallback(() => {
    px.set(0.5);
    py.set(0.5);
    hover.set(0);
    setPressed(false);
  }, [hover, px, py]);

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (!onSelect) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  const Tag = onSelect ? motion.button : motion.div;

  return (
    <motion.div
      layoutId={layoutId}
      className={cn('relative [perspective:1100px]', className)}
      style={{ zIndex: 'auto' }}
      transition={{ type: 'spring', stiffness: 260, damping: 30 }}
    >
      <Tag
        ref={ref as never}
        type={onSelect ? 'button' : undefined}
        aria-label={onSelect ? (label ?? `Open ${card.name}`) : undefined}
        onClick={onSelect}
        onKeyDown={onSelect ? onKey : undefined}
        onPointerMove={track}
        onPointerDown={(e: PointerEvent<HTMLElement>) => {
          setPressed(true);
          track(e);
        }}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={rest}
        onPointerCancel={rest}
        onFocus={() => interactive && hover.set(0.6)}
        onBlur={rest}
        className={cn(
          'holo-card group/card relative block w-full touch-pan-y select-none text-left [transform-style:preserve-3d]',
          onSelect && 'cursor-pointer rounded-[4.6%/3.3%] focus-visible:outline-offset-4'
        )}
        style={{
          rotateX,
          rotateY,
          y: lift,
          scale: pressed && !reduced ? 0.985 : scale,
          boxShadow: elevated ? shadow : undefined,
        }}
        data-finish={finish}
        data-level={level}
      >
        <motion.div
          className="relative [transform-style:preserve-3d]"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 18 }}
        >
          {/* Front */}
          <div className="relative [backface-visibility:hidden]">
            <CardArt
              card={card}
              size={size}
              priority={priority}
              flat
              className={cn('rounded-[4.6%/3.3%]', artClassName)}
            />
            {showFoil ? <FoilLayer finish={finish} pos={foilPos} opacity={foilOpacity} /> : null}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[4.6%/3.3%] mix-blend-overlay"
              style={{ backgroundImage: glare, opacity: glareOpacity }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[4.6%/3.3%] ring-1 ring-inset ring-black/10 dark:ring-white/10"
            />
          </div>
          {/* Back */}
          <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <CardBack />
          </div>
        </motion.div>
      </Tag>
    </motion.div>
  );
}

function FoilLayer({
  finish,
  pos,
  opacity,
}: {
  finish: Finish;
  pos: MotionValue<string>;
  opacity: MotionValue<number>;
}) {
  return (
    <motion.div
      aria-hidden
      className={cn(
        'foil pointer-events-none absolute inset-0 rounded-[4.6%/3.3%]',
        `foil-${finish}`
      )}
      style={{ backgroundPosition: pos, opacity }}
    />
  );
}
