import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { motion, useScroll, useTransform } from 'motion/react';
import { buttonVariants } from '@/components/ui/button';
import { AnimatedGroup } from '@/components/ui/animated-group';
import { cn } from '@/lib/utils';

const HeroCardStage = lazy(() =>
  import('../three/HeroCardStage').then((m) => ({ default: m.HeroCardStage }))
);

const transitionVariants = {
  item: {
    hidden: { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: 'spring' as const, bounce: 0.2, duration: 0.65 },
    },
  },
};

export function HeroSection() {
  const { scrollY } = useScroll();
  const stageOpacity = useTransform(scrollY, [0, 480], [1, 0]);
  const stageScale = useTransform(scrollY, [0, 480], [1, 0.92]);
  const stageRotateX = useTransform(scrollY, [0, 480], [0, 10]);
  const copyOpacity = useTransform(scrollY, [0, 320], [1, 0]);
  const copyY = useTransform(scrollY, [0, 320], [0, 28]);

  return (
    <div className="overflow-hidden">
      <section className="relative flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center px-4 pb-8 pt-4 sm:px-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(110,231,183,0.08),transparent_55%),radial-gradient(ellipse_at_50%_100%,rgba(91,196,212,0.05),transparent_40%)]" />

        <motion.div
          style={{ opacity: stageOpacity, scale: stageScale, rotateX: stageRotateX }}
          className="relative z-10 w-full max-w-5xl [transform-style:preserve-3d]"
        >
          <Suspense
            fallback={
              <div className="mx-auto flex h-[280px] items-center justify-center">
                <p className="font-display text-4xl font-bold text-ink-primary">
                  TCG<span className="text-accent">Tracker</span>
                </p>
              </div>
            }
          >
            <HeroCardStage />
          </Suspense>
        </motion.div>

        <motion.div style={{ opacity: copyOpacity, y: copyY }} className="relative z-10 w-full">
          <AnimatedGroup
            className="mx-auto mt-1 flex w-full max-w-xl flex-col items-center text-center sm:mt-2"
            variants={{
              container: {
                visible: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
              },
              ...transitionVariants,
            }}
          >
            <p className="max-w-md text-pretty text-base text-ink-secondary sm:text-lg">
              Live prices, vault holdings, AI grading, and pack rips — one command surface for your
              Pokemon collection.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/browse"
                className={cn(
                  buttonVariants({ size: 'lg' }),
                  'h-11 cursor-pointer gap-2 rounded-full px-6 text-base shadow-glow-accent'
                )}
              >
                Start browsing
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/vault"
                className={cn(
                  buttonVariants({ size: 'lg', variant: 'outline' }),
                  'h-11 cursor-pointer rounded-full border-foil/40 px-6 text-base text-foil hover:bg-foil/10'
                )}
              >
                Open vault
              </Link>
            </div>
          </AnimatedGroup>
        </motion.div>

        <motion.div
          style={{ opacity: copyOpacity }}
          className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2"
          aria-hidden
        >
          <ChevronDown className="h-5 w-5 animate-scroll-cue text-ink-muted" />
        </motion.div>
      </section>
    </div>
  );
}
