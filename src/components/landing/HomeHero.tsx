/**
 * Adapted from 21st.dev — Scroll Over Hero (Ruixen UI)
 * https://21st.dev/@ruixen.ui/components/scroll-over-hero
 *
 * Pinned brand stage; specimen panel rises and overlaps on scroll.
 * Foil Gallery tokens — champagne metal, museum void — no mint / purple / binder desk.
 */
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, useReducedMotion } from 'motion/react';
import { useRef } from 'react';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function scrollToMarketPulse(e?: { preventDefault?: () => void }) {
  e?.preventDefault?.();
  document.getElementById('market-pulse')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const SPECIMENS = [
  {
    src: 'https://images.pokemontcg.io/swsh7/215_hires.png',
    alt: 'Umbreon VMAX',
    className: 'left-[8%] top-[12%] w-[38%] -rotate-[8deg] sm:left-[12%] sm:w-[32%]',
    z: 1,
  },
  {
    src: 'https://images.pokemontcg.io/swsh12pt5/160_hires.png',
    alt: 'Pikachu VMAX',
    className: 'left-1/2 top-[4%] w-[42%] -translate-x-1/2 sm:w-[34%]',
    z: 3,
  },
  {
    src: 'https://images.pokemontcg.io/swsh9/18_hires.png',
    alt: 'Charizard VSTAR',
    className: 'right-[8%] top-[14%] w-[38%] rotate-[7deg] sm:right-[12%] sm:w-[32%]',
    z: 2,
  },
] as const;

export function HomeHero() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });

  const panelY = useTransform(scrollYProgress, [0, 0.55], ['4%', '-6%']);
  const panelScale = useTransform(scrollYProgress, [0, 0.55], [0.96, 1.02]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.3, 0.55], [1, 0.4, 0.08]);
  const titleY = useTransform(scrollYProgress, [0, 0.55], [0, -64]);
  const glowOpacity = useTransform(scrollYProgress, [0, 0.4], [0.55, 1]);

  return (
    <section
      ref={ref}
      aria-label="Welcome"
      className={cn(
        'relative isolate border-b border-border-subtle',
        reduced ? 'min-h-[min(92dvh,48rem)]' : 'h-[185vh]'
      )}
    >
      <div
        className={cn(
          'relative flex w-full flex-col items-center justify-center overflow-hidden',
          reduced ? 'min-h-[min(92dvh,48rem)]' : 'sticky top-0 h-dvh'
        )}
      >
        {/* Gallery key light */}
        <motion.div
          aria-hidden
          style={reduced ? undefined : { opacity: glowOpacity }}
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_28%,rgba(255,232,200,0.11),transparent_46%),radial-gradient(ellipse_at_50%_100%,rgba(168,180,192,0.06),transparent_42%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)',
            backgroundSize: '72px 72px',
            maskImage: 'radial-gradient(ellipse at 50% 40%, black 20%, transparent 70%)',
          }}
        />

        {/* Pinned brand stage */}
        <motion.div
          style={reduced ? undefined : { opacity: titleOpacity, y: titleY }}
          className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-6 pb-[32vh] pt-12 text-center sm:px-8 sm:pb-[34vh] sm:pt-14"
        >
          <p className="font-display text-[clamp(3.25rem,11vw,7rem)] font-semibold leading-[0.9] tracking-[-0.035em] text-ink-primary">
            TCG Tracker
          </p>
          <h1 className="mt-6 max-w-[22ch] text-balance text-[clamp(1.05rem,2.2vw,1.35rem)] font-medium leading-snug tracking-tight text-ink-secondary">
            The market mark for cards you actually own.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-muted">
            Live prices in a quiet vault — specimens first, spreadsheet never.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/vault"
              className="inline-flex h-11 cursor-pointer items-center rounded-md bg-accent px-7 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent-hover"
            >
              Open vault
            </Link>
            <Link
              to="/browse"
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border border-border-strong px-5 text-sm font-semibold text-ink-primary transition-colors hover:border-accent/45 hover:text-accent"
            >
              Browse
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          <button
            type="button"
            onClick={scrollToMarketPulse}
            className="mt-8 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium uppercase tracking-[0.16em] text-ink-muted transition-colors hover:text-foil"
          >
            Market today
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </motion.div>

        {/* Rising specimen panel — overlaps brand on scroll */}
        <motion.div
          style={
            reduced
              ? undefined
              : {
                  y: panelY,
                  scale: panelScale,
                }
          }
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 z-20 mx-auto h-[min(58vh,28rem)] w-full max-w-5xl px-4 sm:px-8',
            reduced && 'relative mt-2 h-[min(48vh,24rem)]'
          )}
        >
          <div className="relative h-full w-full">
            {SPECIMENS.map((card) => (
              <div
                key={card.src}
                className={cn('absolute aspect-[5/7]', card.className)}
                style={{ zIndex: card.z }}
              >
                <div className="h-full w-full overflow-hidden rounded-[10px] border border-white/10 bg-surface-raised shadow-[0_28px_80px_rgba(0,0,0,0.65)]">
                  <img
                    src={card.src}
                    alt={card.alt}
                    className="h-full w-full object-cover"
                    draggable={false}
                    loading="eager"
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,transparent_30%,rgba(255,255,255,0.14)_48%,transparent_62%)] mix-blend-soft-light"
                  />
                </div>
              </div>
            ))}
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--surface-base)] to-transparent"
          />
        </motion.div>
      </div>
    </section>
  );
}
