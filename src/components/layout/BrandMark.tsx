/**
 * TCGTracker mark: a trading card in portrait with a catalog rule across the
 * top and a stepped price tick below — "the card and its ledger line".
 * The corner notch is the gold "graded" accent. Uses currentColor for the
 * body so it inherits ink, and --gold-line for the accent.
 */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect x="4.5" y="1.75" width="15" height="20.5" rx="2" fill="currentColor" />
      <path d="M15.5 1.75h2a2 2 0 0 1 2 2v2z" fill="var(--gold-line)" />
      <path d="M7.5 6.25h6" stroke="var(--surface-base)" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M7.5 17.5h2.25v-2.75h2.5v1.5h2.25V11.5h2"
        stroke="var(--surface-base)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Wordmark set in the editorial face with a mono "TCG" tag. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="font-display text-[19px] font-medium tracking-[-0.01em] text-ink-primary">
        TCG<span className="italic">Tracker</span>
      </span>
    </span>
  );
}
