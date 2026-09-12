/**
 * Adapted from 21st.dev — Holo Card (Motiq / @rmahammad)
 * https://21st.dev/@rmahammad/components/holo-card
 *
 * Pointer-driven 3D tilt with a traveling foil sheet + contact shadow.
 */
import * as React from 'react';
import { motion, useMotionTemplate, useMotionValue, useSpring } from 'motion/react';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/hooks/useMotionPreferences';

type HoloCardProps = {
  children?: React.ReactNode;
  className?: string;
  maxTilt?: number;
  aspect?: number;
  imageUrl?: string;
  imageAlt?: string;
};

export function HoloCard({
  children,
  className,
  maxTilt = 14,
  aspect = 0.716,
  imageUrl,
  imageAlt = '',
}: HoloCardProps) {
  const reduced = usePrefersReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const rotateX = useSpring(useMotionValue(0), { stiffness: 220, damping: 28 });
  const rotateY = useSpring(useMotionValue(0), { stiffness: 220, damping: 28 });
  const glareX = useMotionValue(50);
  const glareY = useMotionValue(50);
  const shadeX = useSpring(useMotionValue(0), { stiffness: 180, damping: 24 });
  const shadeY = useSpring(useMotionValue(8), { stiffness: 180, damping: 24 });

  const foil = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.55) 0%, transparent 42%),
    linear-gradient(115deg,
      transparent 20%,
      rgba(196,180,154,0.22) 35%,
      rgba(168,180,192,0.28) 48%,
      rgba(212,175,120,0.18) 62%,
      transparent 78%)`;

  const onMove = (e: React.PointerEvent) => {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    rotateX.set(-(py - 0.5) * 2 * maxTilt);
    rotateY.set((px - 0.5) * 2 * maxTilt);
    glareX.set(px * 100);
    glareY.set(py * 100);
    shadeX.set((px - 0.5) * 18);
    shadeY.set(10 + (py - 0.5) * 10);
  };

  const onLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
    glareX.set(50);
    glareY.set(40);
    shadeX.set(0);
    shadeY.set(8);
  };

  return (
    <div
      className={cn('relative mx-auto w-full max-w-[18rem]', className)}
      style={{ perspective: 1200 }}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-6 bottom-[-10%] h-10 rounded-[100%] bg-black/50 blur-xl"
        style={{ x: shadeX, y: shadeY }}
      />
      <motion.div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
          aspectRatio: aspect,
        }}
        className="relative overflow-hidden rounded-[6px] border border-white/10 bg-surface-raised shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={imageAlt}
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        ) : null}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 mix-blend-soft-light"
          style={{ background: foil }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,236,210,0.12),transparent_55%)]" />
        {children ? (
          <div className="relative z-10 flex h-full flex-col justify-between p-4">{children}</div>
        ) : null}
      </motion.div>
    </div>
  );
}
