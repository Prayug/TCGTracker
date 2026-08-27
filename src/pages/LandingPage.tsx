import { Suspense } from 'react';
import { motion } from 'motion/react';
import { HomeHero } from '@/components/landing/HomeHero';
import { QuickActions } from '@/components/landing/QuickActions';
import { MarketSnapshot } from '@/components/common/MarketSnapshot';
import { TopMovers } from '@/components/common/TopMovers';
import { SlabTopMovers } from '@/components/common/SlabTopMovers';

export function LandingPage() {
  return (
    <div className="relative">
      <Suspense
        fallback={
          <div className="flex h-[clamp(24rem,58dvh,36rem)] items-center justify-center">
            <p className="font-display text-2xl font-semibold text-ink-secondary">Loading…</p>
          </div>
        }
      >
        <HomeHero />
      </Suspense>

      {/* Quick launcher — utility row, not a second hero */}
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <QuickActions />
      </div>

      <section
        id="market-pulse"
        className="relative border-t border-border-subtle bg-surface-base px-4 pb-24 pt-14 sm:px-6 lg:px-8"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(110,231,183,0.05),transparent_50%)]" />
        <div className="relative mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="font-display text-[clamp(2rem,5vw,3.5rem)] font-bold leading-tight tracking-tight">
              <span className="text-gradient">Real-time</span>{' '}
              <span className="text-ink-primary">market</span> data
            </h2>
            <p className="mt-3 max-w-lg text-base font-semibold text-ink-secondary">
              Track prices, spot trends, and never miss a move.
            </p>
          </motion.div>

          <div className="mt-8">
            <MarketSnapshot />
          </div>

          <div className="mt-12">
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
