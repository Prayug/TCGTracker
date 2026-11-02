import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Plus } from 'lucide-react';
import { HolographicCard } from '../../../components/collectible/HolographicCard';
import { formatCurrency } from '../../../utils/cardDisplay';
import type { TradeCardLine } from '../types';
import { cn } from '@/lib/utils';

/**
 * The trade on a table: what you give stacked on the left, what you get on
 * the right, and a balance beam between them that tips toward the heavier
 * side. The tilt is the real value difference, capped so it stays readable.
 */
export function TradeStage({
  give,
  get,
  giveValue,
  getValue,
  cashGive,
  cashGet,
  verdict,
  verdictTone,
  detail,
  fair,
  onAdd,
}: {
  give: TradeCardLine[];
  get: TradeCardLine[];
  giveValue: number;
  getValue: number;
  cashGive: number;
  cashGet: number;
  verdict: string;
  verdictTone: 'gain' | 'loss' | 'neutral';
  detail: string;
  fair: boolean;
  onAdd: (side: 'give' | 'get') => void;
}) {
  const reduce = useReducedMotion();
  const larger = Math.max(giveValue, getValue);
  // The heavier side sinks: negative tilts the left (give) pan down.
  const diff = getValue - giveValue;
  const tilt = larger > 0 ? Math.max(-12, Math.min(12, (-diff / larger) * 24)) : 0;

  return (
    <section
      data-theme="dark"
      aria-labelledby="trade-balance"
      className="atmo-stage relative overflow-hidden rounded-3xl px-4 pb-6 pt-6 text-white sm:px-8 sm:pb-8"
    >
      <h2 id="trade-balance" className="sr-only">
        Balance
      </h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)] lg:items-end">
        <Pile
          side="give"
          title="You give"
          lines={give}
          cash={cashGive}
          value={giveValue}
          onAdd={() => onAdd('give')}
        />
        <div className="order-last col-span-2 lg:order-none lg:col-span-1">
          <div className="relative mx-auto h-32 max-w-[26rem]" aria-hidden>
            {/* Fulcrum */}
            <span className="absolute bottom-0 left-1/2 h-16 w-0 -translate-x-1/2 border-x-[22px] border-b-[56px] border-x-transparent border-b-white/15" />
            <motion.div
              className="absolute inset-x-0 top-[calc(50%-4px)] origin-center"
              animate={{ rotate: reduce ? 0 : -tilt }}
              transition={{ type: 'spring', stiffness: 90, damping: 11, mass: 1.1 }}
            >
              <div className="relative h-1.5 rounded-full bg-gradient-to-r from-white/50 via-white/80 to-white/50">
                <Pan
                  label={formatCurrency(giveValue)}
                  className="left-0"
                  tilt={reduce ? 0 : -tilt}
                />
                <Pan
                  label={formatCurrency(getValue)}
                  className="right-0"
                  tilt={reduce ? 0 : -tilt}
                />
              </div>
            </motion.div>
          </div>
          <div className="mt-3 text-center" aria-live="polite">
            <p
              className={cn(
                'text-[19px] font-semibold',
                verdictTone === 'gain'
                  ? 'text-[color:var(--gain)]'
                  : verdictTone === 'loss'
                    ? 'text-[color:var(--loss)]'
                    : 'text-white'
              )}
            >
              {fair ? <Check className="mr-1 inline h-4 w-4 align-[-2px]" aria-hidden /> : null}
              {verdict}
            </p>
            <p className="mt-1 text-[13px] tabular-nums text-white/65">{detail}</p>
          </div>
        </div>
        <Pile
          side="get"
          title="You get"
          lines={get}
          cash={cashGet}
          value={getValue}
          onAdd={() => onAdd('get')}
        />
      </div>
    </section>
  );
}

function Pan({ label, className, tilt }: { label: string; className: string; tilt: number }) {
  // Counter-rotate so the price hangs level, like a pan on a pivot.
  return (
    <motion.span
      className={cn('absolute top-1.5 flex origin-top flex-col items-center', className)}
      animate={{ rotate: -tilt }}
      transition={{ type: 'spring', stiffness: 90, damping: 11, mass: 1.1 }}
    >
      <span className="h-6 w-px bg-white/40" />
      <span className="rounded-full bg-white/10 px-2.5 py-1 font-mono text-[12.5px] tabular-nums text-white ring-1 ring-white/20 backdrop-blur">
        {label}
      </span>
    </motion.span>
  );
}

function Pile({
  side,
  title,
  lines,
  cash,
  value,
  onAdd,
}: {
  side: 'give' | 'get';
  title: string;
  lines: TradeCardLine[];
  cash: number;
  value: number;
  onAdd: () => void;
}) {
  const reduce = useReducedMotion();
  const shown = lines.slice(0, 5);
  const copies = lines.reduce((s, l) => s + l.quantity, 0);
  const mirror = side === 'get' ? -1 : 1;
  return (
    <div className={cn('min-w-0', side === 'get' && 'text-right')}>
      <p className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-white/55">{title}</p>
      <p className="mt-0.5 font-mono text-[24px] font-medium tabular-nums sm:text-[30px]">
        {formatCurrency(value)}
      </p>
      <p className="text-[12.5px] text-white/55">
        {copies ? `${copies} card${copies === 1 ? '' : 's'}` : 'No cards yet'}
        {cash > 0 ? ` · ${formatCurrency(cash)} cash` : ''}
      </p>
      <div className="relative mt-4 h-[11.5rem] sm:h-[14rem]">
        {shown.length === 0 ? (
          <button
            type="button"
            onClick={onAdd}
            className={cn(
              'absolute top-0 grid aspect-[5/7] h-full place-items-center rounded-[6%/4.3%] border-2 border-dashed border-white/25 text-white/60 transition-colors hover:border-white/50 hover:text-white',
              side === 'get' ? 'right-0' : 'left-0'
            )}
          >
            <span className="flex flex-col items-center gap-1 text-[13px]">
              <Plus className="h-5 w-5" aria-hidden />
              Add a card
            </span>
          </button>
        ) : (
          <AnimatePresence initial={false}>
            {shown.map((l, i) => (
              <motion.div
                key={l.id}
                className={cn('absolute top-0 h-full', side === 'get' ? 'right-0' : 'left-0')}
                style={{ zIndex: shown.length - i }}
                initial={reduce ? false : { opacity: 0, y: -40, rotate: 0 }}
                animate={{ opacity: 1, y: i * 4, x: mirror * i * 22, rotate: mirror * (i * 4 - 2) }}
                exit={{ opacity: 0, y: 30, transition: { duration: 0.2 } }}
                transition={{ type: 'spring', stiffness: 220, damping: 22 }}
              >
                <div className="aspect-[5/7] h-full">
                  <HolographicCard
                    card={{
                      name: l.name,
                      rarity: l.rarity,
                      images: { small: l.imageSmall, large: l.imageSmall },
                    }}
                    level={i === 0 ? 'featured' : 'standard'}
                    interactive={i === 0}
                  />
                </div>
                {l.quantity > 1 && i === 0 ? (
                  <span className="absolute -right-2 -top-2 rounded-full bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-[#0b0e14]">
                    ×{l.quantity}
                  </span>
                ) : null}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        {lines.length > shown.length ? (
          <span
            className={cn(
              'absolute bottom-0 rounded-full bg-white/10 px-2 py-0.5 font-mono text-[11px] text-white/75',
              side === 'get' ? 'left-0' : 'right-0'
            )}
          >
            +{lines.length - shown.length} more
          </span>
        ) : null}
      </div>
    </div>
  );
}
