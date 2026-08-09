import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowRight,
  BellRing,
  Camera,
  ChevronRight,
  History,
  LineChart,
  Package,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { PortfolioSummary } from '@/components/common/PortfolioSummary';
import { TopMovers } from '@/components/common/TopMovers';
import { cn } from '@/lib/utils';

const GATEWAYS: { label: string; hint: string; href: string; icon: LucideIcon }[] = [
  { label: 'Browse cards', hint: 'Catalog', href: '/browse', icon: Search },
  { label: 'Open vault', hint: 'Holdings', href: '/vault', icon: ShieldCheck },
  { label: 'Market prices', hint: 'Live', href: '/prices', icon: TrendingUp },
  { label: 'Rip packs', hint: 'Sim', href: '/packs', icon: Package },
  { label: 'AI grade', hint: 'Tools', href: '/grading', icon: ScanLine },
  { label: 'Insights', hint: 'Predict', href: '/market-insights', icon: LineChart },
];

const SET_TICKER = [
  'Base Set',
  '151',
  'Paldean Fates',
  'Twilight Masquerade',
  'Surging Sparks',
  'Prismatic Evolutions',
  'OP-09 Emperors in the New World',
  'Evolving Skies',
  'Crown Zenith',
  'OP-08 Two Legends',
  'Scarlet & Violet',
  'Lost Origin',
];

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: ReactNode;
  body?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-foil"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow-accent" aria-hidden />
        {eyebrow}
      </motion.p>
      <motion.h2
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.55, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
        className="mt-4 font-display text-3xl font-bold tracking-tight text-ink-primary sm:text-5xl"
      >
        {title}
      </motion.h2>
      {body ? (
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 text-base leading-relaxed text-ink-secondary sm:text-lg"
        >
          {body}
        </motion.p>
      ) : null}
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
  href,
  cta,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="group card-lift card-chrome flex cursor-pointer flex-col rounded-2xl p-6"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent transition-colors duration-200 group-hover:bg-accent/20">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold text-ink-primary">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-secondary">{body}</p>
      <Link
        to={href}
        className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent transition-colors duration-200 hover:text-accent-hover"
      >
        {cta}
        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
      </Link>
    </motion.div>
  );
}

export function MarketChapter() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 pb-24 pt-24 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="01 · The market"
        title={
          <>
            Every price, <span className="text-gradient">live.</span>
          </>
        }
        body="From base rarity to moon-print chase cards — prices update in real time, with full history and alerts on the cards that matter to you."
      />

      <div className="marquee-container mt-14" aria-hidden>
        <div className="marquee-content">
          {[...SET_TICKER, ...SET_TICKER].map((set, i) => (
            <span
              key={`${set}-${i}`}
              className="inline-flex items-center gap-3 text-sm font-medium tracking-[0.14em] text-ink-muted uppercase"
            >
              <span className="h-1 w-1 rounded-full bg-foil/60" />
              {set}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FeatureCard
          icon={TrendingUp}
          title="Live price engine"
          body="Prices stream in from multiple market providers and refresh as they move — no stale quotes in your vault."
          href="/prices"
          cta="Price tracker"
        />
        <FeatureCard
          icon={History}
          title="Full price history"
          body="Every high, low and swing plotted against set releases. Know what a card did before you buy it."
          href="/prices"
          cta="Browse history"
        />
        <FeatureCard
          icon={BellRing}
          title="Smart alerts"
          body="Set a target price and get pinged the moment the market crosses it — for raw cards and graded slabs."
          href="/prices"
          cta="Set an alert"
        />
      </div>

      <div className="mt-14">
        <TopMovers />
      </div>
    </section>
  );
}

export function VaultChapter() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="02 · Your vault"
        title={
          <>
            Your collection, <span className="text-gradient">commanded.</span>
          </>
        }
        body="Holdings, set completion, binders and wishlists in one place — with the market value of everything you own, recalculated live."
      />

      <div className="mt-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="card-chrome rounded-2xl"
        >
          <PortfolioSummary />
        </motion.div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GATEWAYS.map((item, i) => (
          <motion.div
            key={item.href}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.45, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
          >
            <Link
              to={item.href}
              className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-border-default bg-surface-raised/80 px-5 py-4 transition-all duration-200 hover:border-accent/40 hover:bg-accent/5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-inset text-ink-secondary transition-colors duration-200 group-hover:border-accent/30 group-hover:text-accent">
                <item.icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
                  {item.hint}
                </span>
                <span className="mt-0.5 block font-display text-base font-semibold text-ink-primary transition-colors duration-200 group-hover:text-accent">
                  {item.label}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-accent" />
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

export function RipChapter() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="03 · The rush"
        title={
          <>
            Rip packs. <span className="text-gradient">Grade cards.</span>
          </>
        }
        body="The dopamine of opening packs with zero cost — then let AI grade and price every pull so it lands straight in your vault."
      />

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FeatureCard
          icon={Package}
          title="Pack simulator"
          body="Open simulated packs with real set odds and pull rates. Chase the big hits without the receipt."
          href="/packs"
          cta="Rip a pack"
        />
        <FeatureCard
          icon={ScanLine}
          title="AI grading"
          body="Scan a card and get condition grading plus a graded-slab price estimate — instantly, from one photo."
          href="/grading"
          cta="Try grading"
        />
        <FeatureCard
          icon={Camera}
          title="Card scanner"
          body="Snap your collection into the vault. Cards are identified and priced automatically, one by one."
          href="/scanner"
          cta="Open scanner"
        />
      </div>
    </section>
  );
}

export function InsightsChapter() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="04 · Ahead of the curve"
        title={
          <>
            See the market <span className="text-gradient">before it moves.</span>
          </>
        }
        body="Collecting at the top of your game means knowing what the crowd is about to chase."
      />

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        <FeatureCard
          icon={Target}
          title="Sentiment radar"
          body="Community chatter from Reddit and YouTube, distilled into a signal you can act on."
          href="/market-insights"
          cta="Read the radar"
        />
        <FeatureCard
          icon={LineChart}
          title="Forecast scorecards"
          body="AI predictions with a forward-testing record you can audit — no black boxes, just results."
          href="/market-insights"
          cta="See scorecards"
        />
        <FeatureCard
          icon={Sparkles}
          title="Set calendar"
          body="Release dates, pre-order windows and historical set performance — plan your buys before launch hype."
          href="/market-insights"
          cta="View calendar"
        />
      </div>
    </section>
  );
}

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden px-4 pb-28 pt-8 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,rgba(110,231,183,0.12),transparent_60%),radial-gradient(ellipse_at_50%_0%,rgba(91,196,212,0.08),transparent_50%)]" />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center"
      >
        <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-foil">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow-accent" aria-hidden />
          Ready when you are
        </p>
        <h2 className="mt-5 font-display text-4xl font-bold tracking-tight text-ink-primary sm:text-6xl">
          Command your <span className="text-gradient">collection.</span>
        </h2>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-secondary sm:text-lg">
          Live prices, vault holdings, AI grading and pack rips — every tool your collection deserves,
          in one command surface.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/browse"
            className={cn(
              buttonVariants({ size: 'lg' }),
              'h-11 cursor-pointer gap-2 rounded-full px-6 text-base shadow-glow-accent'
            )}
          >
            Start browsing
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/vault"
            className={cn(
              buttonVariants({ size: 'lg', variant: 'outline' }),
              'h-11 cursor-pointer rounded-full border-foil/40 px-6 text-base text-foil hover:bg-foil/10'
            )}
          >
            Open vault
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
