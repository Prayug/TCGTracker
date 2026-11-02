import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Pack } from '../../../types/pokemon';
import { tieredPackService } from '../../../services/tieredPackService';
import { useGame } from '../../../contexts/GameContext';
import { PackOpeningModal } from './PackOpeningModal';
import { PageHeader } from '../../../components/layout/PageShell';
import { CardArt } from '../../../components/exchange/CardArt';
import { Package, Sparkles, ChevronDown, ArrowRight } from 'lucide-react';
import { PageEmptyState } from '../../../components/common/PageEmptyState';
import { formatCurrency } from '../../../utils/cardDisplay';
import { activePackRanges, getPullTheme, packIdentityStats } from '../packPresentation';

export const PackShop: React.FC = () => {
  const { game, isOnePiece } = useGame();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPack, setSelectedPack] = useState<Pack | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [boostedPacks, setBoostedPacks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadPacks();
  }, []);

  const loadPacks = async () => {
    setIsLoading(true);
    try {
      setPacks(tieredPackService.getAvailablePacks());
    } catch (error) {
      console.error('Error loading packs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenPack = (pack: Pack, boosted: boolean) => {
    setSelectedPack(pack);
    setBoostedPacks((prev) => ({ ...prev, [pack.id]: boosted }));
    setIsModalOpen(true);
  };

  const history = tieredPackService.getHistory(game);

  /** A flat colour band per tier, so packs read as distinct objects without glows. */
  const tierBand: Record<string, string> = {
    starter: 'bg-[#8a8f98]',
    bronze: 'bg-[#a0673a]',
    silver: 'bg-[#9aa3ad]',
    gold: 'bg-[#c9a227]',
    platinum: 'bg-[#5b7f8f]',
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-border-default border-t-accent motion-reduce:animate-none" />
      </div>
    );
  }

  const pct = (n: number) => (n % 1 === 0 ? `${n}%` : `${n.toFixed(1)}%`);

  return (
    <div className="space-y-8">
      <PageHeader
        title={isOnePiece ? 'One Piece pack shop' : 'Pack shop'}
        meta="Simulated · play money"
        description={`Open simulated packs with every pull rate shown up front. Nothing is bought or sold, and results are not a forecast.${
          isOnePiece
            ? ' Cards come from One Piece set pools.'
            : ' Each bracket can land a raw card or a PSA 10 from the pool.'
        }`}
      />

      {isOnePiece ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-accent pl-3">
          <p className="text-[13px] text-ink-secondary">
            For set-accurate booster, box and case rates, use the One Piece simulator.
          </p>
          <Link to="/open" className="btn-secondary h-9">
            Open the simulator
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      ) : null}

      {history.packsOpened > 0 ? (
        <p className="text-[14px] text-ink-secondary">
          You’ve opened{' '}
          <span className="font-medium text-ink-primary">
            {history.packsOpened} simulated pack{history.packsOpened === 1 ? '' : 's'}
          </span>
          : <span className="font-mono tabular-nums">{formatCurrency(history.totalSpent)}</span> in
          play money for{' '}
          <span className="font-mono tabular-nums">{formatCurrency(history.totalValue)}</span> of
          pulls, a{' '}
          <span
            className={`font-mono tabular-nums ${history.totalProfit >= 0 ? 'text-gain' : 'text-loss'}`}
          >
            {formatCurrency(history.totalProfit, { signed: true })}
          </span>{' '}
          session.
        </p>
      ) : null}

      <section aria-labelledby="packs-title">
        <h2 id="packs-title" className="text-h2 mb-4">
          Packs
        </h2>

        {packs.length === 0 ? (
          <PageEmptyState
            icon={Package}
            title="No packs available"
            message="Check back later for new simulated pack tiers."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-2 xl:grid-cols-3">
            {packs.map((pack) => {
              const boosted = !!boostedPacks[pack.id];
              const ranges = activePackRanges(pack, boosted);
              const stats = packIdentityStats(ranges, pack.price);
              return (
                <li
                  key={pack.id}
                  className="flex flex-col rounded-lg border border-border-default bg-surface-raised"
                >
                  {/* The pack itself: a foil wrapper with a crimp and a tier band. */}
                  <div className="relative overflow-hidden rounded-t-lg border-b border-border-default bg-surface-inset px-5 pb-4 pt-6">
                    <span
                      className={`absolute inset-x-0 top-0 h-1.5 ${tierBand[pack.tier] ?? 'bg-ink-muted'}`}
                      aria-hidden
                    />
                    <span
                      className="absolute inset-x-0 top-1.5 h-2 bg-[repeating-linear-gradient(90deg,transparent_0_6px,var(--border-default)_6px_7px)] opacity-70"
                      aria-hidden
                    />
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-display text-[22px] leading-tight">{pack.name}</h3>
                        <p className="text-[13px] text-ink-muted">{pack.description}</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-border-strong px-2 py-0.5 text-[11.5px] text-ink-muted">
                        Simulated
                      </span>
                    </div>
                    <p className="mt-3 font-mono text-[28px] leading-none tabular-nums">
                      {formatCurrency(pack.price)}
                      <span className="ml-1.5 font-sans text-[12.5px] text-ink-muted">
                        play money · {pack.cardsPerPack} card{pack.cardsPerPack === 1 ? '' : 's'}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-1 flex-col gap-4 p-5">
                    <dl className="grid grid-cols-3 gap-3 text-[12.5px]">
                      <div>
                        <dt className="text-ink-muted">Lowest pull</dt>
                        <dd className="font-mono tabular-nums">{formatCurrency(stats.floor)}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-muted">Top pull</dt>
                        <dd className="font-mono tabular-nums">{formatCurrency(stats.top)}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-muted">Beat the price</dt>
                        <dd className="font-mono tabular-nums">{pct(stats.beatCostChance)}</dd>
                      </div>
                    </dl>

                    {pack.boostedValueRanges ? (
                      <label
                        htmlFor={`boost-${pack.id}`}
                        className="flex cursor-pointer items-center justify-between gap-3 text-[13px]"
                      >
                        <span className="font-medium">
                          Boosted odds
                          <span
                            id={`boost-${pack.id}-hint`}
                            className="block text-[12px] font-normal text-ink-muted"
                          >
                            Same price, wider swings
                          </span>
                        </span>
                        <input
                          id={`boost-${pack.id}`}
                          type="checkbox"
                          role="switch"
                          aria-describedby={`boost-${pack.id}-hint`}
                          className="h-5 w-9 cursor-pointer accent-[var(--accent)]"
                          checked={boosted}
                          onChange={(e) =>
                            setBoostedPacks((prev) => ({ ...prev, [pack.id]: e.target.checked }))
                          }
                        />
                      </label>
                    ) : null}

                    <details className="group/odds border-t border-rule pt-3">
                      <summary className="flex cursor-pointer list-none items-center justify-between text-[13px] font-medium text-ink-secondary hover:text-ink-primary [&::-webkit-details-marker]:hidden">
                        All pull rates{boosted ? ' (boosted)' : ''}
                        <ChevronDown
                          className="h-4 w-4 text-ink-muted transition-transform group-open/odds:rotate-180 motion-reduce:transition-none"
                          aria-hidden
                        />
                      </summary>
                      <table className="mt-2 w-full text-[12.5px]">
                        <caption className="sr-only">{pack.name} pull rates</caption>
                        <thead className="sr-only">
                          <tr>
                            <th scope="col">Pull value</th>
                            <th scope="col">Chance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ranges.map((range, idx) => (
                            <tr key={idx}>
                              <th
                                scope="row"
                                className="w-24 py-1 text-left font-normal text-ink-muted"
                              >
                                {range.label}
                              </th>
                              <td className="py-1">
                                <span className="flex items-center gap-2">
                                  <span
                                    className="h-1.5 flex-1 overflow-hidden rounded-sm bg-surface-hover"
                                    aria-hidden
                                  >
                                    <span
                                      className="block h-full bg-ink-secondary"
                                      style={{ width: `${Math.min(range.probability, 100)}%` }}
                                    />
                                  </span>
                                  <span className="w-12 text-right font-mono tabular-nums">
                                    {range.probability.toFixed(1)}%
                                  </span>
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>

                    <button
                      type="button"
                      className="btn-primary mt-auto w-full justify-center"
                      onClick={() => handleOpenPack(pack, boosted)}
                    >
                      <Sparkles className="h-4 w-4" aria-hidden />
                      {boosted ? 'Open boosted pack' : 'Open pack'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {history.pulls.length > 0 ? (
        <section aria-labelledby="recent-openings" className="space-y-2">
          <h2 id="recent-openings" className="text-h2">
            Recent openings
          </h2>
          <table className="ledger ledger-tight">
            <caption className="sr-only">Recent simulated pack openings</caption>
            <thead>
              <tr>
                <th scope="col">Pull</th>
                <th scope="col" className="hidden sm:table-cell">
                  Pack
                </th>
                <th scope="col" className="num">
                  Value
                </th>
                <th scope="col" className="num">
                  Versus price
                </th>
              </tr>
            </thead>
            <tbody>
              {history.pulls.slice(0, 8).map((pull, index) => {
                const card = pull.cards[0];
                const theme = getPullTheme(pull);
                return (
                  <tr key={`${pull.openedAt}-${index}`}>
                    <th scope="row" className="text-left font-normal">
                      <span className="flex items-center gap-3">
                        <span className="w-8 shrink-0">
                          <CardArt card={card ?? { name: 'Pack pull' }} flat />
                        </span>
                        <span className="min-w-0">
                          <span className="block max-w-[40vw] truncate font-medium sm:max-w-none">
                            {card?.name ?? 'Pack pull'}
                          </span>
                          <span className="block text-[12px] text-ink-muted">
                            {theme.label}
                            <span className="sm:hidden"> · {pull.pack.name}</span>
                          </span>
                        </span>
                      </span>
                    </th>
                    <td className="hidden text-ink-secondary sm:table-cell">{pull.pack.name}</td>
                    <td className="num">{formatCurrency(pull.totalValue)}</td>
                    <td className={`num ${pull.profit >= 0 ? 'text-gain' : 'text-loss'}`}>
                      {formatCurrency(pull.profit, { signed: true })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      <PackOpeningModal
        pack={selectedPack}
        isOpen={isModalOpen}
        initialBoosted={selectedPack ? !!boostedPacks[selectedPack.id] : false}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedPack(null);
          loadPacks();
        }}
      />
    </div>
  );
};
