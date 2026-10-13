/** Two stacked cards with a rising line: the catalog and its price. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <rect
        x="6.5"
        y="3"
        width="11"
        height="15.5"
        rx="2"
        transform="rotate(-10 12 10.75)"
        fill="currentColor"
        opacity="0.3"
      />
      <rect x="6.5" y="5.5" width="11" height="15.5" rx="2" fill="currentColor" />
      <path
        d="M9.5 15.5l2-2.5 1.5 1.5 2-3"
        stroke="var(--surface-base)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
