import { Suspense } from 'react';
import { motion } from 'motion/react';
import { ScrollWorldSection } from '@/components/landing/ScrollWorldSection';
import { TopMovers } from '@/components/common/TopMovers';

export function LandingPage() {
  return (
    <div className="relative">
      <Suspense
        fallback={
          <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center">
            <p className="font-display text-2xl font-semibold text-ink-secondary">Loading the world…</p>
          </div>
        }
      >
        <ScrollWorldSection />
      </Suspense>

      {/* Restored Market Pulse — same TopMovers block as the pre-revamp home */}
      <section
        id="market-pulse"
        className="relative border-t border-border-subtle bg-surface-base px-4 py-20 sm:px-6 lg:px-8"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(110,231,183,0.07),transparent_55%)]" />
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

          <div className="mt-10">
            <TopMovers />
          </div>
        </div>
      </section>
    </div>
  );
}
