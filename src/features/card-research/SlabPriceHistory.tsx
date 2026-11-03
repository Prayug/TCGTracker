import { useEffect, useMemo, useState } from 'react';
import { StepPriceChart } from '../../components/exchange/StepPriceChart';
import { Unavailable } from '../../components/exchange/Price';
import type { AllGradedPriceHistoryResult } from '../../services/gradedPricesApi';
import { slicePriceHistory, type PriceRangeKey } from '../../utils/chartDomain';
import { formatCurrency } from '../../utils/cardDisplay';
import { gradeLabel } from './useCardResearch';

const COLORS = [
  'var(--chart-series-1)',
  'var(--chart-series-2)',
  'var(--chart-series-3)',
  'var(--chart-series-4)',
];
const MAX_SELECTED = COLORS.length;

/** PSA first, then CGC, BGS, SGC; higher grades first within a grader. */
const GRADER_ORDER = ['psa', 'cgc', 'bgs', 'sgc', 'tag', 'ace'];
const seriesOrder = (grader: string, grade: string): number => {
  const g = GRADER_ORDER.indexOf(grader.toLowerCase());
  const n = parseFloat(grade) || 0;
  const bonus = /pristine|black/i.test(grade) ? 0.5 : 0;
  return (g === -1 ? GRADER_ORDER.length : g) * 100 - (n + bonus);
};

/**
 * Daily PriceCharting slab quotes per grade, on the card research page.
 * The redesign kept the fetch but dropped the chart; this brings it back
 * in the page's own chart style.
 */
export function SlabPriceHistory({
  history,
  range,
  cardName,
}: {
  history: AllGradedPriceHistoryResult | null;
  range: PriceRangeKey;
  cardName: string;
}) {
  const series = useMemo(
    () =>
      (history?.series ?? [])
        .filter((s) => s.points.length > 0)
        .map((s) => ({ ...s, key: `${s.grader}::${s.grade}`, label: gradeLabel(s) }))
        .sort((a, b) => seriesOrder(a.grader, a.grade) - seriesOrder(b.grader, b.grade)),
    [history]
  );

  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    // Default to PSA 10 (or the first grade on file) whenever the card changes.
    const keys = series.map((s) => s.key);
    setSelected((prev) => {
      const kept = prev.filter((k) => keys.includes(k));
      if (kept.length > 0) return kept;
      return keys.includes('psa::10') ? ['psa::10'] : keys.slice(0, 1);
    });
  }, [series]);

  const toggle = (key: string) =>
    setSelected((prev) =>
      prev.includes(key)
        ? prev.length > 1
          ? prev.filter((k) => k !== key)
          : prev
        : [...prev, key].slice(-MAX_SELECTED)
    );

  const chartSeries = series
    .filter((s) => selected.includes(s.key))
    .map((s) => ({
      key: s.key,
      label: s.label,
      color: COLORS[selected.indexOf(s.key) % COLORS.length],
      points: slicePriceHistory(
        s.points.map((p) => ({ date: p.date, price: p.price })),
        range
      ),
    }));
  const plotted = chartSeries.filter((s) => s.points.length > 0);
  const enough = plotted.some((s) => s.points.length > 1);

  if (history == null) return <div className="skeleton h-[240px] rounded" />;
  if (series.length === 0) {
    return (
      <Unavailable title="No slab price history yet">
        Graded prices for this finish have not been recorded on more than one day.
      </Unavailable>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Grades to chart">
        {series.map((s) => {
          const on = selected.includes(s.key);
          const color = on ? COLORS[selected.indexOf(s.key) % COLORS.length] : undefined;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(s.key)}
              className={
                on
                  ? 'flex items-center gap-2 rounded-full border border-ink-primary px-3 py-1 text-[13px]'
                  : 'flex items-center gap-2 rounded-full border border-rule-strong px-3 py-1 text-[13px] text-ink-secondary hover:border-ink-secondary'
              }
            >
              {on ? (
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: color }}
                />
              ) : null}
              {s.label}
              {s.latestPrice != null ? (
                <span className="font-mono text-[12px] tabular-nums text-ink-muted">
                  {formatCurrency(s.latestPrice)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="mt-4">
        {enough ? (
          <StepPriceChart title={`${cardName} slab prices, ${range}`} series={plotted} />
        ) : (
          <Unavailable title="Not enough slab history to chart">
            The selected grades have a single recorded day in this range. A trend needs at least
            two.
          </Unavailable>
        )}
      </div>
    </div>
  );
}
