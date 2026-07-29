import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { proxyImageUrl } from '@/utils/cardDisplay';
import { cn } from '@/lib/utils';

export type FeatureKey = 'prices' | 'vault' | 'rip' | 'insights';

const DEMO_CARDS = [
  proxyImageUrl('https://images.pokemontcg.io/swsh7/215_hires.png')!,
  proxyImageUrl('https://images.pokemontcg.io/base1/4_hires.png')!,
  proxyImageUrl('https://images.pokemontcg.io/swsh11/186_hires.png')!,
  proxyImageUrl('https://images.pokemontcg.io/sv4pt5/232_hires.png')!,
  proxyImageUrl('https://images.pokemontcg.io/swsh8/271_hires.png')!,
  proxyImageUrl('https://images.pokemontcg.io/sv2/203_hires.png')!,
];

const SPARK = [42, 45, 44, 48, 52, 51, 58, 63, 61, 70, 74, 72, 81, 88, 92];

function DemoCard({
  src,
  className,
  style,
}: {
  src: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-white/10 bg-surface-raised shadow-[0_18px_40px_rgba(0,0,0,0.45)]',
        className
      )}
      style={style}
    >
      <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
    </div>
  );
}

function PricesDemo() {
  const gradId = useId().replace(/:/g, '');
  const path = useMemo(() => {
    const w = 220;
    const h = 72;
    return SPARK.map((v, i) => {
      const x = (i / (SPARK.length - 1)) * w;
      const y = h - ((v - 40) / 55) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }, []);

  return (
    <div className="relative flex h-full flex-col items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 24, rotateX: 12 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-[min(100%,220px)] [transform-style:preserve-3d]"
      >
        <DemoCard src={DEMO_CARDS[0]} className="aspect-[63/88] w-full" />
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mt-4 rounded-xl border border-border-subtle bg-surface-raised/90 p-3 backdrop-blur-md"
        >
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-ink-muted">Market</p>
              <p className="font-display text-lg font-bold text-ink-primary">$412.50</p>
            </div>
            <p className="text-sm font-semibold text-[var(--gain)]">+12.4%</p>
          </div>
          <svg viewBox="0 0 220 72" className="mt-2 h-16 w-full overflow-visible" aria-hidden>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6EE7B7" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0" />
              </linearGradient>
            </defs>
            <motion.path
              d={`${path} L220 72 L0 72 Z`}
              fill={`url(#${gradId})`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
            />
            <motion.path
              d={path}
              fill="none"
              stroke="#6EE7B7"
              strokeWidth="2.5"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            />
          </svg>
        </motion.div>
      </motion.div>
    </div>
  );
}

function VaultDemo() {
  return (
    <div className="relative flex h-full items-center justify-center">
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {DEMO_CARDS.map((src, i) => (
          <motion.div
            key={src}
            initial={{ opacity: 0, scale: 0.7, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.08 * i, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <DemoCard src={src} className="aspect-[63/88] w-[72px] sm:w-[88px]" />
          </motion.div>
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-accent/30 bg-surface-raised/90 px-4 py-1.5 text-xs font-semibold text-accent backdrop-blur-md"
      >
        Vault value · $8,240
      </motion.div>
    </div>
  );
}

function PacksDemo() {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    setOpened(false);
    const t = window.setTimeout(() => setOpened(true), 450);
    return () => window.clearTimeout(t);
  }, []);

  const fan = [-28, -14, 0, 14, 28];

  return (
    <div className="relative flex h-full flex-col items-center justify-center">
      <div className="relative h-[280px] w-full max-w-sm [perspective:900px]">
        <AnimatePresence>
          {!opened && (
            <motion.div
              key="pack"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0, rotateX: -20 }}
              className="absolute left-1/2 top-1/2 h-44 w-32 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-accent/40 bg-gradient-to-br from-accent/30 via-surface-overlay to-foil/20 shadow-glow-accent"
            >
              <div className="flex h-full flex-col items-center justify-center gap-2">
                <span className="font-display text-sm font-bold text-ink-primary">PACK</span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-foil">Rip it</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {opened &&
          fan.map((rot, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40, rotate: 0, x: '-50%' }}
              animate={{ opacity: 1, y: 0, rotate: rot, x: `calc(-50% + ${rot * 1.8}px)` }}
              transition={{ delay: 0.08 * i, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="absolute left-1/2 top-10 origin-bottom"
              style={{ zIndex: 10 - Math.abs(i - 2) }}
            >
              <DemoCard src={DEMO_CARDS[i]} className="aspect-[63/88] w-[100px] sm:w-[118px]" />
            </motion.div>
          ))}
      </div>
    </div>
  );
}

function InsightsDemo() {
  const bars = [
    { label: 'Sentiment', value: 78, color: '#6EE7B7' },
    { label: 'Forecast', value: 64, color: '#5BC4D4' },
    { label: 'Confidence', value: 86, color: '#6EE7B7' },
  ];

  return (
    <div className="relative flex h-full items-center justify-center px-4">
      <div className="w-full max-w-xs space-y-5 rounded-2xl border border-border-subtle bg-surface-raised/85 p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-foil">Forward test</p>
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
            Rising
          </span>
        </div>
        <DemoCard src={DEMO_CARDS[2]} className="mx-auto aspect-[63/88] w-28" />
        <div className="space-y-3">
          {bars.map((bar, i) => (
            <div key={bar.label}>
              <div className="mb-1 flex justify-between text-[11px] text-ink-secondary">
                <span>{bar.label}</span>
                <span className="tabular-nums text-ink-primary">{bar.value}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: bar.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${bar.value}%` }}
                  transition={{ delay: 0.15 + i * 0.12, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const SECTION_GLOW: Record<FeatureKey, string> = {
  prices: 'rgba(110,231,183,0.22)',
  vault: 'rgba(91,196,212,0.2)',
  rip: 'rgba(110,231,183,0.28)',
  insights: 'rgba(91,196,212,0.24)',
};

export function FeatureStage({ active }: { active: FeatureKey }) {
  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden">
      <motion.div
        key={`glow-${active}`}
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          background: `radial-gradient(ellipse at 50% 40%, ${SECTION_GLOW[active]}, transparent 62%)`,
        }}
      />

      {/* Parallax depth planes */}
      <motion.div
        className="pointer-events-none absolute -left-6 top-10 opacity-25"
        animate={{ y: [0, -10, 0], x: [0, 4, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      >
        <DemoCard src={DEMO_CARDS[4]} className="aspect-[63/88] w-16 rotate-[-18deg]" />
      </motion.div>
      <motion.div
        className="pointer-events-none absolute -right-4 bottom-16 opacity-20"
        animate={{ y: [0, 12, 0], x: [0, -6, 0] }}
        transition={{ duration: 8.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <DemoCard src={DEMO_CARDS[5]} className="aspect-[63/88] w-20 rotate-[14deg]" />
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 0.96, filter: 'blur(6px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 1.02, filter: 'blur(4px)' }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          {active === 'prices' && <PricesDemo />}
          {active === 'vault' && <VaultDemo />}
          {active === 'rip' && <PacksDemo />}
          {active === 'insights' && <InsightsDemo />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
