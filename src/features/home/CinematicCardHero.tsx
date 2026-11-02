import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { CardStack, type StackItem } from '../../components/collectible/CardStack';
import { CardSpotlight } from '../../components/collectible/CardSpotlight';
import { FINISH_LABEL, finishOf } from '../../components/collectible/finish';
import { Price } from '../../components/exchange/Price';
import { openCommandPalette } from '../../components/common/CommandPalette';
import { useCardModal } from '../../contexts/CardModalContext';
import { useGame } from '../../contexts/GameContext';
import { useVault } from '../../hooks/useVault';
import { useAuth } from '../../hooks/useAuth';
import { useIsMobileViewport, usePrefersReducedMotion } from '../../hooks/useMotionPreferences';
import { summarizePortfolio } from '../../utils/portfolio';
import { formatCurrency } from '../../utils/cardDisplay';
import { useShowcaseCards, type ShowcaseCard } from './useShowcaseCards';
import { heroTone } from './heroTone';
import { cn } from '@/lib/utils';

/**
 * Home's first screen: a dark stage with a layered, interactive stack of real
 * cards. Visitors see iconic prints from the live catalog; collectors see their
 * own most valuable cards with the collection's value beside them.
 */
export function CinematicCardHero() {
  const { cards } = useVault();
  const { user } = useAuth();
  const { isOnePiece } = useGame();
  const { openCard } = useCardModal();
  const compact = useIsMobileViewport(900);
  const reduced = usePrefersReducedMotion();
  const { items, source, loading } = useShowcaseCards(cards, isOnePiece);
  const summary = useMemo(() => summarizePortfolio(cards), [cards]);
  const owner = source === 'vault';

  const stackItems: StackItem[] = useMemo(
    () => items.slice(0, compact ? 3 : 5).map((s) => ({ key: s.key, card: s.card })),
    [items, compact]
  );
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const [front, setFront] = useState<ShowcaseCard | null>(null);
  const [open, setOpen] = useState<{ item: ShowcaseCard; layoutId: string } | null>(null);
  const onFront = useCallback((s: StackItem) => setFront(byKey.get(s.key) ?? null), [byKey]);

  const heading = owner ? (
    <>
      {user?.username ? `${user.username}’s collection,` : 'Your collection,'}{' '}
      <span className="tone-text">on display.</span>
    </>
  ) : (
    <>
      Your collection. <span className="tone-text">In a whole new dimension.</span>
    </>
  );

  return (
    <section
      data-theme="dark"
      aria-labelledby="hero-h"
      className="atmo-stage relative isolate overflow-hidden"
      style={
        {
          '--hero-tone': heroTone(front?.card),
          transition: reduced ? undefined : '--hero-tone 700ms ease',
        } as CSSProperties
      }
    >
      <StageBackdrop />
      <div className="relative mx-auto grid w-full max-w-[1520px] gap-8 px-4 pb-10 pt-8 sm:px-6 md:pt-12 lg:min-h-[640px] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-4 lg:px-8 lg:pb-16">
        <motion.div
          className="relative z-[2] max-w-[38rem]"
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
        >
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[13px] text-white/75">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7cf2c2]" aria-hidden />
            {isOnePiece ? 'One Piece Card Game' : 'Pokémon TCG'} · live catalog and market prices
          </p>
          <h1
            id="hero-h"
            className="mt-5 font-display text-[clamp(2.4rem,4.6vw,4.4rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-white"
          >
            {heading}
          </h1>
          {owner ? (
            <div className="mt-6">
              <Price
                value={summary.marketValue}
                size="xl"
                className="text-white"
                unavailableLabel="Not priced yet"
              />
              <p className="mt-2 text-[15px] text-white/70">
                Market estimate for {summary.copies.toLocaleString()}{' '}
                {summary.copies === 1 ? 'card' : 'cards'}
                {summary.unrealized != null ? (
                  <>
                    {' · '}
                    <span className={summary.unrealized >= 0 ? 'text-[#3fd3a8]' : 'text-[#ff7a6b]'}>
                      {formatCurrency(summary.unrealized, { signed: true })}
                    </span>{' '}
                    on recorded cost
                  </>
                ) : null}
              </p>
            </div>
          ) : (
            <p className="mt-5 max-w-[30ch] text-[clamp(1.05rem,1.6vw,1.3rem)] leading-snug text-white/75">
              Collect, track, grade, and discover the cards that matter.
            </p>
          )}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to={owner ? '/vault' : '/browse'} className="btn-tactile">
              {owner ? 'View my collection' : 'Explore cards'}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link to={owner ? '/browse' : '/vault'} className="btn-glass text-white">
              {owner ? 'Explore cards' : 'View my collection'}
            </Link>
          </div>
          <button
            type="button"
            onClick={openCommandPalette}
            className="mt-6 inline-flex items-center gap-2 text-[14px] text-white/60 hover:text-white"
          >
            <Search className="h-4 w-4" aria-hidden />
            Or look up any card by name
          </button>
        </motion.div>

        <div className="relative">
          {loading ? (
            <StackPlaceholder compact={compact} />
          ) : stackItems.length ? (
            <>
              <CardStack
                items={stackItems}
                compact={compact}
                layoutPrefix="hero"
                onFrontChange={onFront}
                hiddenKey={open?.item.key ?? null}
                onOpen={(s, layoutId) => {
                  const item = byKey.get(s.key);
                  if (item) setOpen({ item, layoutId });
                }}
                className={cn(compact ? 'h-[min(118vw,520px)]' : 'h-[560px]')}
                cardClassName={compact ? 'w-[min(58vw,280px)]' : 'w-[min(290px,20vw)]'}
              />
              {front ? <FrontCaption item={front} owned={owner} /> : null}
            </>
          ) : (
            <p className="rounded-2xl border border-white/15 bg-white/5 p-6 text-white/70">
              The catalog could not be reached, so there are no cards to show right now.
            </p>
          )}
        </div>
      </div>

      <CardSpotlight
        card={open?.item.card ?? null}
        layoutId={open?.layoutId}
        onClose={() => setOpen(null)}
      >
        {open ? (
          <SpotlightFacts
            item={open.item}
            owned={owner}
            onDetails={() => {
              const c = open.item.card;
              setOpen(null);
              openCard(c);
            }}
          />
        ) : null}
      </CardSpotlight>
    </section>
  );
}

function FrontCaption({ item, owned }: { item: ShowcaseCard; owned: boolean }) {
  return (
    <motion.div
      key={item.key}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="pointer-events-none relative z-[55] mx-auto mt-3 max-w-[18rem] border-l-2 border-[var(--hero-tone)] bg-gradient-to-r from-black/55 to-transparent py-2 pl-3.5 pr-6 text-white lg:absolute lg:bottom-16 lg:left-0 lg:mx-0 lg:mt-0 lg:max-w-[15rem]"
      aria-live="polite"
    >
      <p className="truncate text-[14px] font-semibold">{item.card.name}</p>
      <p className="truncate text-[12px] text-white/60">
        {item.card.set?.name}
        {item.card.number ? ` · ${item.card.number}` : ''}
      </p>
      <p className="mt-1.5 flex items-baseline gap-2">
        <Price
          value={item.price}
          size="sm"
          className="text-white"
          unavailableLabel="No market price"
        />
        <span className="text-[11.5px] text-white/55">
          {owned && item.quantity ? `× ${item.quantity} owned` : 'market estimate'}
        </span>
      </p>
    </motion.div>
  );
}

function SpotlightFacts({
  item,
  owned,
  onDetails,
}: {
  item: ShowcaseCard;
  owned: boolean;
  onDetails: () => void;
}) {
  const finish = finishOf(item.card);
  return (
    <div>
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/5 p-3">
          <dt className="text-[12px] text-white/55">Market estimate</dt>
          <dd className="mt-1">
            <Price
              value={item.price}
              size="lg"
              className="text-white"
              unavailableLabel="No price"
            />
          </dd>
          <dd className="mt-1 text-[11.5px] text-white/50">
            {item.price ? 'TCGplayer market, one copy' : 'The catalog has no market price'}
          </dd>
        </div>
        <div className="rounded-xl bg-white/5 p-3">
          <dt className="text-[12px] text-white/55">{owned ? 'You own' : 'Finish'}</dt>
          <dd className="mt-1 font-display text-[22px] font-semibold">
            {owned
              ? `${item.quantity ?? 1} ${item.quantity === 1 ? 'copy' : 'copies'}`
              : FINISH_LABEL[finish]}
          </dd>
          {item.card.set?.releaseDate ? (
            <dd className="mt-1 text-[11.5px] text-white/50">
              Released {item.card.set.releaseDate.slice(0, 4)}
            </dd>
          ) : null}
        </div>
      </dl>
      <button type="button" onClick={onDetails} className="btn-tactile mt-5 w-full sm:w-auto">
        Full price history and grading
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function StackPlaceholder({ compact }: { compact: boolean }) {
  return (
    <div
      className={cn(
        'relative flex items-start justify-center',
        compact ? 'h-[min(118vw,520px)]' : 'h-[560px]'
      )}
      aria-busy="true"
      aria-label="Loading cards"
    >
      {[-12, 9, -3].map((r, i) => (
        <div
          key={r}
          className={cn(
            'absolute aspect-[63/88] animate-pulse rounded-[4.6%/3.3%] border border-white/10 bg-white/[0.06]',
            compact ? 'w-[min(58vw,280px)]' : 'w-[min(290px,20vw)]'
          )}
          style={{
            transform: `translateX(${(i - 1) * 40}%) rotate(${r}deg) scale(${i === 2 ? 1 : 0.82})`,
          }}
        />
      ))}
    </div>
  );
}

/** Depth behind the cards: a lit floor, a pedestal ellipse and a faint perspective grid. */
function StageBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-[1]">
      {/* Floor light and a rim light, both in the front card's colour. */}
      <div className="absolute bottom-[-30%] left-[45%] h-[70%] w-[70%] rounded-[50%] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--hero-tone)_38%,transparent),transparent)]" />
      <div className="absolute right-[-10%] top-[-20%] h-[80%] w-[55%] rounded-[50%] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--hero-tone)_16%,transparent),transparent)]" />
      <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay [background-image:radial-gradient(rgba(255,255,255,0.9)_0.6px,transparent_0.6px)] [background-size:3px_3px]" />
      <div
        className="absolute inset-x-0 bottom-0 h-[45%] opacity-40 [mask-image:linear-gradient(to_top,black,transparent)]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          transform: 'perspective(600px) rotateX(62deg)',
          transformOrigin: 'bottom',
        }}
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    </div>
  );
}
