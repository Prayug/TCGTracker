import { useEffect, useRef, useState } from 'react';

const PAGE_SIZE = 60;
const AUTO_PAGES = 3;

/**
 * Hybrid pagination: the first three pages reveal as you scroll, then an
 * explicit button takes over so the footer stays reachable and the scroll
 * position stays predictable.
 */
export function useIncrementalReveal<T extends { id: string }>(items: T[]) {
  const [count, setCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const listKey = `${items.length}:${items[0]?.id ?? ''}`;

  useEffect(() => setCount(PAGE_SIZE), [listKey]);

  const hasMore = count < items.length;
  const autoMode = hasMore && count < PAGE_SIZE * AUTO_PAGES;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !autoMode || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setCount((c) => Math.min(c + PAGE_SIZE, items.length));
      },
      { rootMargin: '600px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [autoMode, items.length, listKey]);

  return {
    visible: items.slice(0, count),
    count: Math.min(count, items.length),
    hasMore,
    autoMode,
    sentinelRef,
    pageSize: PAGE_SIZE,
    loadMore: () => setCount((c) => Math.min(c + PAGE_SIZE, items.length)),
  };
}
