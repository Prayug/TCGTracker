import type { SVGProps } from 'react';
import type { AreaId } from '../../app/navigation';

/**
 * Purpose-built line icons for the five areas. Drawn on a 24px grid with a
 * 1.5px stroke so they sit with lucide icons, but each one is built from a
 * trading-card silhouette (5:7) so the rail reads as this product's, not a
 * generic dashboard's.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 22, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Home: a desk ledger — one card propped against a ruled sheet. */
export function HomeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 20.5h17" />
      <path d="M5 20.5V9.2L12 4l7 5.2v11.3" />
      <rect x="9.5" y="12" width="5" height="8.5" rx="0.8" />
    </Base>
  );
}

/** Discover: a card with a loupe over its corner. */
export function DiscoverIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3.5" y="3" width="11" height="15.5" rx="1.4" />
      <path d="M6.5 7h5M6.5 10h3" />
      <circle cx="15.5" cy="15" r="3.6" />
      <path d="m18.2 17.7 2.6 2.6" />
    </Base>
  );
}

/** Collection: a binder page — rings on the spine and a 3×3 pocket grid. */
export function CollectionIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="5" y="3" width="15.5" height="18" rx="1.4" />
      <path d="M3.5 7.5h3M3.5 12h3M3.5 16.5h3" />
      <path d="M10.2 3v18M15.3 3v18M5 9h15.5M5 15h15.5" strokeWidth={1} />
    </Base>
  );
}

/** Market: a stepped price line over a baseline, sampled not smoothed. */
export function MarketIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 20.5h17" />
      <path d="M4 16.5h3.5v-4H11v2h3.5V8H18V5h2.5" />
      <circle cx="20.5" cy="5" r="0.6" fill="currentColor" />
    </Base>
  );
}

/** Tools: crop marks framing a card — the scanner/grader's capture target. */
export function ToolsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 7.5v-4h4M16.5 3.5h4v4M20.5 16.5v4h-4M7.5 20.5h-4v-4" />
      <rect x="8.5" y="7" width="7" height="10" rx="1" />
    </Base>
  );
}

export const AREA_ICONS: Record<AreaId, (props: IconProps) => JSX.Element> = {
  home: HomeIcon,
  discover: DiscoverIcon,
  collection: CollectionIcon,
  market: MarketIcon,
  tools: ToolsIcon,
};

/** Grading break-even: a scale with a slab on one side. Used in tool headers. */
export function SlabIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="6" y="2.5" width="12" height="19" rx="1.5" />
      <path d="M6 7h12" />
      <rect x="8.5" y="9.5" width="7" height="9.5" rx="0.6" strokeWidth={1} />
    </Base>
  );
}
