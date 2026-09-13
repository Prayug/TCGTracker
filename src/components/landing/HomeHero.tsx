/**
 * Home hero — orbiting card ring.
 * Full stage for logged-out users; compact banner for logged-in Home.
 * Matte card art (no holo foil treatment).
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

const STATIC_RING = [
  {
    src: 'https://images.pokemontcg.io/swsh7/215_hires.png',
    className: 'left-[4%] top-[18%] w-[22%] -rotate-[14deg] opacity-70',
  },
  {
    src: 'https://images.pokemontcg.io/base1/4_hires.png',
    className: 'left-[22%] top-[8%] w-[20%] -rotate-[4deg] opacity-55',
  },
  {
    src: 'https://images.pokemontcg.io/sv8pt5/161_hires.png',
    className: 'left-1/2 top-[4%] w-[24%] -translate-x-1/2 opacity-80',
  },
  {
    src: 'https://images.pokemontcg.io/swsh7/218_hires.png',
    className: 'right-[22%] top-[9%] w-[20%] rotate-[5deg] opacity-55',
  },
  {
    src: 'https://images.pokemontcg.io/sv4pt5/232_hires.png',
    className: 'right-[4%] top-[18%] w-[22%] rotate-[12deg] opacity-70',
  },
] as const;

type HomeHeroProps = {
  /** full = logged-out marketing hero; banner = compact strip for logged-in Home */
  variant?: 'full' | 'banner';
};

export function HomeHero({ variant = 'full' }: HomeHeroProps) {
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const progressRef = useRef(0);
  const isBanner = variant === 'banner';

  useEffect(() => {
    setReady(true);
  }, []);

  const showRing = !reduced && ready;

  return (
    <section
      aria-label={isBanner ? 'Card gallery' : 'Welcome'}
      className={cn(
        'relative isolate overflow-hidden',
        isBanner
          ? 'h-[280px] border-b border-border-subtle sm:h-[300px]'
          : 'min-h-[min(92dvh,54rem)] border-b border-border-subtle'
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,rgba(255,255,255,0.04),transparent_42%)]"
      />

      {showRing ? (
        <div
          className={cn('absolute inset-0', isBanner ? 'scale-110' : 'scale-[1.08] sm:scale-100')}
        >
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

      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0',
          isBanner
            ? 'bg-[radial-gradient(ellipse_at_50%_50%,rgba(7,7,8,0.35)_0%,rgba(7,7,8,0.55)_100%)]'
            : 'bg-[radial-gradient(ellipse_at_50%_48%,rgba(7,7,8,0.42)_0%,rgba(7,7,8,0.12)_34%,rgba(7,7,8,0.58)_72%,rgba(7,7,8,0.82)_100%)]'
        )}
      />

      {isBanner ? (
        <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
          <p className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink-primary sm:text-3xl">
            TCG Tracker
          </p>
          <p className="mt-2 max-w-md text-sm text-ink-secondary">
            Live prices and market movement across the cards you own.
          </p>
        </div>
      ) : (
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
            <h1 className="mt-6 max-w-[28ch] text-balance text-[clamp(1.1rem,2.4vw,1.45rem)] font-medium leading-snug tracking-tight text-ink-primary">
              Know what your collection is worth.
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-secondary sm:text-[0.95rem]">
              Live prices, market movement, and opportunities across the cards you own.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/vault"
                className="inline-flex h-11 cursor-pointer items-center rounded-md bg-accent px-8 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent-hover"
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
              className="mt-10 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium uppercase tracking-[0.18em] text-ink-secondary transition-colors hover:text-ink-primary"
            >
              Market today
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        </div>
      )}
    </section>
  );
}
