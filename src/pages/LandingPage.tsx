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
          <div className="flex h-[clamp(26rem,62dvh,40rem)] items-center justify-center">
            <p className="font-display text-2xl font-semibold text-felt-secondary">Loading…</p>
          </div>
        }
      >
        <HomeHero />
      </Suspense>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="binder-page binder-page-rail p-4 sm:p-5">
          <QuickActions />
        </div>
      </div>

      <section
        id="market-pulse"
        className="relative border-t border-white/10 px-4 pb-24 pt-10 sm:px-6 lg:px-8"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,244,220,0.06),transparent_50%)]" />
        <div className="relative mx-auto max-w-6xl">
          <div className="binder-page binder-page-rail animate-page-turn p-5 sm:p-8">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <h2 className="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-extrabold leading-tight tracking-tight text-ink-primary">
                Market on the desk
              </h2>
              <p className="mt-2 max-w-lg text-sm text-ink-secondary sm:text-base">
                Spot movers and track prices without leaving the binder page.
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
        </div>
      </section>
    </div>
  );
}
