/**
 * TCGTracker mark: two cards fanned from one corner. The back card is the
 * collection, the front card carries a foil stripe: the piece you are
 * looking at. Body uses currentColor; the stripe uses the holo gradient.
 */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  const id = 'tt-holo';
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff6fae" />
          <stop offset="0.35" stopColor="#ffd36e" />
          <stop offset="0.65" stopColor="#7cf2c2" />
          <stop offset="1" stopColor="#6fb7ff" />
        </linearGradient>
      </defs>
      <rect
        x="3.2"
        y="3.4"
        width="11.5"
        height="16"
        rx="1.8"
        transform="rotate(-12 9 11.4)"
        fill="currentColor"
        opacity="0.45"
      />
      <rect
        x="8.3"
        y="4.2"
        width="11.5"
        height="16"
        rx="1.8"
        transform="rotate(8 14 12.2)"
        fill="currentColor"
      />
      <path
        d="M10.6 14.4 18.2 8.3l.5 3.6-7.6 6.1z"
        fill={`url(#${id})`}
        transform="rotate(8 14 12.2)"
      />
    </svg>
  );
}

/** Wordmark set in the editorial face with a mono "TCG" tag. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="font-display text-[19px] font-semibold tracking-[-0.02em] text-ink-primary">
        TCG<span className="font-normal">Tracker</span>
      </span>
    </span>
  );
}
