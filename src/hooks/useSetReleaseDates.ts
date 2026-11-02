import { useEffect, useState } from 'react';
import { pokemonApi } from '../services/pokemonApi';

let cache: ReadonlyMap<string, string> | null = null;
let pending: Promise<ReadonlyMap<string, string>> | null = null;

function load(): Promise<ReadonlyMap<string, string>> {
  if (cache) return Promise.resolve(cache);
  pending ??= pokemonApi
    .getSets()
    .then((sets) => {
      const m = new Map<string, string>();
      for (const s of sets) if (s?.id && s.releaseDate) m.set(s.id, s.releaseDate);
      // An empty catalog (offline, API down) is not cached, so a later visit retries.
      if (m.size > 0) cache = m;
      return m;
    })
    .catch(() => new Map<string, string>())
    .finally(() => {
      pending = null;
    });
  return pending;
}

/**
 * Set id → release date from the set catalog, for holdings whose stored card
 * record has no release date. Empty until the catalog arrives or if it fails.
 */
export function useSetReleaseDates(enabled = true): ReadonlyMap<string, string> {
  const [dates, setDates] = useState<ReadonlyMap<string, string>>(() => cache ?? new Map());
  useEffect(() => {
    if (!enabled || cache) return;
    let alive = true;
    void load().then((m) => alive && setDates(m));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return cache ?? dates;
}
