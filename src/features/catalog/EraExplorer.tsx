import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { pokemonApi } from '../../services/pokemonApi';
import type { PokemonSet } from '../../types/pokemon';
import { eraOfRelease, type EraBand } from '../../utils/portfolio';
import { cn } from '@/lib/utils';

const ERAS: { id: Exclude<EraBand, 'Unknown'>; line: string; tone: string }[] = [
  { id: 'Vintage', line: 'Wizards of the Coast to e-Card, up to 2003', tone: '#c4892b' },
  { id: 'Mid-era', line: 'EX through XY, 2004 to 2016', tone: '#1fb38a' },
  { id: 'Modern', line: 'Sun & Moon onward, 2017 on', tone: '#2f56e6' },
];

/**
 * The catalog by era: pick a band and its sets appear with their real logos,
 * oldest first, each linking to the set. Bands come from each set's release
 * date in the catalog; sets without one are counted, not placed.
 */
export function EraExplorer() {
  const [sets, setSets] = useState<PokemonSet[] | null>(null);
  const [era, setEra] = useState<(typeof ERAS)[number]['id']>('Vintage');
  const reduce = useReducedMotion();
  useEffect(() => {
    let alive = true;
    pokemonApi.getSets().then((s) => alive && setSets(s));
    return () => {
      alive = false;
    };
  }, []);

  const byEra = useMemo(() => {
    const m = new Map<EraBand, PokemonSet[]>();
    for (const s of sets ?? []) {
      const band = eraOfRelease(s.releaseDate);
      m.set(band, [...(m.get(band) ?? []), s]);
    }
    for (const list of m.values())
      list.sort((a, b) => (a.releaseDate || '').localeCompare(b.releaseDate || ''));
    return m;
  }, [sets]);

  if (sets && sets.length === 0) return null;
  const list = byEra.get(era) ?? [];
  const years = list.length
    ? `${list[0].releaseDate.slice(0, 4)} to ${list[list.length - 1].releaseDate.slice(0, 4)}`
    : '';
  const cards = list.reduce((s, x) => s + (x.total || 0), 0);
  const undated = byEra.get('Unknown')?.length ?? 0;

  return (
    <section aria-labelledby="eras-h">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="eras-h"
            className="font-display text-[clamp(1.4rem,2.4vw,1.9rem)] font-semibold tracking-[-0.02em]"
          >
            Vintage to modern
          </h2>
          <p className="text-[13px] text-ink-muted">Every set in the catalog, by release year.</p>
        </div>
        <div className="segmented" role="group" aria-label="Era">
          {ERAS.map((e) => (
            <button
              key={e.id}
              type="button"
              aria-pressed={era === e.id}
              onClick={() => setEra(e.id)}
            >
              {e.id}
              <span className="ml-1.5 font-mono text-[11px] text-ink-muted">
                {byEra.get(e.id)?.length ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-border-default bg-surface-raised p-5 sm:p-6">
        {!sets ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <p className="text-[15px] font-semibold">
                <span
                  className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                  style={{ background: ERAS.find((e) => e.id === era)?.tone }}
                />
                {era}
              </p>
              <p className="text-[13px] text-ink-secondary">
                {ERAS.find((e) => e.id === era)?.line}
              </p>
              <p className="font-mono text-[12px] text-ink-muted">
                {list.length} sets{years ? ` · ${years}` : ''}
                {cards ? ` · ${cards.toLocaleString()} cards` : ''}
              </p>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.ul
                key={era}
                className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8"
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
              >
                {list.map((s) => (
                  <li key={s.id}>
                    <Link
                      to={`/sets/${encodeURIComponent(s.id)}`}
                      className="group flex h-full flex-col items-center gap-1.5 rounded-xl border border-transparent p-2 text-center transition-colors hover:border-border-default hover:bg-surface-hover"
                    >
                      <span className="grid h-12 w-full place-items-center">
                        {s.images?.logo ? (
                          <img
                            src={s.images.logo}
                            alt=""
                            loading="lazy"
                            className="max-h-12 max-w-full object-contain transition-transform duration-200 group-hover:scale-105"
                          />
                        ) : (
                          <span className="font-display text-[13px] font-semibold text-ink-muted">
                            {s.name}
                          </span>
                        )}
                      </span>
                      <span className="w-full truncate text-[12px] font-medium">{s.name}</span>
                      <span className={cn('font-mono text-[10.5px] text-ink-muted')}>
                        {s.releaseDate?.slice(0, 4)} · {s.total}
                      </span>
                    </Link>
                  </li>
                ))}
              </motion.ul>
            </AnimatePresence>
            {undated ? (
              <p className="mt-3 text-[11.5px] text-ink-muted">
                {undated} set{undated === 1 ? ' has' : 's have'} no release date in the catalog and
                {undated === 1 ? ' is' : ' are'} not placed in an era.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
