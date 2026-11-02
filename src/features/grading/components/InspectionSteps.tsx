import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CategoryKey, RankedCategory } from '../gradingPresentation';
import { cn } from '@/lib/utils';

const ORDER: CategoryKey[] = ['centering', 'corners', 'edges', 'surface'];
const LABEL: Record<CategoryKey, string> = {
  centering: 'Centering',
  corners: 'Corners',
  edges: 'Edges',
  surface: 'Surface',
};

/**
 * The inspection one step at a time, in the order a grader works: centering,
 * corners, edges, surface. Each step moves the photo to that category's
 * evidence; the limiting one is marked.
 */
export function InspectionStepper({
  rows,
  active,
  onSelect,
}: {
  rows: RankedCategory[];
  active: CategoryKey;
  onSelect: (key: CategoryKey) => void;
}) {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const i = Math.max(0, ORDER.indexOf(active));
  const row = byKey.get(active);
  return (
    <div className="mb-4">
      <ol className="grid grid-cols-4 gap-1.5" aria-label="Inspection steps">
        {ORDER.map((key, n) => {
          const r = byKey.get(key);
          const on = key === active;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onSelect(key)}
                aria-current={on ? 'step' : undefined}
                className={cn(
                  'relative w-full rounded-xl border px-2 py-2 text-left transition-colors',
                  on
                    ? 'border-ink-primary bg-surface-hover'
                    : 'border-rule hover:bg-surface-hover/60'
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[11px]',
                      on
                        ? 'bg-ink-primary text-surface-base'
                        : 'bg-surface-hover text-ink-secondary'
                    )}
                  >
                    {n + 1}
                  </span>
                  <span className="truncate text-[12.5px] font-medium">{LABEL[key]}</span>
                </span>
                <span className="mt-1 block font-mono text-[12px] tabular-nums text-ink-secondary">
                  {!r || r.withheld ? 'Not scored' : r.score.toFixed(1)}
                </span>
                {r?.limiting ? (
                  <span
                    className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-loss"
                    aria-label="Limits the grade"
                  />
                ) : null}
                {on ? (
                  <motion.span
                    layoutId="inspect-step"
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ink-primary"
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-2 flex items-start justify-between gap-3">
        <p className="min-w-0 text-[13px] text-ink-secondary" aria-live="polite">
          <span className="font-medium text-ink-primary">
            Step {i + 1} of 4 · {LABEL[active]}
            {row?.limiting ? ', the step that limits the grade' : ''}.
          </span>{' '}
          {row?.summary}
        </p>
        <span className="flex shrink-0 gap-1">
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-md border border-rule hover:bg-surface-hover disabled:opacity-40"
            disabled={i === 0}
            onClick={() => onSelect(ORDER[i - 1])}
            aria-label="Previous step"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-md border border-rule hover:bg-surface-hover disabled:opacity-40"
            disabled={i === 3}
            onClick={() => onSelect(ORDER[i + 1])}
            aria-label="Next step"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </span>
      </div>
    </div>
  );
}

/**
 * Shown while the photos are graded: the photo with each check drawn over it
 * in turn. The checks run together on the server, so this names what is
 * being looked at; it does not claim any step has finished.
 */
export function InspectionSequence({ src }: { src: string | null }) {
  const reduce = useReducedMotion();
  const [k, setK] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = window.setInterval(() => setK((n) => (n + 1) % 4), 1400);
    return () => window.clearInterval(t);
  }, [reduce]);
  const key = ORDER[k];
  return (
    <div
      data-theme="dark"
      className="atmo-stage mx-auto grid max-w-3xl items-center gap-6 rounded-3xl p-6 text-white sm:grid-cols-[12rem_minmax(0,1fr)]"
      role="status"
      aria-live="polite"
    >
      <div className="relative mx-auto w-44 overflow-hidden rounded-[10px] bg-black ring-1 ring-white/15">
        {src ? (
          <img
            src={src}
            alt="Front photo being graded"
            className="aspect-[5/7] w-full object-cover"
          />
        ) : (
          <div className="aspect-[5/7] w-full bg-white/5" />
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={key}
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {key === 'centering' ? (
              <>
                <span className="absolute inset-[9%] rounded-[6px] border border-dashed border-[#7f9bff]" />
                <span className="absolute inset-y-0 left-1/2 w-px bg-[#7f9bff]/70" />
                <span className="absolute inset-x-0 top-1/2 h-px bg-[#7f9bff]/70" />
              </>
            ) : key === 'corners' ? (
              ['left-1 top-1', 'right-1 top-1', 'bottom-1 left-1', 'bottom-1 right-1'].map((c) => (
                <span
                  key={c}
                  className={cn('absolute h-8 w-8 rounded-full border-2 border-[#f0bd55]', c)}
                />
              ))
            ) : key === 'edges' ? (
              <span className="absolute inset-[3px] rounded-[8px] border-[3px] border-[#3fd3a8]/80" />
            ) : !reduce ? (
              <motion.span
                className="absolute inset-x-0 h-12 bg-gradient-to-b from-transparent via-white/35 to-transparent"
                animate={{ top: ['-15%', '100%'] }}
                transition={{ duration: 1.3, ease: 'linear' }}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
      <div>
        <p className="font-display text-[22px] font-semibold leading-tight">Inspecting your card</p>
        <ol className="mt-3 space-y-1.5">
          {ORDER.map((o, n) => (
            <li
              key={o}
              className={cn(
                'flex items-center gap-2 text-[14px] transition-colors',
                o === key ? 'text-white' : 'text-white/45'
              )}
            >
              <span
                className={cn(
                  'grid h-5 w-5 place-items-center rounded-full font-mono text-[11px]',
                  o === key ? 'bg-white text-[#0b0e14]' : 'bg-white/10'
                )}
              >
                {n + 1}
              </span>
              {LABEL[o]}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[12.5px] text-white/55">
          The checks run together and take a few seconds. Results appear when all four are done.
        </p>
      </div>
    </div>
  );
}
