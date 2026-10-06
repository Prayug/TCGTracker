import { moveTone } from '../lib/format';

/** Compact magnitude bar — not a decorative chart. */
export function TrendBar({
  value,
  maxAbs = 10,
}: {
  value: number | null | undefined;
  maxAbs?: number;
}) {
  const tone = moveTone(value);
  const abs = Math.abs(value ?? 0);
  const width = value == null ? 0 : Math.max(6, Math.min(100, (abs / Math.max(maxAbs, 1)) * 100));
  return (
    <div className={`mf-term__trend is-${tone}`} aria-hidden>
      <span style={{ width: `${width}%` }} />
    </div>
  );
}
