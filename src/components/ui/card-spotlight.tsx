/**
 * Adapted from 21st.dev / Aceternity UI — Card Spotlight (Manu Arora)
 * https://21st.dev/@manuarora700/components/card-spotlight
 */
import * as React from 'react';
import { motion, useMotionTemplate, useMotionValue } from 'motion/react';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/hooks/useMotionPreferences';

type CardSpotlightProps = React.HTMLAttributes<HTMLDivElement> & {
  radius?: number;
  color?: string;
};

export function CardSpotlight({
  children,
  className,
  radius = 320,
  color = 'rgba(196, 180, 154, 0.14)',
  ...props
}: CardSpotlightProps) {
  const reduced = usePrefersReducedMotion();
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduced) return;
    const { left, top } = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - left);
    mouseY.set(e.clientY - top);
  };

  const maskImage = useMotionTemplate`radial-gradient(${radius}px circle at ${mouseX}px ${mouseY}px, white, transparent)`;

  return (
    <div
      onMouseMove={onMove}
      className={cn(
        'group/spotlight relative overflow-hidden rounded-md border border-border-subtle bg-surface-raised',
        className
      )}
      {...props}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-md opacity-0 transition-opacity duration-300 group-hover/spotlight:opacity-100"
        style={{
          background: color,
          maskImage,
          WebkitMaskImage: maskImage,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
