import { motion, useReducedMotion } from 'motion/react';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { HolographicCard } from '../../../components/collectible/HolographicCard';
import type { DealSummary } from '../types';

/** The scan's result: what was found, the deepest one, and the total gap to market. */
export function DealSummary({ summary }: { summary: DealSummary }) {
  const reduce = useReducedMotion();
  if (!summary.dealsFound) return null;
  const best = summary.bestDeal;
  return (
    <section
      data-theme="dark"
      aria-label="Scan summary"
      className="atmo-stage relative overflow-hidden rounded-3xl p-5 text-white sm:p-7"
    >
      <div className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className="font-display text-[clamp(1.5rem,3vw,2.3rem)] font-semibold leading-tight tracking-[-0.02em]">
            {summary.dealsFound.toLocaleString()} listing{summary.dealsFound === 1 ? '' : 's'} under
            the market estimate
          </p>
          <dl className="mt-5 grid max-w-xl grid-cols-3 gap-3 sm:gap-4">
            <Stat
              label="Median under"
              value={summary.medianDiscount != null ? formatPercent(summary.medianDiscount) : '—'}
            />
            <Stat
              label="Combined gap"
              value={summary.potentialSavings > 0 ? formatCurrency(summary.potentialSavings) : '—'}
            />
            <Stat label="Deepest" value={best ? formatPercent(best.discountPercent) : '—'} />
          </dl>
          {best ? (
            <p className="mt-4 text-[13.5px] text-white/70">
              The deepest is {best.cardName}, {formatCurrency(best.allInCost)} all in against a{' '}
              {formatCurrency(best.marketValue)} estimate. Asking prices are not sales; check the
              listing before you buy.
            </p>
          ) : null}
        </div>
        {best && (best.cardImage || best.listingImage) ? (
          <motion.div
            className="mx-auto w-36 sm:w-44"
            initial={reduce ? false : { opacity: 0, rotate: -6, y: 20 }}
            animate={{ opacity: 1, rotate: 3, y: 0 }}
            transition={{ type: 'spring', stiffness: 140, damping: 16 }}
          >
            <HolographicCard
              card={{
                name: best.cardName,
                rarity: best.rarity ?? undefined,
                images: { small: (best.cardImage || best.listingImage) ?? undefined },
              }}
              level="showcase"
            />
            <p className="mt-3 text-center font-mono text-[12px] text-[color:var(--gain)]">
              {formatCurrency(best.discountAmount)} under
            </p>
          </motion.div>
        ) : null}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-white/55">{label}</dt>
      <dd className="font-mono text-[17px] font-medium tabular-nums sm:text-[26px]">{value}</dd>
    </div>
  );
}
