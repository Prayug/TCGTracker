import React from 'react';
import { ArrowUpRight, TrendingUp } from 'lucide-react';
import { PokemonCard } from '../../types/pokemon';
import { pokemonApi } from '../../services/pokemonApi';
import { vaultService } from '../../services/vaultService';
import { formatCurrency } from '../../utils/cardDisplay';
import { PortfolioSnapshot } from './PortfolioSnapshot';

interface HeroPortfolioPreviewProps {
  cards: PokemonCard[];
  onCardClick: (card: PokemonCard) => void;
}

export const HeroPortfolioPreview: React.FC<HeroPortfolioPreviewProps> = ({ cards, onCardClick }) => {
  const stats = vaultService.getVaultStats();

  const cardsWithPrice = cards
    .map((card) => ({ card, price: card.marketPrice ?? pokemonApi.extractCardPrice(card) }))
    .filter((entry) => entry.price > 0);

  const topCards = cardsWithPrice.slice(0, 5);

  return (
    <aside className="relative overflow-hidden rounded-xl border border-white/15 bg-slate-950/70 p-4 shadow-2xl backdrop-blur-xl">
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-fuchsia-500/12 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-emerald-500/12 blur-3xl" />

      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Portfolio Snapshot
        </p>

        <div className="mt-4">
          <PortfolioSnapshot stats={stats} dailyChange={null} />
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-3.5 backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-300" />
              Top Market Cards
            </p>
          </div>

          {topCards.length > 0 ? (
            <ul className="space-y-1.5">
              {topCards.map(({ card, price }) => (
                <li key={card.id}>
                  <button
                    type="button"
                    onClick={() => onCardClick(card)}
                    className="flex w-full items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-2 text-left transition-colors hover:border-emerald-500/20 hover:bg-white/[0.08]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-white">{card.name}</span>
                      <span className="block truncate text-[11px] text-slate-400">{card.set.name}</span>
                    </span>
                    <span className="text-xs font-bold tabular-nums text-emerald-300">
                      {formatCurrency(price)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-lg border border-dashed border-white/15 px-3 py-4 text-center text-xs text-slate-400">
              Search cards to populate top movers.
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Market feed connected
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
            live sources
            <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </aside>
  );
};
