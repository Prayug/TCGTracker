import { useState } from 'react';
import { proxyImageUrl } from '../../../utils/cardDisplay';

export function CardThumb({
  src,
  large,
  alt,
  wide = 40,
}: {
  src: string | null | undefined;
  large?: string | null;
  alt: string;
  wide?: number;
}) {
  const [failed, setFailed] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);
  const height = Math.round(wide * 1.4);
  const primary = proxyImageUrl(src) || src || undefined;
  const fallback = proxyImageUrl(large) || large || undefined;

  if (!primary || failed) {
    return (
      <span className="mf__thumb mf__thumb--empty" style={{ width: wide, height }} aria-hidden />
    );
  }

  return (
    <img
      className="mf__thumb"
      src={primary}
      alt={alt}
      width={wide}
      height={height}
      loading="lazy"
      style={{ width: wide, height }}
      onError={(e) => {
        if (!usedFallback && fallback && fallback !== primary) {
          setUsedFallback(true);
          e.currentTarget.src = fallback;
          return;
        }
        setFailed(true);
      }}
    />
  );
}
