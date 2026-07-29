import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';

export interface ModalCardSceneProps {
  imageUrl?: string;
  className?: string;
}

/** CSS 3D card for inspect modals — instant tilt, no WebGL. */
export function ModalCardScene({ imageUrl, className }: ModalCardSceneProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    const el = ref.current;
    if (!el) return;

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      el.style.transform = `perspective(900px) rotateY(${x * 14}deg) rotateX(${-y * 10}deg)`;
    };
    const onLeave = () => {
      el.style.transform = 'perspective(900px) rotateY(0deg) rotateX(0deg)';
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [reducedMotion]);

  return (
    <div className={cn('flex h-48 items-center justify-center sm:h-56', className)}>
      <div
        ref={ref}
        className="relative h-[88%] w-auto max-w-[11rem] transition-transform duration-100 ease-out will-change-transform"
        style={{ transformStyle: 'preserve-3d' }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="h-full w-auto rounded-xl border border-border-subtle object-contain shadow-elevated"
            draggable={false}
          />
        ) : (
          <div className="h-full w-40 rounded-xl border border-foil/30 bg-gradient-to-br from-accent/40 via-foil/30 to-surface-raised shadow-glow-foil" />
        )}
        <div
          className="pointer-events-none absolute inset-0 rounded-xl opacity-30"
          style={{
            background:
              'linear-gradient(125deg, transparent 35%, rgba(255,255,255,0.4) 50%, transparent 65%)',
          }}
          aria-hidden
        />
      </div>
    </div>
  );
}
