import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUpRight, Package } from 'lucide-react';
import { motion } from 'motion/react';
import { BentoCell, BentoGrid } from '@/components/blocks/hero-gallery-scroll-animation';
import { usePrefersReducedMotion } from '@/hooks/useMotionPreferences';
import { cn } from '@/lib/utils';

export function scrollToMarketPulse(e?: { preventDefault?: () => void }) {
  e?.preventDefault?.();
  document.getElementById('market-pulse')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Specimen cards — Pokémon TCG CDN (public art). */
const SPECIMENS = [
  'https://images.pokemontcg.io/swsh12pt5/160_hires.png',
  'https://images.pokemontcg.io/swsh7/215_hires.png',
  'https://images.pokemontcg.io/swsh9/18_hires.png',
  'https://images.pokemontcg.io/swsh10/174_hires.png',
  'https://images.pokemontcg.io/swsh11/TG30_hires.png',
];

/**
 * Premium home hero — adapted from 21st.dev Hero Gallery Scroll (Systaliko).
 * Full-bleed specimen bento + brand-first copy. No mint SaaS chrome.
 */
export function HomeHero() {
  const reduced = usePrefersReducedMotion();

  return (
    <section
      aria-label="Welcome"
      className="relative min-h-[min(92dvh,52rem)] overflow-hidden border-b border-border-subtle"
    >
      {/* Gallery atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_18%,rgba(255,236,210,0.08),transparent_42%),radial-gradient(ellipse_at_80%_60%,rgba(168,180,192,0.05),transparent_40%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative z-10 mx-auto grid min-h-[min(92dvh,52rem)] max-w-7xl items-center gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12 lg:px-10">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-20 max-w-xl"
        >
          <p className="font-display text-[clamp(2.75rem,7vw,4.5rem)] font-semibold leading-[0.95] tracking-[-0.03em] text-ink-primary">
            TCG Tracker
          </p>
          <h1 className="mt-5 max-w-[18ch] font-sans text-[clamp(1.35rem,2.6vw,1.85rem)] font-medium leading-snug tracking-tight text-ink-secondary">
            Live prices and a quiet vault for serious collectors.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-muted sm:text-[0.95rem]">
            Market marks, graded comps, and holdings — presented like specimens, not a dashboard.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/vault"
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md bg-accent px-6 text-sm font-semibold text-primary-foreground transition-colors duration-200 hover:bg-accent-hover"
            >
              Open vault
            </Link>
            <Link
              to="/browse"
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-transparent px-5 text-sm font-semibold text-ink-primary transition-colors hover:border-accent/50 hover:text-accent"
            >
              Browse catalog
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={scrollToMarketPulse}
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-foil"
            >
              Today&apos;s market
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
          <Link
            to="/packs"
            className="mt-6 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-ink-muted transition-colors hover:text-accent"
          >
            <Package className="h-3.5 w-3.5" />
            Pack simulator
          </Link>
        </motion.div>

        <div className={cn('relative h-[min(58vh,28rem)] w-full lg:h-[min(70vh,34rem)]')}>
          <BentoGrid variant="default" className="h-full p-0">
            {SPECIMENS.map((src, index) => (
              <BentoCell
                key={src}
                className="overflow-hidden rounded-md border border-white/[0.06] bg-surface-raised shadow-[0_20px_50px_rgba(0,0,0,0.45)]"
              >
                <motion.img
                  src={src}
                  alt=""
                  initial={reduced ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.65, delay: 0.08 * index, ease: [0.16, 1, 0.3, 1] }}
                  className="size-full object-cover object-center"
                  loading={index === 0 ? 'eager' : 'lazy'}
                />
              </BentoCell>
            ))}
          </BentoGrid>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(7,7,8,0.55)_100%)]"
          />
        </div>
      </div>
    </section>
  );
}
