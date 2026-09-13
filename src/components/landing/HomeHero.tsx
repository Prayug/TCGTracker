/**
 * Home hero — orbiting foil card ring as the dominant stage,
 * brand + CTA held in a clear center hierarchy (Foil Gallery tokens).
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { ScrollWorld } from '@/components/three/ScrollWorld';
import { cn } from '@/lib/utils';

export function scrollToMarketPulse(e?: { preventDefault?: () => void }) {
  e?.preventDefault?.();
  document.getElementById('market-pulse')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Fallback stills when WebGL / motion is off — keeps the “ring” idea without animation. */
const STATIC_RING = [
  {
    src: 'https://images.pokemontcg.io/swsh7/215_hires.png',
    alt: 'Umbreon VMAX',
    className: 'left-[4%] top-[18%] w-[22%] -rotate-[14deg] opacity-70',
  },
  {
    src: 'https://images.pokemontcg.io/base1/4_hires.png',
    alt: 'Charizard',
    className: 'left-[22%] top-[8%] w-[20%] -rotate-[4deg] opacity-55',
  },
  {
    src: 'https://images.pokemontcg.io/sv8pt5/161_hires.png',
    alt: 'Umbreon ex',
    className: 'left-1/2 top-[4%] w-[24%] -translate-x-1/2 opacity-80',
  },
  {
    src: 'https://images.pokemontcg.io/swsh7/218_hires.png',
    alt: 'Rayquaza VMAX',
    className: 'right-[22%] top-[9%] w-[20%] rotate-[5deg] opacity-55',
  },
  {
    src: 'https://images.pokemontcg.io/sv4pt5/232_hires.png',
    alt: 'Mew ex',
    className: 'right-[4%] top-[18%] w-[22%] rotate-[12deg] opacity-70',
  },
] as const;

export function HomeHero() {
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  // Static progress: WorldRig adds its own slow time-based rotation.
  const progressRef = useRef(0);

  useEffect(() => {
    setReady(true);
  }, []);

  const showRing = !reduced && ready;

  return (
    <section
      aria-label="Welcome"
      className="relative isolate min-h-[min(92dvh,54rem)] overflow-hidden border-b border-border-subtle"
    >
      {/* Depth void */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,rgba(255,232,200,0.09),transparent_42%),radial-gradient(ellipse_at_50%_100%,rgba(168,180,192,0.05),transparent_40%)]"
      />

      {/* Dominant card ring */}
      {showRing ? (
        <div className="absolute inset-0 scale-[1.08] sm:scale-100">
          <ScrollWorld className="!absolute inset-0 h-full w-full" progressRef={progressRef} />
        </div>
      ) : (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {STATIC_RING.map((card) => (
            <div key={card.src} className={cn('absolute aspect-[5/7]', card.className)}>
              <div className="h-full w-full overflow-hidden rounded-md border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
                <img
                  src={card.src}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                  loading="eager"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Readability scrims — soft center so the ring stays glamorous, edges hold the brand */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_48%,rgba(7,7,8,0.42)_0%,rgba(7,7,8,0.12)_34%,rgba(7,7,8,0.58)_72%,rgba(7,7,8,0.82)_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[var(--surface-base)] via-[var(--surface-base)]/45 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[var(--surface-base)] via-[var(--surface-base)]/65 to-transparent"
      />

      {/* Brand + CTA — center hierarchy, no badge clutter */}
      <div className="relative z-10 flex min-h-[min(92dvh,54rem)] flex-col items-center justify-center px-6 py-20 text-center sm:px-8">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto flex max-w-2xl flex-col items-center"
        >
          <p className="font-display text-[clamp(3.5rem,12vw,7.5rem)] font-semibold leading-[0.88] tracking-[-0.04em] text-ink-primary drop-shadow-[0_2px_40px_rgba(0,0,0,0.55)]">
            TCG Tracker
          </p>
          <h1 className="mt-6 max-w-[24ch] text-balance text-[clamp(1.05rem,2.3vw,1.4rem)] font-medium leading-snug tracking-tight text-ink-secondary">
            The market mark for cards you actually own.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-muted sm:text-[0.95rem]">
            Live prices in a quiet vault — specimens first, spreadsheet never.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/vault"
              className="inline-flex h-11 cursor-pointer items-center rounded-md bg-accent px-8 text-sm font-semibold text-primary-foreground shadow-[0_0_32px_rgba(196,180,154,0.22)] transition-colors hover:bg-accent-hover"
            >
              Open vault
            </Link>
            <Link
              to="/browse"
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-[color-mix(in_srgb,var(--surface-base)_55%,transparent)] px-5 text-sm font-semibold text-ink-primary backdrop-blur-md transition-colors hover:border-accent/45 hover:text-accent"
            >
              Browse
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <button
            type="button"
            onClick={scrollToMarketPulse}
            className="mt-10 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium uppercase tracking-[0.18em] text-ink-muted transition-colors hover:text-foil"
          >
            Market today
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      </div>
    </section>
  );
}
