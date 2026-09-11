import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUpRight, Package } from 'lucide-react';
import { ScrollWorld } from '@/components/three/ScrollWorld';
import { usePrefersReducedMotion } from '@/hooks/useMotionPreferences';

export function scrollToMarketPulse(e?: { preventDefault?: () => void }) {
  e?.preventDefault?.();
  document.getElementById('market-pulse')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Binder Desk home hero — shop-sign brand on felt, one composition.
 */
export function HomeHero() {
  const reduced = usePrefersReducedMotion();
  const [ready, setReady] = useState(false);
  const progressRef = useRef(0);

  useEffect(() => {
    setReady(true);
  }, []);

  return (
    <section
      aria-label="Welcome"
      className="relative h-[clamp(26rem,62dvh,40rem)] overflow-hidden border-b border-white/10"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,244,220,0.1),transparent_55%)]" />

      {!reduced && ready && (
        <>
          <div className="absolute inset-0 opacity-55">
            <ScrollWorld progressRef={progressRef} />
          </div>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(26,61,46,0.45)_0%,rgba(26,61,46,0.28)_40%,rgba(26,61,46,0.88)_100%)]" />
        </>
      )}

      <div className="relative z-10 flex h-full flex-col justify-end px-5 pb-10 sm:justify-center sm:px-10 sm:pb-0 lg:px-14">
        <div className="max-w-2xl">
          <p className="font-display text-[clamp(2.75rem,8vw,5.5rem)] font-extrabold leading-[0.95] tracking-tight text-felt-ink">
            TCG Tracker
          </p>
          <h1 className="mt-4 max-w-lg font-display text-[clamp(1.35rem,3.2vw,2rem)] font-bold leading-snug tracking-tight text-felt-ink">
            Your collection on the shop desk.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-felt-secondary sm:text-base">
            Live prices, vault pages, pack rips and grading — laid out like sleeves on felt.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              to="/packs"
              className="inline-flex h-11 cursor-pointer items-center gap-2 bg-sticker px-5 text-sm font-semibold text-felt-ink transition-colors hover:bg-sticker-hover"
              style={{ borderRadius: 'var(--radius-ui)' }}
            >
              <Package className="h-4 w-4" />
              Open packs
            </Link>
            <Link
              to="/browse"
              className="inline-flex h-11 cursor-pointer items-center gap-2 border border-white/25 bg-black/15 px-5 text-sm font-semibold text-felt-ink transition-colors hover:border-foil/50"
              style={{ borderRadius: 'var(--radius-ui)' }}
            >
              Browse catalog
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={scrollToMarketPulse}
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-foil transition-colors hover:text-felt-ink"
            >
              See today&apos;s movers
              <ArrowDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
