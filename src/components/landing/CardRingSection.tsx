import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CardRing } from '@/components/three/CardRing';
import { setTrackerService } from '@/services/setTrackerService';
import {
  readCardRingCache,
  writeCardRingCache,
} from '@/services/cardRingCache';
import type { PokemonCard, PokemonSet } from '@/types/pokemon';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

const MAX_SETS = 48;
const CARDS_PER_SET = 10;
const FETCH_BATCH = 12;

/** Stride-sample across the full release timeline so every era shows up. */
function pickSetsForRing(sets: PokemonSet[], maxSets: number): PokemonSet[] {
  const sorted = [...sets].sort((a, b) => {
    const av = new Date(a.releaseDate ?? '').getTime();
    const bv = new Date(b.releaseDate ?? '').getTime();
    return (Number.isNaN(av) ? Number.MAX_SAFE_INTEGER : av) - (Number.isNaN(bv) ? Number.MAX_SAFE_INTEGER : bv);
  });

  if (sorted.length <= maxSets) return sorted;

  return Array.from({ length: maxSets }, (_, i) => {
    const idx = Math.round((i / Math.max(1, maxSets - 1)) * (sorted.length - 1));
    return sorted[idx];
  });
}

async function fetchRingCards(
  setIds: string[],
  onProgress?: (done: number, total: number) => void
): Promise<PokemonCard[]> {
  const cards: PokemonCard[] = [];

  for (let i = 0; i < setIds.length; i += FETCH_BATCH) {
    const batch = setIds.slice(i, i + FETCH_BATCH);
    const results = await Promise.all(
      batch.map((id) =>
        setTrackerService
          .getSetCards(id)
          .then((r) => r.cards as PokemonCard[])
          .catch(() => [] as PokemonCard[])
      )
    );
    results.forEach((list) => cards.push(...list));
    onProgress?.(Math.min(i + FETCH_BATCH, setIds.length), setIds.length);
  }

  const seen = new Set<string>();
  const bySet = new Map<string, PokemonCard[]>();
  for (const card of cards) {
    if (!card?.id || !card.set?.id || seen.has(card.id)) continue;
    seen.add(card.id);
    const list = bySet.get(card.set.id) ?? [];
    list.push(card);
    bySet.set(card.set.id, list);
  }

  const selected: PokemonCard[] = [];
  bySet.forEach((list) => {
    list.sort((a, b) => (b.marketPrice ?? 0) - (a.marketPrice ?? 0));
    selected.push(...list.slice(0, CARDS_PER_SET));
  });

  return selected;
}

export function CardRingSection() {
  const cached = readCardRingCache(MAX_SETS, CARDS_PER_SET);
  const [cards, setCards] = useState<PokemonCard[]>(() => cached?.cards ?? []);
  const [loading, setLoading] = useState(() => !cached?.cards.length);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const hadCache = Boolean(cached?.cards.length);
    const cacheFresh = Boolean(cached?.fresh);

    const load = async () => {
      // Fresh cache → skip network entirely this visit.
      if (cacheFresh) {
        setLoading(false);
        return;
      }

      try {
        const sets = await setTrackerService.getSets();
        if (cancelled) return;

        const chosen = pickSetsForRing(sets, MAX_SETS);
        const selected = await fetchRingCards(
          chosen.map((s) => s.id),
          (done, total) => {
            if (!cancelled && !hadCache) setProgress({ done, total });
          }
        );
        if (cancelled) return;

        writeCardRingCache(selected, MAX_SETS, CARDS_PER_SET);
        setCards(selected);
      } catch (err) {
        console.error('Failed to load ring cards:', err);
        if (!cancelled && !hadCache) setCards([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="relative border-t border-border-subtle bg-surface-base px-4 py-20 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(168,85,247,0.07),transparent_55%)]" />
      <div className="relative mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end"
        >
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-foil">Set timeline</p>
            <h2 className="mt-2 font-display text-[clamp(2rem,5vw,3.5rem)] font-bold leading-tight tracking-tight">
              <span className="text-gradient">Every set</span> in the field
            </h2>
            <p className="mt-3 max-w-lg text-base font-semibold text-ink-secondary">
              A particle ring of real card art — dense on the torus, scattered through the void. Drag to
              orbit.
            </p>
          </div>
        </motion.div>

        <div className="mt-10">
          {loading ? (
            <div className="flex h-[70vh] items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <LoadingSpinner />
                {progress && (
                  <p className="text-sm text-ink-secondary">
                    Loading {progress.done}/{progress.total} sets…
                  </p>
                )}
              </div>
            </div>
          ) : cards.length > 0 ? (
            <CardRing cards={cards} maxSets={MAX_SETS} maxCardsPerSet={CARDS_PER_SET} />
          ) : (
            <p className="py-24 text-center text-ink-secondary">Couldn't load cards for the ring.</p>
          )}
        </div>
      </div>
    </section>
  );
}
