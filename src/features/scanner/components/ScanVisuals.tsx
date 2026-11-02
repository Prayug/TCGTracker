import { motion, useReducedMotion } from 'motion/react';
import { CardArt } from '../../../components/exchange/CardArt';
import { cn } from '@/lib/utils';

/** Card-shaped framing guide with corner brackets and a slow sweep, shown over the live camera. */
export function FramingGuide({
  label = 'Fill the frame with the card',
  bare = false,
  className,
}: {
  label?: string;
  /** Drawing only, without the instructions, for illustrations. */
  bare?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 flex items-center justify-center',
        className
      )}
    >
      <div className="relative aspect-[5/7] h-[74%] max-h-[420px] rounded-[14px] shadow-[0_0_0_9999px_rgba(5,7,12,0.55)]">
        {(
          [
            'left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-[14px]',
            'right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-[14px]',
            'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-[14px]',
            'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-[14px]',
          ] as const
        ).map((c) => (
          <span key={c} className={cn('absolute h-9 w-9 border-white', c)} />
        ))}
        {/* Where the name and the set number sit on most cards. */}
        <span className="absolute inset-x-[8%] top-[4%] h-[7%] rounded-[4px] border border-dashed border-white/35" />
        <span className="absolute bottom-[3%] left-[6%] h-[5%] w-[30%] rounded-[4px] border border-dashed border-white/35" />
        {!reduce ? (
          <motion.span
            className="absolute inset-x-[4%] h-[2px] rounded-full bg-gradient-to-r from-transparent via-[#7f9bff] to-transparent shadow-[0_0_14px_2px_rgba(127,155,255,0.6)]"
            animate={{ top: ['8%', '92%', '8%'] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        ) : null}
        {bare ? null : (
          <>
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/55 px-3 py-1 text-[12px] font-medium text-white backdrop-blur">
              {label}
            </span>
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11.5px] text-white/75">
              Flat, in even light, no glare on the name
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** The captured photo being read: a sweep across it while recognition runs. */
export function ReadingSweep({
  src,
  text = 'Reading the name, set and number…',
}: {
  src: string | null;
  text?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="flex flex-col items-center gap-4 py-6" role="status" aria-live="polite">
      <div className="relative w-40 overflow-hidden rounded-[10px] bg-black shadow-xl ring-1 ring-white/10">
        {src ? (
          <img src={src} alt="Captured card" className="aspect-[5/7] w-full object-cover" />
        ) : (
          <div className="aspect-[5/7] w-full bg-surface-hover" />
        )}
        {!reduce ? (
          <motion.span
            className="absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-[#7f9bff]/45 to-transparent"
            animate={{ top: ['-20%', '100%'] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
          />
        ) : null}
      </div>
      <p className="text-[13.5px] text-ink-secondary">{text}</p>
    </div>
  );
}

/**
 * Recognition confirmation: your photo beside the catalog card it matched,
 * with the match strength, so a wrong match is easy to spot before saving.
 */
export function MatchCompare({
  photo,
  card,
  confidence,
}: {
  photo: string | null;
  card: { name: string; image?: { small?: string; large?: string }; number?: string; set?: string };
  confidence: number;
}) {
  const reduce = useReducedMotion();
  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  const tone = pct >= 80 ? 'var(--gain)' : pct >= 50 ? '#f0bd55' : 'var(--loss)';
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5">
      <figure className="min-w-0">
        <div className="overflow-hidden rounded-[8px] bg-black ring-1 ring-rule-strong">
          {photo ? (
            <img
              src={photo}
              alt="The card as you captured it"
              className="aspect-[5/7] w-full object-cover"
            />
          ) : (
            <div className="grid aspect-[5/7] place-items-center text-[11px] text-ink-muted">
              No photo kept
            </div>
          )}
        </div>
        <figcaption className="mt-1.5 text-center text-[11.5px] text-ink-muted">
          Your photo
        </figcaption>
      </figure>
      <div className="flex flex-col items-center gap-1.5" aria-hidden>
        <svg viewBox="0 0 60 60" className="h-14 w-14 -rotate-90">
          <circle
            cx="30"
            cy="30"
            r="25"
            fill="none"
            stroke="var(--surface-hover)"
            strokeWidth="6"
          />
          <motion.circle
            cx="30"
            cy="30"
            r="25"
            fill="none"
            stroke={tone}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 25}
            initial={{
              strokeDashoffset: reduce ? 2 * Math.PI * 25 * (1 - pct / 100) : 2 * Math.PI * 25,
            }}
            animate={{ strokeDashoffset: 2 * Math.PI * 25 * (1 - pct / 100) }}
            transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
          />
        </svg>
        <span className="font-mono text-[13px] font-medium tabular-nums" style={{ color: tone }}>
          {pct}%
        </span>
      </div>
      <figure className="min-w-0">
        <motion.div
          initial={reduce ? false : { opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
        >
          <CardArt
            card={{
              name: card.name,
              images: card.image,
              number: card.number,
              set: { name: card.set ?? '' },
            }}
            size="large"
          />
        </motion.div>
        <figcaption className="mt-1.5 text-center text-[11.5px] text-ink-muted">
          Catalog match
        </figcaption>
      </figure>
    </div>
  );
}
