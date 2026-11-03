import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bell, ExternalLink, Heart, Plus, Scale } from 'lucide-react';
import type { PokemonCard } from '../../types/pokemon';
import type { OnePieceCard } from '../../types/onepiece';
import type { CardRouteState } from '../../contexts/CardModalContext';
import { useGame } from '../../contexts/GameContext';
import { useToast } from '../../components/common/Toast';
import { CardArt } from '../../components/exchange/CardArt';
import { Basis, Delta, Price, Unavailable } from '../../components/exchange/Price';
import { StepPriceChart } from '../../components/exchange/StepPriceChart';
import { SlabPriceHistory } from './SlabPriceHistory';
import { AddToVaultModal } from '../vault/components/AddToVaultModal';
import { vaultService } from '../../services/vaultService';
import { cardWishlistService } from '../../services/cardWishlistService';
import { unifiedAlertService } from '../../services/unifiedAlertService';
import { formatCurrency } from '../../utils/cardDisplay';
import { PRICE_RANGES, type PriceRangeKey, slicePriceHistory } from '../../utils/chartDomain';
import { useCardResearch, gradeLabel, graderLabel, type AnyCard } from './useCardResearch';
import { figuresDisagree, resolveQuote } from './quote';
import { GradingCalculator } from './GradingCalculator';
import { InvestmentResearch } from './InvestmentResearch';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { id: 'history', label: 'Market history' },
  { id: 'grading', label: 'Grading economics' },
  { id: 'sales', label: 'Recent sales' },
  { id: 'research', label: 'Investment research' },
  { id: 'details', label: 'Card details' },
] as const;

function toVaultCard(card: AnyCard): PokemonCard {
  if ('tcgplayer' in card || ('set' in card && 'releaseDate' in (card.set ?? {})))
    return card as PokemonCard;
  return {
    id: card.id,
    name: card.name,
    images: card.images,
    set: { id: card.set.id, name: card.set.name, releaseDate: '', total: 0 },
    number: card.number,
    rarity: card.rarity,
    marketPrice: card.marketPrice,
  };
}

function ageLabel(days?: number | null): string {
  if (days == null) return '';
  if (days <= 1) return 'today';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}y ago`;
}

function SectionHeading({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule-strong pb-2">
      <h2 id={`${id}-h`} className="font-display text-[22px] font-medium leading-tight">
        {title}
      </h2>
      {children}
    </div>
  );
}

export function CardResearchPage() {
  const { id: rawId = '' } = useParams();
  const id = decodeURIComponent(rawId);
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = (location.state ?? {}) as CardRouteState;
  const { game } = useGame();
  const { showToast } = useToast();
  const r = useCardResearch(id, routeState.card);
  const card = r.card;
  const cardGame = r.isOP ? 'onepiece' : 'pokemon';

  const [range, setRange] = useState<PriceRangeKey>('6M');
  const [vaultOpen, setVaultOpen] = useState(false);
  const [ownedTick, setOwnedTick] = useState(0);
  const [wished, setWished] = useState(false);

  useEffect(() => {
    if (card) setWished(cardWishlistService.isWishlisted(card.id, cardGame));
  }, [card, cardGame]);

  useEffect(() => {
    if (card) document.title = `${card.name} · ${card.set?.name ?? ''} — TCGTracker`;
    return () => {
      document.title = 'TCGTracker — the collector’s exchange';
    };
  }, [card]);

  const owned = useMemo(
    () => (card ? vaultService.getVaultEntriesForCard(card.id, cardGame) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card?.id, cardGame, ownedTick]
  );
  const ownedCopies = owned.reduce((s, e) => s + e.quantity, 0);

  const finish = r.finishes.find((f) => f.key === r.finish) ?? r.finishes[0];
  const quote = resolveQuote({
    history: r.history,
    finishMarket: finish?.market ?? null,
    catalogPrice: card?.marketPrice ?? null,
    finishLabel: finish?.label ?? 'Normal',
    isOnePiece: r.isOP,
  });
  const ranged = useMemo(() => slicePriceHistory(r.history, range), [r.history, range]);
  const first = ranged.find((p) => p.price > 0)?.price ?? null;
  const last = [...ranged].reverse().find((p) => p.price > 0)?.price ?? null;
  const changePct = first && last ? ((last - first) / first) * 100 : null;
  const lo = ranged.length ? Math.min(...ranged.map((p) => p.price).filter((v) => v > 0)) : null;
  const hi = ranged.length ? Math.max(...ranged.map((p) => p.price)) : null;

  const rawForGrading = quote.value;
  const thesisDisagrees = figuresDisagree(r.thesis?.currentPrice, quote.value);

  const goBack = () => {
    if (routeState.from) navigate(-1);
    else navigate('/browse');
  };
  const backLabel = routeState.from?.pathname.startsWith('/vault')
    ? 'Vault'
    : routeState.from?.pathname === '/'
      ? 'Home'
      : routeState.from?.pathname.startsWith('/sets')
        ? 'Set'
        : routeState.from
          ? 'Back'
          : 'Catalog';

  const toggleWish = () => {
    if (!card) return;
    const on = cardWishlistService.toggle(card, cardGame);
    setWished(on);
    showToast(on ? 'Added to wishlist' : 'Removed from wishlist', on ? 'success' : 'info');
  };

  const watchPrice = async () => {
    if (!card || !quote.value) return;
    const target = Math.round(quote.value * 0.9 * 100) / 100;
    await unifiedAlertService.createAlert(card.id, card.name, target, 'below');
    showToast(
      `Watching: alert when below ${formatCurrency(target)} (10% under today). Edit it in Wishlist.`,
      'success'
    );
  };

  if (!card && r.cardLoading) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="skeleton aspect-[63/88] w-full max-w-[360px] rounded-lg" />
          <div className="space-y-4">
            <div className="skeleton h-9 w-2/3 rounded" />
            <div className="skeleton h-5 w-1/3 rounded" />
            <div className="skeleton h-12 w-1/2 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="mx-auto max-w-[720px] px-4 py-16 sm:px-6">
        <Unavailable
          title="We couldn’t find this card"
          action={
            <Link to="/browse" className="btn-secondary">
              Search the catalog
            </Link>
          }
        >
          No catalog record matches “{id}”. The link may be from an older version, or the card may
          belong to the other game.
        </Unavailable>
      </div>
    );
  }

  const pokemon = card as PokemonCard;
  const op = card as OnePieceCard;
  const productId = r.isOP ? op.tcgplayerProductId : pokemon.tcgplayer?.productId;
  const tcgUrl =
    !r.isOP && pokemon.tcgplayer?.url
      ? pokemon.tcgplayer.url
      : productId
        ? `https://www.tcgplayer.com/product/${productId}`
        : null;
  const language = !r.isOP && pokemon.language === 'ja' ? 'Japanese' : 'English';
  const psaPop = r.population?.companies?.psa;

  const identityRows: Array<[string, React.ReactNode]> = [
    ['Set', card.set?.name || '—'],
    [
      'Number',
      card.number ? (
        <span className="font-mono">
          {card.number}
          {!r.isOP && pokemon.set?.total ? ` / ${pokemon.set.total}` : ''}
        </span>
      ) : (
        '—'
      ),
    ],
    ['Rarity', card.rarity || '—'],
    ['Language', language],
    ['Finish', r.isOP ? 'Standard' : (finish?.label ?? '—')],
    ...(!r.isOP && pokemon.set?.releaseDate
      ? ([['Released', pokemon.set.releaseDate.replace(/\//g, '-')]] as Array<
          [string, React.ReactNode]
        >)
      : []),
    ...(!r.isOP && pokemon.artist
      ? ([['Illustrator', pokemon.artist]] as Array<[string, React.ReactNode]>)
      : []),
    ...(r.isOP && op.cardColor
      ? ([['Colour', op.cardColor]] as Array<[string, React.ReactNode]>)
      : []),
    ...(r.isOP && op.cardType ? ([['Type', op.cardType]] as Array<[string, React.ReactNode]>) : []),
  ];

  // Price sources ledger: each row says what kind of figure it is.
  const sources: Array<{
    label: string;
    kind: string;
    value: number | null;
    note?: string;
    warn?: boolean;
  }> = [];
  if (finish?.market)
    sources.push({
      label: `TCGplayer market · ${finish.label}`,
      kind: 'Market estimate',
      value: finish.market,
    });
  if (finish?.low)
    sources.push({
      label: 'Lowest listing',
      kind: 'Asking price',
      value: finish.low,
      note: 'An offer, not a sale',
    });
  if (r.ungradedGuide?.price)
    sources.push({
      label: 'PriceCharting ungraded',
      kind: 'Sold average',
      value: r.ungradedGuide.price,
      note: 'eBay sales in any condition, so usually below Near Mint',
    });
  if (r.thesis?.currentPrice)
    sources.push({
      label: 'Analysis reference',
      kind: 'Model input',
      value: r.thesis.currentPrice,
      note: thesisDisagrees
        ? 'Does not match this finish. See Investment research.'
        : 'Used by the analysis below',
      warn: thesisDisagrees,
    });

  return (
    <article
      className="mx-auto max-w-[1440px] px-4 pb-16 pt-4 sm:px-6 lg:px-8"
      aria-labelledby="card-title"
    >
      <button type="button" onClick={goBack} className="btn-ghost -ml-2.5 mb-3 h-8 text-[13px]">
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </button>

      {game !== cardGame ? (
        <p className="mb-4 text-meta text-ink-muted">
          This is a {r.isOP ? 'One Piece' : 'Pokémon'} card. Your active game is{' '}
          {game === 'onepiece' ? 'One Piece' : 'Pokémon'}.
        </p>
      ) : null}

      {/* ── Identity + market ───────────────────────────── */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
        <section
          aria-label="Collectible identity"
          className="lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:self-start"
        >
          <div className="mx-auto w-full max-w-[220px] sm:max-w-[340px] lg:mx-0">
            <CardArt card={card} size="large" priority />
          </div>
          <dl className="mt-6 grid max-w-[420px] grid-cols-[7rem_1fr] gap-y-1.5 text-[13.5px]">
            {identityRows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="min-w-0">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 max-w-[420px] border-t border-rule pt-3 text-[13.5px]">
            {ownedCopies > 0 ? (
              <p>
                <span
                  className="mr-2 inline-block h-2 w-2 rounded-full bg-gold-line align-middle"
                  aria-hidden
                />
                You own <strong className="font-semibold">{ownedCopies}</strong>{' '}
                {ownedCopies === 1 ? 'copy' : 'copies'} across {owned.length}{' '}
                {owned.length === 1 ? 'holding' : 'holdings'}.{' '}
                <Link to="/vault" className="text-accent hover:underline">
                  Open in vault
                </Link>
              </p>
            ) : (
              <p className="text-ink-secondary">Not in your collection.</p>
            )}
          </div>
        </section>

        <section aria-label="Market and actions" className="min-w-0">
          <p className="text-meta text-ink-muted">
            {r.isOP ? 'One Piece' : 'Pokémon'} · {card.set?.name}
            {card.number ? ` · No. ${card.number}` : ''}
          </p>
          <h1 id="card-title" className="mt-1 font-display text-display">
            {card.name}
          </h1>
          <p className="mt-1 text-[14px] text-ink-secondary">
            {[card.rarity, language === 'Japanese' ? 'Japanese print' : null]
              .filter(Boolean)
              .join(' · ')}
          </p>

          {!r.isOP && r.finishes.length > 1 ? (
            <div className="mt-5">
              <p id="finish-label" className="mb-1.5 text-[12.5px] font-medium text-ink-secondary">
                Finish
              </p>
              <div role="radiogroup" aria-labelledby="finish-label" className="segmented flex-wrap">
                {r.finishes.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    role="radio"
                    aria-checked={f.key === r.finish}
                    onClick={() => r.setFinish(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-6 border-t-2 border-rule-strong pt-4">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <Price value={quote.value} size="xl" unavailableLabel="No market price" />
              {changePct != null ? (
                <Delta
                  pct={changePct}
                  amount={last && first ? last - first : null}
                  period={`over ${range}`}
                  size="md"
                />
              ) : null}
            </div>
            <Basis
              className="mt-2"
              kind={quote.kind}
              source={quote.source}
              detail={quote.detail}
              asOf={quote.asOf}
              stale={quote.stale}
            />
            {lo != null && hi != null && hi > lo && quote.value ? (
              <RangeBar low={lo} high={hi} current={quote.value} label={`${range} range`} />
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => setVaultOpen(true)}>
              <Plus className="h-4 w-4" />{' '}
              {ownedCopies > 0 ? 'Add another copy' : 'Add to collection'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={watchPrice}
              disabled={!quote.value}
            >
              <Bell className="h-4 w-4" /> Watch price
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={toggleWish}
              aria-pressed={wished}
            >
              <Heart className={cn('h-4 w-4', wished && 'fill-current text-loss')} />{' '}
              {wished ? 'On wishlist' : 'Wishlist'}
            </button>
            <Link to="/trade" className="btn-ghost">
              <Scale className="h-4 w-4" /> Compare in trade
            </Link>
            {tcgUrl ? (
              <a href={tcgUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                <ExternalLink className="h-4 w-4" /> View listings
              </a>
            ) : null}
          </div>

          {/* Price sources */}
          <div className="mt-8">
            <h2 className="text-h3">Price sources</h2>
            {sources.length === 0 ? (
              <p className="mt-2 text-meta text-ink-muted">No source has quoted this finish yet.</p>
            ) : (
              <table className="ledger mt-1">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th className="hidden sm:table-cell">Kind</th>
                    <th className="num">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => (
                    <tr key={s.label}>
                      <td>
                        <span className="block">{s.label}</span>
                        {s.note ? (
                          <span
                            className={cn(
                              'text-meta',
                              s.warn ? 'font-medium text-warn' : 'text-ink-muted'
                            )}
                          >
                            {s.note}
                          </span>
                        ) : null}
                      </td>
                      <td className="hidden text-ink-secondary sm:table-cell">{s.kind}</td>
                      <td className="num">{s.value ? formatCurrency(s.value) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Graded snapshot */}
          <div className="mt-8">
            <div className="flex items-baseline justify-between">
              <h2 className="text-h3">Graded copies</h2>
              {r.graded?.fetchedAt ? (
                <Basis
                  kind="Sold guide"
                  source="PriceCharting"
                  asOf={r.graded.fetchedAt}
                  stale={r.graded.stale}
                />
              ) : null}
            </div>
            {r.gradedLoading ? (
              <div className="skeleton mt-2 h-16 rounded" />
            ) : r.gradedRows.filter((g) => (g.price ?? 0) > 0).length === 0 ? (
              <p className="mt-2 text-meta text-ink-muted">
                No graded sales found for this finish.
              </p>
            ) : (
              <ul className="mt-2 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
                {r.gradedRows
                  .filter((g) => (g.price ?? 0) > 0 && ['10', '9', '9.5'].includes(g.grade))
                  .slice(0, 6)
                  .map((g) => (
                    <li
                      key={`${g.grader}-${g.grade}`}
                      className="flex items-baseline justify-between border-b border-rule py-1.5"
                    >
                      <span className="text-[13px] text-ink-secondary">{gradeLabel(g)}</span>
                      <span className="font-mono text-[13.5px] tabular-nums">
                        {formatCurrency(g.price as number)}
                        {quote.value ? (
                          <span className="ml-1.5 text-[11.5px] text-ink-muted">
                            {((g.price as number) / quote.value).toFixed(1)}×
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* ── Section index ─────────────────────────────── */}
      <nav
        aria-label="On this page"
        className="scrollbar-none sticky top-[96px] z-20 -mx-4 mt-12 flex gap-1 overflow-x-auto border-y border-border-default bg-surface-base/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 md:top-[var(--header-h)] lg:-mx-8 lg:px-8"
      >
        {SECTIONS.filter((s) => !(r.isOP && s.id === 'research')).map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="whitespace-nowrap px-2.5 py-2.5 text-[13px] text-ink-secondary hover:text-ink-primary"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className="mt-8 space-y-14">
        {/* Market history */}
        <section id="history" aria-labelledby="history-h" className="scroll-mt-32">
          <SectionHeading id="history" title="Market history">
            <div className="segmented" role="group" aria-label="Time range">
              {PRICE_RANGES.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={range === k}
                  onClick={() => setRange(k)}
                >
                  {k}
                </button>
              ))}
            </div>
          </SectionHeading>
          <p className="mt-2 text-meta text-ink-muted">
            Daily {r.isOP ? 'market' : `TCGplayer ${finish?.label ?? ''}`} snapshots for Near Mint
            copies. Each dot is one observation.
          </p>
          <div className="mt-4">
            {r.historyLoading && ranged.length === 0 ? (
              <div className="skeleton h-[240px] rounded" />
            ) : ranged.length > 1 ? (
              <StepPriceChart
                title={`${card.name} ${finish?.label ?? ''} market price, ${range}`}
                series={[
                  {
                    key: 'raw',
                    label: finish?.label ?? 'Market',
                    color: 'var(--chart-series-1)',
                    points: ranged,
                  },
                ]}
              />
            ) : (
              <Unavailable title="Not enough price history to chart">
                {ranged.length === 1
                  ? 'There is a single observation for this finish in this range. A trend needs at least two.'
                  : 'No snapshots have been recorded for this finish yet. The market estimate above is the only current figure.'}
              </Unavailable>
            )}
          </div>
          {ranged.length > 1 && lo != null && hi != null ? (
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              {[
                ['Low', formatCurrency(lo)],
                ['High', formatCurrency(hi)],
                ['First observation', ranged[0]?.date ?? '—'],
                ['Latest observation', ranged[ranged.length - 1]?.date ?? '—'],
              ].map(([k, v]) => (
                <div key={k} className="border-t border-rule pt-2">
                  <dt className="text-meta text-ink-muted">{k}</dt>
                  <dd className="font-mono text-[14px] tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <h3 className="mt-10 font-display text-[17px] font-medium">Slab prices</h3>
          <p className="mt-1 text-meta text-ink-muted">
            Daily PriceCharting quotes per grade. Pick up to four grades to compare.
          </p>
          <div className="mt-3">
            <SlabPriceHistory history={r.gradedHistory} range={range} cardName={card.name} />
          </div>
        </section>

        {/* Grading economics */}
        <section id="grading" aria-labelledby="grading-h" className="scroll-mt-32">
          <SectionHeading id="grading" title="Grading economics">
            <Link to="/grading" className="text-[13px] text-accent hover:underline">
              Estimate your copy’s grade from photos →
            </Link>
          </SectionHeading>
          <div className="mt-5 grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <GradingCalculator
              key={`${card.id}-${r.finish}-${rawForGrading ?? 0}-${r.gradedRows.length}`}
              rawPrice={rawForGrading}
              gradedRows={r.gradedRows}
            />
            <div>
              <h3 className="text-h3">Population</h3>
              {r.populationLoading ? (
                <div className="skeleton mt-2 h-24 rounded" />
              ) : !psaPop || psaPop.status !== 'ok' || !psaPop.pop?.some((n) => n > 0) ? (
                <p className="mt-2 text-meta text-ink-muted">
                  {psaPop?.message || 'No population report matched this card.'}
                </p>
              ) : (
                <PopulationBars pop={psaPop.pop} total={psaPop.total ?? null} />
              )}
              {r.population?.fetchedAt ? (
                <Basis
                  className="mt-2"
                  kind="Population report"
                  source="PSA"
                  asOf={r.population.fetchedAt}
                  stale={r.population.stale}
                />
              ) : null}
              {r.population ? (
                <ul className="mt-4 space-y-1 text-[13px]">
                  {(['cgc', 'beckett'] as const).map((k) => {
                    const c = r.population?.companies?.[k];
                    return (
                      <li key={k} className="flex justify-between border-b border-rule py-1">
                        <span className="text-ink-secondary">{graderLabel(k)} total graded</span>
                        <span className="font-mono tabular-nums">
                          {c?.total != null ? c.total.toLocaleString() : 'Not reported'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          </div>
        </section>

        {/* Recent sales */}
        <section id="sales" aria-labelledby="sales-h" className="scroll-mt-32">
          <SectionHeading id="sales" title="Recent sales" />
          <p className="mt-2 text-meta text-ink-muted">
            Sold-guide prices and the most recent recorded sale per grade. Listings are shown
            separately because an asking price is not a sale.
          </p>
          {r.gradedLoading ? (
            <div className="skeleton mt-4 h-32 rounded" />
          ) : r.gradedRows.length === 0 ? (
            <Unavailable className="mt-4" title="No comparable sales recorded">
              We don’t have verified sold data for this card and finish. Treat the market estimate
              as the only reference.
            </Unavailable>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="ledger min-w-[640px]">
                <thead>
                  <tr>
                    <th>Grade</th>
                    <th className="num">Sold guide</th>
                    <th className="num">Last sale</th>
                    <th>When</th>
                    <th className="num">Sales counted</th>
                    <th className="num">Lowest listing</th>
                  </tr>
                </thead>
                <tbody>
                  {r.gradedRows.map((g) => (
                    <tr key={`${g.grader}-${g.grade}`}>
                      <td className="font-medium">{gradeLabel(g)}</td>
                      <td className="num">{g.price ? formatCurrency(g.price) : '—'}</td>
                      <td className="num">
                        {g.lastSoldPrice ? formatCurrency(g.lastSoldPrice) : '—'}
                      </td>
                      <td
                        className={cn(
                          'whitespace-nowrap',
                          g.staleSold ? 'text-warn' : 'text-ink-secondary'
                        )}
                      >
                        {g.lastSoldDate
                          ? `${ageLabel(g.lastSoldAgeDays)}${g.staleSold ? ' · stale' : ''}`
                          : '—'}
                      </td>
                      <td className="num text-ink-secondary">
                        {g.soldListings > 0 ? g.soldListings.toLocaleString() : '—'}
                      </td>
                      <td className="num text-ink-secondary">
                        {g.listedLow
                          ? `${formatCurrency(g.listedLow)}${g.listedCount ? ` · ${g.listedCount}` : ''}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Basis
                className="mt-2"
                kind="Sold guide"
                source="PriceCharting"
                detail="listings from eBay where available"
                asOf={r.graded?.fetchedAt}
                stale={r.graded?.stale}
              />
            </div>
          )}
        </section>

        {/* Investment research */}
        {!r.isOP ? (
          <section id="research" aria-labelledby="research-h" className="scroll-mt-32">
            <SectionHeading id="research" title="Investment research" />
            <InvestmentResearch
              thesis={r.thesis}
              loading={r.thesisLoading}
              error={r.thesisError}
              headline={quote.value}
              finishLabel={finish?.label ?? 'this finish'}
              disagrees={thesisDisagrees}
            />
          </section>
        ) : null}

        {/* Details */}
        <section id="details" aria-labelledby="details-h" className="scroll-mt-32">
          <SectionHeading id="details" title="Card details" />
          <dl className="mt-4 grid gap-x-10 gap-y-2 text-[13.5px] sm:grid-cols-2 lg:grid-cols-3">
            {[
              ...identityRows,
              [
                'Catalog ID',
                <span key="id" className="font-mono text-[12.5px]">
                  {card.id}
                </span>,
              ] as [string, React.ReactNode],
              ...(productId
                ? ([
                    [
                      'TCGplayer product',
                      <span key="p" className="font-mono text-[12.5px]">
                        {productId}
                      </span>,
                    ],
                  ] as Array<[string, React.ReactNode]>)
                : []),
              ...(!r.isOP && pokemon.types?.length
                ? ([['Type', pokemon.types.join(', ')]] as Array<[string, React.ReactNode]>)
                : []),
              ...(r.isOP && op.cardCost
                ? ([['Cost', op.cardCost]] as Array<[string, React.ReactNode]>)
                : []),
              ...(r.isOP && op.cardPower
                ? ([['Power', op.cardPower]] as Array<[string, React.ReactNode]>)
                : []),
            ].map(([k, v]) => (
              <div
                key={String(k)}
                className="flex justify-between gap-4 border-b border-rule py-1.5"
              >
                <dt className="text-ink-muted">{k}</dt>
                <dd className="text-right">{v}</dd>
              </div>
            ))}
          </dl>
          {r.isOP && op.cardText && op.cardText !== 'NULL' ? (
            <p className="mt-4 max-w-[68ch] whitespace-pre-wrap text-[14px] text-ink-secondary">
              {op.cardText}
            </p>
          ) : null}
          {r.finishes.length > 1 ? (
            <p className="mt-4 text-meta text-ink-muted">
              Finishes are priced separately. {r.finishes.map((f) => f.label).join(', ')} are
              distinct listings and are never merged.
            </p>
          ) : null}
        </section>
      </div>

      <AddToVaultModal
        card={toVaultCard(card)}
        isOpen={vaultOpen}
        onClose={() => setVaultOpen(false)}
        onSuccess={() => setOwnedTick((t) => t + 1)}
        game={cardGame}
      />
    </article>
  );
}

/** Where today's price sits in the period's range. Original figure. */
function RangeBar({
  low,
  high,
  current,
  label,
}: {
  low: number;
  high: number;
  current: number;
  label: string;
}) {
  const pos = Math.min(1, Math.max(0, (current - low) / (high - low)));
  return (
    <div
      className="mt-4 max-w-md"
      aria-label={`${label}: low ${formatCurrency(low)}, high ${formatCurrency(high)}, today ${formatCurrency(current)}`}
      role="img"
    >
      <div className="relative h-5">
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded bg-surface-hover" />
        <div
          className="absolute top-0 h-5 w-[2px] -translate-x-1/2 bg-ink-primary"
          style={{ left: `${pos * 100}%` }}
        />
      </div>
      <div className="flex justify-between font-mono text-[11.5px] tabular-nums text-ink-muted">
        <span>{formatCurrency(low)}</span>
        <span className="font-sans">{label}</span>
        <span>{formatCurrency(high)}</span>
      </div>
    </div>
  );
}

function PopulationBars({ pop, total }: { pop: number[]; total: number | null }) {
  const rows = pop
    .map((count, i) => ({ grade: i + 1, count }))
    .filter((r) => r.grade >= 6)
    .reverse();
  const max = Math.max(1, ...rows.map((r) => r.count));
  const sum = total ?? pop.reduce((s, n) => s + n, 0);
  return (
    <div className="mt-2">
      <table className="w-full text-[12.5px]">
        <caption className="sr-only">PSA population by grade</caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.grade}>
              <th scope="row" className="w-14 py-0.5 pr-2 text-left font-normal text-ink-secondary">
                PSA {r.grade}
              </th>
              <td className="py-0.5">
                <div
                  className="h-2.5 rounded-sm bg-gold-line/70"
                  style={{ width: `${Math.max(1.5, (r.count / max) * 100)}%` }}
                />
              </td>
              <td className="w-20 py-0.5 text-right font-mono tabular-nums">
                {r.count.toLocaleString()}
                <span className="ml-1 text-ink-muted">
                  {sum > 0 ? `${Math.round((r.count / sum) * 100)}%` : ''}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-meta text-ink-muted">{sum.toLocaleString()} graded in total</p>
    </div>
  );
}
