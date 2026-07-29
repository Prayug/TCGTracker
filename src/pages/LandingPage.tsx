import { Suspense } from 'react';
import { ScrollWorldSection } from '@/components/landing/ScrollWorldSection';

export function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      <Suspense
        fallback={
          <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center">
            <p className="font-display text-2xl font-semibold text-ink-secondary">Loading the world…</p>
          </div>
        }
      >
        <ScrollWorldSection />
      </Suspense>
    </div>
  );
}
