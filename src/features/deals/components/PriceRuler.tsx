import { motion, useReducedMotion } from 'motion/react';
import { formatCurrency } from '../../../utils/cardDisplay';

/**
 * The listing against the market estimate on one ruler: the bar runs to the
 * estimate, the marker is what the listing asks all in, and the stretch
 * between them is the saving. Nothing is drawn for a live auction's saving,
 * because the final price is not known yet.
 */
export function PriceRuler({
  ask,
  market,
  askLabel,
  showSaving,
}: {
  ask: number;
  market: number;
  askLabel: string;
  showSaving: boolean;
}) {
  const reduce = useReducedMotion();
  const top = Math.max(ask, market, 0.01) * 1.08;
  const askPct = (ask / top) * 100;
  const marketPct = (market / top) * 100;
  const under = ask < market;
  return (
    <div
      className="relative mt-3 pb-5 pt-5"
      role="img"
      aria-label={`${askLabel} ${formatCurrency(ask)} against a market estimate of ${formatCurrency(market)}`}
    >
      <div className="relative h-2.5 rounded-full bg-surface-hover">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-ink-muted/35"
          style={{ width: `${marketPct}%` }}
        />
        {showSaving && under ? (
          <motion.span
            className="absolute inset-y-0 rounded-full bg-gain"
            style={{ left: `${askPct}%` }}
            initial={{ width: reduce ? `${marketPct - askPct}%` : 0 }}
            animate={{ width: `${marketPct - askPct}%` }}
            transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
          />
        ) : null}
        {/* Market tick */}
        <span
          className="absolute -top-1.5 h-5 w-px bg-ink-secondary"
          style={{ left: `${marketPct}%` }}
        />
        <span
          className="absolute -top-5 -translate-x-1/2 whitespace-nowrap font-mono text-[10.5px] text-ink-muted"
          style={{ left: `${Math.min(92, Math.max(8, marketPct))}%` }}
        >
          Market
        </span>
        {/* Ask marker */}
        <motion.span
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface-base bg-ink-primary shadow"
          initial={{ left: reduce ? `${askPct}%` : `${marketPct}%` }}
          animate={{ left: `${askPct}%` }}
          transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
        />
        <span
          className="absolute top-4 -translate-x-1/2 whitespace-nowrap font-mono text-[10.5px] text-ink-secondary"
          style={{ left: `${Math.min(90, Math.max(10, askPct))}%` }}
        >
          {askLabel}
        </span>
      </div>
    </div>
  );
}
