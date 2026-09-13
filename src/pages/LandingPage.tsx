import { Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '@/hooks/useAuth';
import { HomeHero } from '@/components/landing/HomeHero';
import { HomeDashboard } from '@/components/landing/HomeDashboard';
import { MarketSnapshot } from '@/components/common/MarketSnapshot';
import { TopMovers } from '@/components/common/TopMovers';
import { SlabTopMovers } from '@/components/common/SlabTopMovers';

export function LandingPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [params] = useSearchParams();
  const forceDashboard =
    params.get('preview') === 'dashboard' ||
    (typeof window !== 'undefined' && window.localStorage.getItem('tcg_preview_dashboard') === '1');

  if (isLoading && !forceDashboard) {
    return (
      <div className="flex min-h-[min(92dvh,52rem)] items-center justify-center">
        <p className="font-display text-2xl font-semibold text-ink-secondary">Loading…</p>
      </div>
    );
  }

  if (isAuthenticated || forceDashboard) {
    return (
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center">
            <p className="text-sm text-ink-secondary">Loading your collection…</p>
          </div>
        }
      >
        <HomeDashboard />
      </Suspense>
    );
  }

  return (
    <div className="relative">
      <Suspense
        fallback={
          <div className="flex min-h-[min(92dvh,52rem)] items-center justify-center">
            <p className="font-display text-2xl font-semibold text-ink-secondary">Loading…</p>
          </div>
        }
      >
        <HomeHero variant="full" />
      </Suspense>

      <section
        id="market-pulse"
        className="relative border-t border-border-subtle bg-surface-base px-4 pb-24 pt-16 sm:px-6 lg:px-8"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,236,210,0.05),transparent_48%)]" />
        <div className="relative mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-secondary">
              Market
            </p>
            <h2 className="mt-3 font-display text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-ink-primary">
              Market movers
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-secondary sm:text-base">
              Snapshot, raw movers, and graded comps — see what is moving today.
            </p>
          </motion.div>

          <div className="mt-10">
            <MarketSnapshot />
          </div>

          <div className="mt-14">
            <TopMovers />
          </div>

          <div className="mt-16">
            <SlabTopMovers />
          </div>
        </div>
      </section>
    </div>
  );
}
