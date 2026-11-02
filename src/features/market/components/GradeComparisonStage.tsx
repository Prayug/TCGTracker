import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { pokemonApi } from '../../../services/pokemonApi';
import type { GradedSpreadRow } from '../../../services/gradedPricesApi';
import type { PokemonCard } from '../../../types/pokemon';
import { HolographicCard } from '../../../components/collectible/HolographicCard';
import { formatCurrency } from '../../../utils/cardDisplay';
import { cn } from '@/lib/utils';

/**
 * Raw card against the same card in a slab, for the cards where grading adds
 * the most, from recorded graded sales. Pick another card from the rail.
 */
export function GradeComparisonStage({ rows }: { rows: GradedSpreadRow[] }) {
  const usable = rows.filter((r) => r.rawPrice != null && r.rawPrice > 0 && r.gradedPrice > 0);
  const [pick, setPick] = useState(0);
  const row = usable[Math.min(pick, usable.length - 1)];
  const [cards, setCards] = useState<Record<string, PokemonCard | null>>({});
  const reduce = useReducedMotion();

  useEffect(() => {
    const missing = usable.slice(0, 8).filter((r) => !(r.cardId in cards));
    if (!missing.length) return;
    let alive = true;
    void Promise.all(
      missing.map((r) =>
        pokemonApi
          .getCardById(r.cardId)
          .then((c) => [r.cardId, c] as const)
          .catch(() => [r.cardId, null] as const)
      )
    ).then((pairs) => alive && setCards((prev) => ({ ...prev, ...Object.fromEntries(pairs) })));
    return () => {
      alive = false;
    };
  }, [usable, cards]);

  if (!row) return null;
  const card = cards[row.cardId];
  const raw = row.rawPrice as number;
  const multiple = row.gradedPrice / raw;
  const art = card ? { ...card } : { name: row.cardName ?? 'Card', images: {} };

  return (
    <section
      data-theme="dark"
      aria-labelledby="grade-cmp-h"
      className="atmo-stage relative overflow-hidden rounded-3xl p-5 text-white sm:p-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-white/55">
            Grade comparison
          </p>
          <h2
            id="grade-cmp-h"
            className="mt-1 font-display text-[clamp(1.6rem,3vw,2.4rem)] font-semibold leading-tight tracking-[-0.02em]"
          >
            What a {row.grader.toUpperCase()} {row.grade} does to {row.cardName ?? 'this card'}
          </h2>
          <p className="text-[13px] text-white/60">
            {row.setName ? `${row.setName} · ` : ''}from {row.soldListings} graded sale
            {row.soldListings === 1 ? '' : 's'} on file
          </p>
        </div>
      </div>

      <div className="mt-6 grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <figure className="mx-auto w-40 sm:w-48">
          <AnimatePresence mode="wait">
            <motion.div
              key={row.cardId + '-raw'}
              initial={reduce ? false : { opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <HolographicCard card={art} level="featured" />
            </motion.div>
          </AnimatePresence>
          <figcaption className="mt-3 text-center">
            <span className="block text-[12px] text-white/55">Raw</span>
            <span className="font-mono text-[22px] font-medium tabular-nums">
              {formatCurrency(raw)}
            </span>
          </figcaption>
        </figure>

        <div className="flex flex-col items-center gap-1 text-center" aria-live="polite">
          <motion.span
            key={row.cardId + '-x'}
            className="font-display text-[clamp(2.6rem,6vw,4.2rem)] font-semibold leading-none text-[#f0bd55]"
            initial={reduce ? false : { scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 16 }}
          >
            {multiple.toFixed(1)}×
          </motion.span>
          <span className="text-[13px] text-white/65">
            {row.premiumPct != null ? `+${Math.round(row.premiumPct)}% over raw` : ''}
          </span>
          <span className="font-mono text-[12px] text-white/50">
            +{formatCurrency(row.gradedPrice - raw)} before fees
          </span>
        </div>

        <figure className="mx-auto w-44 sm:w-52">
          <AnimatePresence mode="wait">
            <motion.div
              key={row.cardId + '-slab'}
              initial={reduce ? false : { opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Slab label={`${row.grader.toUpperCase()} ${row.grade}`} name={row.cardName ?? ''}>
                <HolographicCard card={art} level="showcase" />
              </Slab>
            </motion.div>
          </AnimatePresence>
          <figcaption className="mt-3 text-center">
            <span className="block text-[12px] text-white/55">
              {row.grader.toUpperCase()} {row.grade}
            </span>
            <span className="font-mono text-[22px] font-medium tabular-nums text-[#f0bd55]">
              {formatCurrency(row.gradedPrice)}
            </span>
          </figcaption>
        </figure>
      </div>

      {usable.length > 1 ? (
        <ul
          className="scrollbar-none -mx-1 mt-6 flex gap-2 overflow-x-auto px-1 pb-1"
          aria-label="Cards with the largest grading premium"
        >
          {usable.slice(0, 8).map((r, i) => (
            <li key={r.cardId + r.grade} className="shrink-0">
              <button
                type="button"
                onClick={() => setPick(i)}
                aria-pressed={row === r}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors',
                  row === r
                    ? 'border-white bg-white text-[#0b0e14]'
                    : 'border-white/20 text-white/80 hover:bg-white/10'
                )}
              >
                <span className="max-w-[9rem] truncate">{r.cardName}</span>
                <span className="font-mono text-[11.5px] opacity-75">
                  {(r.gradedPrice / (r.rawPrice as number)).toFixed(1)}×
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-[12px] text-white/50">
        Graded price is the recorded sale figure for that grade; raw is TCGplayer market. Grading
        fees, shipping and the chance of a lower grade are not included.
      </p>
    </section>
  );
}

/** A clear graded case: label strip, inner well, the card inside. */
function Slab({
  label,
  name,
  children,
}: {
  label: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative rounded-[10px] bg-gradient-to-b from-white/35 to-white/10 p-[7%] pt-[4%] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/40 backdrop-blur-sm">
      <div className="mb-[6%] flex items-center justify-between gap-2 rounded-[4px] bg-gradient-to-r from-[#e8e3d6] to-[#f6f1e4] px-2 py-1.5 text-[#1b1b1b]">
        <span className="min-w-0 truncate text-[9.5px] font-semibold uppercase tracking-[0.04em]">
          {name}
        </span>
        <span className="shrink-0 rounded-[3px] bg-[#c8102e] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
          {label}
        </span>
      </div>
      <div className="rounded-[4px] bg-black/25 p-[4%]">{children}</div>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[10px] bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,0.22)_42%,transparent_52%)]"
      />
    </div>
  );
}
