import { useEffect, useMemo, useState } from 'react';
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
  const usable = useMemo(() => {
    const seen = new Set<string>();
    return rows.filter((r) => {
      if (!(r.rawPrice != null && r.rawPrice > 0 && r.gradedPrice > 0)) return false;
      // One chip per card and grade, even if an older API sends a copy per finish.
      const key = `${r.cardId}|${r.grader}|${r.grade}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rows]);
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
    <section aria-labelledby="grade-cmp-h" className="relative border-y border-rule py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12.5px] text-ink-muted">Grade comparison</p>
          <h2 id="grade-cmp-h" className="mt-0.5 text-h2">
            What a {row.grader.toUpperCase()} {row.grade} does to {row.cardName ?? 'this card'}
          </h2>
          <p className="text-[13px] text-ink-muted">
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
            <span className="block text-[12px] text-ink-muted">
              {row.rawSource === 'pricecharting'
                ? 'Raw · PriceCharting ungraded'
                : 'Raw · TCGplayer NM'}
            </span>
            <span className="font-mono text-[22px] font-medium tabular-nums">
              {formatCurrency(raw)}
            </span>
          </figcaption>
        </figure>

        <div className="flex flex-col items-center gap-1 text-center" aria-live="polite">
          <motion.span
            key={row.cardId + '-x'}
            className="font-mono text-[clamp(2rem,4.5vw,3rem)] font-medium leading-none tabular-nums text-gold"
            initial={reduce ? false : { scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 16 }}
          >
            {multiple.toFixed(1)}×
          </motion.span>
          <span className="text-[13px] text-ink-muted">
            {row.premiumPct != null ? `+${Math.round(row.premiumPct)}% over raw` : ''}
          </span>
          <span className="font-mono text-[12px] text-ink-muted">
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
            <span className="block text-[12px] text-ink-muted">
              {row.grader.toUpperCase()} {row.grade}
            </span>
            <span className="font-mono text-[22px] font-medium tabular-nums text-gold">
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
            <li key={`${r.cardId}-${r.grader}-${r.grade}-${i}`} className="shrink-0">
              <button
                type="button"
                onClick={() => setPick(i)}
                aria-pressed={row === r}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors',
                  row === r
                    ? 'border-ink-primary bg-ink-primary text-surface-base'
                    : 'border-border-default text-ink-secondary hover:bg-surface-hover'
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
      <p className="mt-3 text-[12px] text-ink-muted">
        Graded price is PriceCharting&rsquo;s guide for that grade, which can rest on very few
        sales. Raw is the TCGplayer Near Mint market, or PriceCharting ungraded when our TCGplayer
        quote fails its checks. Grading fees, shipping and the chance of a lower grade are not
        included.
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
    <div className="relative rounded-[10px] bg-surface-inset p-[7%] pt-[4%] shadow-md ring-1 ring-border-strong">
      <div className="mb-[6%] flex items-center justify-between gap-2 rounded-[4px] bg-stage-ink px-2 py-1.5 text-stage">
        <span className="min-w-0 truncate text-[10px] font-semibold">{name}</span>
        <span className="shrink-0 rounded-[3px] bg-stage-red px-1.5 py-0.5 font-mono text-[10px] font-bold text-stage-ink">
          {label}
        </span>
      </div>
      <div className="rounded-[4px] bg-surface-hover p-[4%]">{children}</div>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[10px] bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,0.18)_42%,transparent_52%)]"
      />
    </div>
  );
}
