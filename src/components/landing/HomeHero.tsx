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
 * Compact product-home hero. The 3D card ring is ambient background art only —
 * page scroll is never hijacked, so market data is one flick away.
 */
export function HomeHero() {
  const reduced = usePrefersReducedMotion();
  const [ready, setReady] = useState(false);
  // Static progress: WorldRig adds its own slow time-based rotation.
  const progressRef = useRef(0);

  useEffect(() => {
    setReady(true);
  }, []);

  return (
    <section
      aria-label="Welcome"
      className="relative h-[clamp(24rem,58dvh,36rem)] overflow-hidden border-b border-border-subtle"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(110,231,183,0.05),transparent_50%)]" />

      {!reduced && ready && (
        <>
          {/* r3f Canvas forces position:relative inline, so position via a wrapper */}
          <div className="absolute inset-0">
            <ScrollWorld progressRef={progressRef} />
          </div>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(12,17,24,0.55)_0%,rgba(12,17,24,0.35)_45%,rgba(12,17,24,0.85)_100%)]" />
        </>
      )}

      <div className="relative z-10 flex h-full flex-col justify-center px-5 sm:px-10 lg:px-14">
        <div className="max-w-xl">
          <p className="font-display text-xl font-bold tracking-tight text-ink-primary sm:text-2xl">
            TCG<span className="text-accent">Tracker</span>
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold leading-[1.05] tracking-tight text-ink-primary sm:text-5xl">
            Rip packs. Grade cards.
            <br />
            <span className="text-gradient">Track the market.</span>
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-secondary sm:text-base">
            Live prices, your vault, pack rips and AI grading — for Pokemon and One Piece.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              to="/packs"
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-accent px-6 text-sm font-semibold text-primary-foreground shadow-glow-accent transition-all duration-200 hover:bg-accent-hover"
            >
              <Package className="h-4 w-4" />
              Open packs
            </Link>
            <Link
              to="/browse"
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-border-default bg-surface-raised/70 px-6 text-sm font-semibold text-ink-primary backdrop-blur-md transition-colors hover:border-accent/40 hover:text-accent"
            >
              Browse catalog
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={scrollToMarketPulse}
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-foil transition-colors hover:text-accent"
            >
              See today's movers
              <ArrowDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
