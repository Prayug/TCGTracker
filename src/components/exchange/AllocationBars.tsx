import type { AllocationSlice } from '../../utils/portfolio';
import { formatCurrency } from '../../utils/cardDisplay';

/** Ordered, restrained palette that stays distinguishable for common CVD types. */
const SWATCHES = [
  'var(--chart-series-1)',
  'var(--chart-series-2)',
  'var(--chart-series-3)',
  'var(--chart-series-4)',
  'color-mix(in srgb, var(--chart-series-1) 45%, var(--surface-raised))',
  'color-mix(in srgb, var(--chart-series-2) 45%, var(--surface-raised))',
  'var(--ink-faint)',
];

/**
 * Allocation figure: one 100% stacked strip (the shape of the collection at a
 * glance) over a ruled legend that carries the exact values. The legend is
 * the accessible table; the strip is decorative reinforcement.
 */
export function AllocationBars({
  slices,
  title,
  onSelect,
}: {
  slices: AllocationSlice[];
  title: string;
  onSelect?: (slice: AllocationSlice) => void;
}) {
  if (slices.length === 0) return null;
  return (
    <figure>
      <div className="flex h-3 w-full overflow-hidden rounded-sm" aria-hidden>
        {slices.map((s, i) => (
          <div
            key={s.key}
            style={{ width: `${s.share * 100}%`, background: SWATCHES[i % SWATCHES.length] }}
            className="h-full border-r border-surface-base last:border-r-0"
            title={`${s.label}: ${Math.round(s.share * 100)}%`}
          />
        ))}
      </div>
      <table className="mt-3 w-full text-[13px]">
        <caption className="sr-only">{title}</caption>
        <tbody>
          {slices.map((s, i) => (
            <tr key={s.key} className="border-b border-rule last:border-0">
              <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                    style={{ background: SWATCHES[i % SWATCHES.length] }}
                  />
                  {onSelect && s.key !== '__other' ? (
                    <button
                      type="button"
                      className="truncate text-left hover:underline"
                      onClick={() => onSelect(s)}
                    >
                      {s.label}
                    </button>
                  ) : (
                    <span className="truncate text-ink-secondary">{s.label}</span>
                  )}
                </span>
              </th>
              <td className="w-16 py-1.5 text-right font-mono tabular-nums text-ink-muted">
                {Math.round(s.share * 100)}%
              </td>
              <td className="w-24 py-1.5 text-right font-mono tabular-nums">
                {formatCurrency(s.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
