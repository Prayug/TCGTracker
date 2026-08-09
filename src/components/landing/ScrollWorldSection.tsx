import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import {
  ArrowDown,
  ArrowUpRight,
  LineChart,
  Package,
  ScanLine,
  Search,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { ScrollWorld } from '@/components/three/ScrollWorld';
import { usePrefersReducedMotion } from '@/hooks/useMotionPreferences';
import { cn } from '@/lib/utils';

type ChapterKey = 'prices' | 'vault' | 'rip' | 'insights';

const CHAPTERS: {
  key: ChapterKey;
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  dockKey: string;
}[] = [
  {
    key: 'prices',
    eyebrow: '01 · Market',
    title: 'Every price. Live.',
    body: 'Real-time card prices, history, and alerts — the market pulse for Pokemon and One Piece.',
    href: '/prices',
    cta: 'Open prices',
    dockKey: 'prices',
  },
  {
    key: 'vault',
    eyebrow: '02 · Vault',
    title: 'Your collection, commanded.',
    body: 'Holdings, set completion, binders and wishlists — what you own and what it’s worth.',
    href: '/vault',
    cta: 'Open vault',
    dockKey: 'vault',
  },
  {
    key: 'rip',
    eyebrow: '03 · Tools',
    title: 'Rip packs. Grade cards.',
    body: 'Simulated pack openings with real pull rates, plus AI grading from a single scan.',
    href: '/packs',
    cta: 'Open packs',
    dockKey: 'packs',
  },
  {
    key: 'insights',
    eyebrow: '04 · Edge',
    title: 'See the move before it hits.',
    body: 'Sentiment, forecasts, and forward-tested predictions that turn collecting into an edge.',
    href: '/market-insights',
    cta: 'Open insights',
    dockKey: 'insights',
  },
];

const FEATURES: {
  key: string;
  label: string;
  hint: string;
  href: string;
  icon: LucideIcon;
  chapter?: ChapterKey;
}[] = [
  { key: 'browse', label: 'Browse', hint: 'Catalog', href: '/browse', icon: Search },
  { key: 'prices', label: 'Prices', hint: 'Live market', href: '/prices', icon: TrendingUp, chapter: 'prices' },
  { key: 'vault', label: 'Vault', hint: 'Holdings', href: '/vault', icon: ShieldCheck, chapter: 'vault' },
  { key: 'packs', label: 'Packs', hint: 'Rip sims', href: '/packs', icon: Package, chapter: 'rip' },
  { key: 'grade', label: 'Grade', hint: 'AI scan', href: '/grading', icon: ScanLine },
  { key: 'insights', label: 'Insights', hint: 'Forecasts', href: '/market-insights', icon: LineChart, chapter: 'insights' },
];

function scrollToMarketPulse(e?: { preventDefault?: () => void }) {
  e?.preventDefault?.();
  document.getElementById('market-pulse')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** How many viewport-heights of wheel delta equal a full 0→1 tour. */
const SCROLL_PAGES = 3.2;

function wrap01(n: number) {
  const f = n % 1;
  return f < 0 ? f + 1 : f;
}

function chapterIndexFromProgress(loop: number) {
  return Math.min(CHAPTERS.length - 1, Math.floor(loop * CHAPTERS.length));
}

function useChapterMotion(progress: MotionValue<number>, index: number, total: number) {
  const seg = 1 / total;
  const start = index * seg;
  const end = start + seg;
  const opacity = useTransform(progress, [start, start + 0.08, end - 0.08, end], [0, 1, 1, 0]);
  const y = useTransform(progress, [start, start + 0.1], [28, 0]);
  return { opacity, y };
}

function ChapterLayer({
  chapter,
  index,
  progress,
}: {
  chapter: (typeof CHAPTERS)[number];
  index: number;
  progress: MotionValue<number>;
}) {
  const { opacity, y } = useChapterMotion(progress, index, CHAPTERS.length);
  return (
    <motion.div
      style={{ opacity, y }}
      className="absolute inset-x-0 bottom-[7.5rem] px-5 sm:bottom-[8.5rem] sm:px-10 lg:px-14"
    >
      <div className="mx-auto flex max-w-xl flex-col items-start sm:mx-0">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-foil">{chapter.eyebrow}</p>
        <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink-primary sm:text-5xl">
          {chapter.title}
        </h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-secondary sm:text-base">{chapter.body}</p>
        <div className="pointer-events-auto mt-5 flex flex-wrap items-center gap-2.5">
          <Link
            to={chapter.href}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow-accent transition-all duration-200 hover:bg-accent-hover"
          >
            {chapter.cta}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <Link
            to="/browse"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border-default bg-surface-raised/70 px-4 py-2.5 text-sm font-semibold text-ink-primary backdrop-blur-md transition-colors hover:border-accent/40 hover:text-accent"
          >
            Browse cards
          </Link>
          <button
            type="button"
            onClick={scrollToMarketPulse}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-foil/35 bg-foil/10 px-4 py-2.5 text-sm font-semibold text-foil transition-colors hover:bg-foil/20"
          >
            Top movers
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function CommandStrip({ activeKey }: { activeKey: ChapterKey }) {
  return (
    <nav
      aria-label="App features"
      className="pointer-events-auto absolute inset-x-0 bottom-3 z-20 px-3 sm:bottom-5 sm:px-6"
    >
      <div className="mx-auto max-w-4xl rounded-2xl border border-border-subtle bg-surface-raised/90 p-2 shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-2.5">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
          Jump into a feature
        </p>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {FEATURES.map(({ key, label, hint, href, icon: Icon, chapter }) => {
            const active = chapter === activeKey;
            return (
              <Link
                key={key}
                to={href}
                className={cn(
                  'group flex min-w-0 cursor-pointer flex-col gap-0.5 rounded-xl px-2.5 py-2.5 transition-all duration-200 sm:px-3',
                  active
                    ? 'bg-accent/18 text-accent shadow-[inset_0_0_0_1px_rgba(110,231,183,0.35)]'
                    : 'text-ink-secondary hover:bg-white/[0.06] hover:text-ink-primary'
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-accent' : 'text-foil')} />
                  <span className="truncate text-xs font-semibold sm:text-sm">{label}</span>
                </span>
                <span
                  className={cn(
                    'truncate pl-5 text-[10px] sm:text-[11px]',
                    active ? 'text-accent/80' : 'text-ink-muted'
                  )}
                >
                  {hint}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function ScrollWorldCopy({
  progress,
  activeKey,
}: {
  progress: MotionValue<number>;
  activeKey: ChapterKey;
}) {
  const loopProgress = useTransform(progress, wrap01);

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="absolute left-5 top-5 sm:left-10 sm:top-7">
        <p className="font-display text-2xl font-bold tracking-tight text-ink-primary sm:text-3xl">
          TCG<span className="text-accent">Tracker</span>
        </p>
        <p className="mt-1 max-w-[16rem] text-xs text-ink-secondary sm:text-sm">
          Scroll to tour · tap Top movers for daily swings.
        </p>
      </div>

      <div className="absolute right-5 top-5 hidden sm:block sm:right-10 sm:top-7">
        <Link
          to="/browse"
          className="pointer-events-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-accent/35 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition-all hover:bg-accent/20"
        >
          Browse catalog
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {CHAPTERS.map((chapter, i) => (
        <ChapterLayer key={chapter.key} chapter={chapter} index={i} progress={loopProgress} />
      ))}

      <CommandStrip activeKey={activeKey} />
    </div>
  );
}

function StaticFallback() {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(110,231,183,0.1),transparent_55%),radial-gradient(ellipse_at_80%_80%,rgba(91,196,212,0.08),transparent_50%)]" />
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-36 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-foil">Collection command</p>
        <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink-primary sm:text-6xl">
          Market, vault, packs,
          <br />
          <span className="text-gradient">insights.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-md text-ink-secondary">
          Live prices, holdings, pack rips and forecasts — pick a feature below to start.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/browse"
            className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-accent px-6 text-base font-semibold text-primary-foreground shadow-glow-accent transition-all duration-200 hover:bg-accent-hover"
          >
            Start browsing
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={scrollToMarketPulse}
            className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-foil/35 bg-foil/10 px-6 text-base font-semibold text-foil transition-colors hover:bg-foil/20"
          >
            Top movers
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>
      </div>
      <CommandStrip activeKey="prices" />
    </div>
  );
}

export function ScrollWorldSection() {
  const reduced = usePrefersReducedMotion();
  const containerRef = useRef<HTMLElement>(null);
  const progressRef = useRef(0);
  const touchY = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [activeKey, setActiveKey] = useState<ChapterKey>('prices');

  const rawProgress = useMotionValue(0);
  const progress = useSpring(rawProgress, { stiffness: 120, damping: 28, mass: 0.35 });

  useMotionValueEvent(progress, 'change', (v) => {
    progressRef.current = v;
    const idx = chapterIndexFromProgress(wrap01(v));
    const next = CHAPTERS[idx].key;
    setActiveKey((prev) => (prev === next ? prev : next));
  });

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (reduced) return;

    const pageAtTourTop = () => window.scrollY < 8;

    const bump = (deltaPx: number) => {
      const page = window.innerHeight * SCROLL_PAGES || 1;
      rawProgress.set(rawProgress.get() + deltaPx / page);
    };

    const onWheel = (e: WheelEvent) => {
      // Once the user has scrolled to Market Pulse, never hijack the wheel.
      if (!pageAtTourTop()) return;

      const target = e.target as HTMLElement | null;
      if (target?.closest?.('a, button, input, textarea, select, [role="dialog"]')) return;
      e.preventDefault();
      bump(e.deltaY);
    };

    const onTouchStart = (e: TouchEvent) => {
      touchY.current = e.touches[0]?.clientY ?? null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pageAtTourTop()) return;
      if (touchY.current == null) return;
      const y = e.touches[0]?.clientY;
      if (y == null) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('a, button, input, textarea, select, [role="dialog"]')) return;
      e.preventDefault();
      bump(touchY.current - y);
      touchY.current = y;
    };

    const onTouchEnd = () => {
      touchY.current = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!pageAtTourTop()) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        document.getElementById('market-pulse')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (e.key === ' ') {
        e.preventDefault();
        bump(window.innerHeight * 0.35);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        bump(-window.innerHeight * 0.35);
      } else if (e.key === 'Home') {
        e.preventDefault();
        rawProgress.set(Math.floor(rawProgress.get()));
      }
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [rawProgress, reduced]);

  return (
    <section
      ref={containerRef}
      aria-label="Guided tour"
      tabIndex={0}
      className="relative h-[calc(100dvh-3.5rem)] max-md:h-[calc(100dvh-3.5rem-5rem)] overflow-hidden outline-none"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(110,231,183,0.07),transparent_55%),radial-gradient(ellipse_at_50%_110%,rgba(91,196,212,0.06),transparent_45%)]" />

      {reduced || !ready ? (
        <StaticFallback />
      ) : (
        <>
          <ScrollWorld className="absolute inset-0" progressRef={progressRef} />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(12,17,24,0.4)_0%,rgba(12,17,24,0.1)_38%,rgba(12,17,24,0.72)_100%)]" />
        </>
      )}

      {!reduced && <ScrollWorldCopy progress={progress} activeKey={activeKey} />}
    </section>
  );
}
