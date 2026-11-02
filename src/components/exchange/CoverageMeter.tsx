/** How much of the collection's priced value has a recorded purchase price. */
export function CoverageMeter({
  value,
  label = 'Share of collection value with a recorded purchase price',
}: {
  value: number;
  label?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <span
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className="relative block h-2 w-full overflow-hidden rounded-sm bg-surface-hover"
    >
      <span className="absolute inset-y-0 left-0 bg-ink-primary" style={{ width: `${pct}%` }} />
      {/* quarter ticks make the meter readable without the number */}
      {[25, 50, 75].map((t) => (
        <span
          key={t}
          className="absolute inset-y-0 w-px bg-surface-base"
          style={{ left: `${t}%` }}
        />
      ))}
    </span>
  );
}
