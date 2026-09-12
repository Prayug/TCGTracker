/**
 * Adapted from 21st.dev — Hero Gallery Scroll Animation (Systaliko UI / YoucefBnm)
 * https://21st.dev/@youcefbnm/components/hero-gallery-scroll-animation
 *
 * Primitives: ContainerScroll, BentoGrid, BentoCell, ContainerScale
 */
import * as React from 'react';
import { motion, motionValue, useScroll, useTransform, type MotionValue } from 'motion/react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const ZERO = motionValue(0);

const BentoGridContext = React.createContext<{
  scrollYProgress: MotionValue<number>;
} | null>(null);

export function ContainerScroll({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end end'],
  });

  return (
    <BentoGridContext.Provider value={{ scrollYProgress }}>
      <div ref={ref} className={cn('relative', className)} {...props}>
        {children}
      </div>
    </BentoGridContext.Provider>
  );
}

const bentoGridVariants = cva(
  'relative grid w-full gap-3 [&>*:first-child]:origin-top-right [&>*:nth-child(3)]:origin-bottom-right [&>*:nth-child(4)]:origin-top-right',
  {
    variants: {
      variant: {
        default: `
          grid-cols-8 grid-rows-[1fr_0.5fr_0.5fr_1fr]
          [&>*:first-child]:col-span-8 md:[&>*:first-child]:col-span-6 [&>*:first-child]:row-span-3
          [&>*:nth-child(2)]:col-span-2 md:[&>*:nth-child(2)]:row-span-2 [&>*:nth-child(2)]:hidden md:[&>*:nth-child(2)]:block
          [&>*:nth-child(3)]:col-span-2 md:[&>*:nth-child(3)]:row-span-2 [&>*:nth-child(3)]:hidden md:[&>*:nth-child(3)]:block
          [&>*:nth-child(4)]:col-span-4 md:[&>*:nth-child(4)]:col-span-3
          [&>*:nth-child(5)]:col-span-4 md:[&>*:nth-child(5)]:col-span-3
        `,
        threeCells: `
          grid-cols-2 grid-rows-2
          [&>*:first-child]:col-span-2
          [&>*:nth-child(4)]:hidden [&>*:nth-child(5)]:hidden
        `,
        fourCells: `
          grid-cols-3 grid-rows-2
          [&>*:first-child]:col-span-1
          [&>*:nth-child(2)]:col-span-2
          [&>*:nth-child(3)]:col-span-2
          [&>*:nth-child(5)]:hidden
        `,
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export const BentoGrid = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof bentoGridVariants>
>(({ variant, className, ...props }, ref) => (
  <div ref={ref} className={cn(bentoGridVariants({ variant }), className)} {...props} />
));
BentoGrid.displayName = 'BentoGrid';

export function BentoCell({
  children,
  className,
  ...props
}: React.ComponentProps<typeof motion.div>) {
  const ctx = React.useContext(BentoGridContext);
  const progress = ctx?.scrollYProgress ?? ZERO;
  const scale = useTransform(progress, [0, 0.8], [1, 0.72]);
  const opacity = useTransform(progress, [0, 0.7], [1, 0.35]);

  return (
    <motion.div style={ctx ? { scale, opacity } : undefined} className={cn(className)} {...props}>
      {children}
    </motion.div>
  );
}

export function ContainerScale({
  children,
  className,
  ...props
}: React.ComponentProps<typeof motion.div>) {
  const ctx = React.useContext(BentoGridContext);
  const progress = ctx?.scrollYProgress ?? ZERO;
  const scale = useTransform(progress, [0, 0.5], [1, 0.92]);
  const opacity = useTransform(progress, [0, 0.4, 0.85], [1, 1, 0]);
  const y = useTransform(progress, [0, 0.5], [0, -40]);

  return (
    <motion.div
      style={ctx ? { scale, opacity, y } : undefined}
      className={cn('flex flex-col items-center justify-center', className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
