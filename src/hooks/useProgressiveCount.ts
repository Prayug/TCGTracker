import { useEffect, useRef, useState } from 'react';

/**
 * Render a long grid in steps: start with `step` items and add another step
 * whenever the sentinel element nears the viewport. Resets when `total`'s
 * identity key changes (e.g. a new sort or filter).
 */
export function useProgressiveCount(total: number, step = 48, resetKey: unknown = null) {
  const [count, setCount] = useState(step);
  const sentinel = useRef<HTMLLIElement | null>(null);

  useEffect(() => setCount(step), [resetKey, step]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || count >= total) return;
    if (typeof IntersectionObserver === 'undefined') {
      setCount(total);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setCount((c) => Math.min(total, c + step));
      },
      { rootMargin: '600px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [count, total, step]);

  return { count: Math.min(count, total), sentinel, done: count >= total };
}
