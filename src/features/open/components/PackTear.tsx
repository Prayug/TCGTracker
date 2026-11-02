import { useRef, useState } from 'react';
import { motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { Scissors } from 'lucide-react';

/**
 * A sealed foil pack you open by dragging along the crimp at the top (or
 * with the button). Past the halfway point the strip tears away and the
 * cards slide up out of the wrapper; then `onOpened` hands over to the fan.
 */
export function PackTear({
  title,
  code,
  count,
  onOpened,
}: {
  title: string;
  code: string;
  count: number;
  onOpened: () => void;
}) {
  const reduce = useReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const pull = useMotionValue(0); // 0..1 across the crimp
  const [torn, setTorn] = useState(false);
  const cutWidth = useTransform(pull, (v) => `${Math.round(v * 100)}%`);

  const tear = () => {
    if (torn) return;
    setTorn(true);
    window.setTimeout(onOpened, reduce ? 0 : 900);
  };

  const onPointer = (e: React.PointerEvent) => {
    if (torn || !track.current || e.buttons !== 1) return;
    const r = track.current.getBoundingClientRect();
    const v = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    if (v > pull.get()) pull.set(v);
    if (v > 0.55) tear();
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 py-6">
      <div className="relative" style={{ perspective: 900 }}>
        {/* Cards waiting inside */}
        <motion.div
          aria-hidden
          className="absolute inset-x-[12%] top-[10%] h-[72%] rounded-[8px] bg-gradient-to-b from-[#f6f1e4] to-[#d9d2bf] shadow-lg"
          initial={false}
          animate={torn ? { y: reduce ? 0 : -110, opacity: 1 } : { y: 0, opacity: 0.9 }}
          transition={{ type: 'spring', stiffness: 120, damping: 14, delay: 0.25 }}
        />
        <motion.div
          className="relative h-[22rem] w-[14rem] overflow-hidden rounded-[14px] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8)] sm:h-[25rem] sm:w-[16rem]"
          initial={reduce ? false : { rotateY: -18, y: 20, opacity: 0 }}
          animate={{ rotateY: torn ? 0 : [-6, 6, -6], y: torn ? 12 : 0, opacity: 1 }}
          transition={
            torn
              ? { duration: 0.6 }
              : {
                  rotateY: { duration: 5, repeat: Infinity, ease: 'easeInOut' },
                  y: { duration: 0.6 },
                  opacity: { duration: 0.6 },
                }
          }
          style={{
            background:
              'linear-gradient(150deg,#1d2b5a 0%,#2f56e6 40%,#7f9bff 55%,#2f56e6 70%,#0f1736 100%)',
          }}
        >
          <span
            aria-hidden
            className="foil foil-rainbow pointer-events-none absolute inset-0 opacity-50 mix-blend-overlay"
          />
          <span className="absolute inset-x-0 top-[26%] text-center font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] text-white drop-shadow">
            {title}
          </span>
          <span className="absolute inset-x-0 top-[44%] text-center font-mono text-[12px] uppercase tracking-[0.2em] text-white/75">
            {code} · {count} cards
          </span>
          {/* Bottom crimp */}
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-6 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.25)_0_3px,transparent_3px_7px)]"
          />
          {/* Top crimp: the strip that tears off */}
          <motion.div
            ref={track}
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            className="absolute inset-x-0 top-0 h-10 cursor-ew-resize touch-none"
            animate={
              torn
                ? {
                    y: reduce ? -60 : [-0, -30, -140],
                    rotate: reduce ? 0 : [0, -8, -22],
                    opacity: [1, 1, 0],
                  }
                : {}
            }
            transition={{ duration: 0.7, ease: 'easeOut' }}
          >
            <span
              aria-hidden
              className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.32)_0_3px,transparent_3px_7px)]"
            />
            <motion.span
              aria-hidden
              className="absolute bottom-0 left-0 h-[3px] bg-white shadow-[0_0_10px_2px_rgba(255,255,255,0.7)]"
              style={{ width: cutWidth }}
            />
          </motion.div>
        </motion.div>
      </div>
      <div className="mt-4 flex flex-col items-center gap-2 text-center">
        <p className="text-[14px] text-ink-secondary">
          {torn ? 'Opening…' : 'Drag across the top of the pack to tear it open'}
        </p>
        <button type="button" onClick={tear} disabled={torn} className="btn-secondary h-9">
          <Scissors className="h-4 w-4" aria-hidden />
          Tear open
        </button>
      </div>
    </div>
  );
}
