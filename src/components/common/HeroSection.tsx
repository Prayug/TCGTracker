import React from 'react';
import { ArrowRight, BarChart3, Camera, Search, Shield, Sparkles } from 'lucide-react';
import { FeatureCard } from './FeatureCard';
import { StatCard } from './StatCard';
import { SectionLabel } from './SectionLabel';
import { AppView } from '../../types/ui';
import { pokemonApi } from '../../services/pokemonApi';
import { vaultService } from '../../services/vaultService';
import { PokemonCard } from '../../types/pokemon';
import { HeroPortfolioPreview } from './HeroPortfolioPreview';
import { MarketTicker } from './MarketTicker';

interface HeroSectionProps {
  onStartSearch: (query: string) => void;
  onViewChange: (view: AppView) => void;
}

const features = [
  {
    icon: BarChart3,
    title: 'Track your collection like a portfolio',
    description: 'Monitor value, trends, and conviction cards in one investing-oriented workspace.',
  },
  {
    icon: Sparkles,
    title: 'Find underpriced cards faster',
    description: 'Use market signals and sorting controls to identify entries with asymmetric upside.',
  },
  {
    icon: Camera,
    title: 'Scan, identify, and add cards instantly',
    description: 'Move from camera capture to tracked card data without breaking your flow.',
  },
  {
    icon: Shield,
    title: 'Monitor price history and movement',
    description: 'Stay grounded with transparent pricing references and trusted source integrations.',
  },
];

const quickSearches = ['Charizard', 'Pikachu', 'Gengar', 'Umbreon', 'Rayquaza'];

export const HeroSection: React.FC<HeroSectionProps> = ({ onStartSearch, onViewChange }) => {
  const [searchValue, setSearchValue] = React.useState('');
  const [marketCards, setMarketCards] = React.useState<PokemonCard[]>([]);
  const vaultStats = vaultService.getVaultStats();

  React.useEffect(() => {
    let mounted = true;

    const load = async () => {
      const terms = ['charizard', 'pikachu', 'umbreon', 'mewtwo'];
      try {
        const results = await Promise.all(terms.map((term) => pokemonApi.searchCards(term, undefined, 20)));
        if (!mounted) return;

        const deduped = new Map<string, PokemonCard>();
        results.flat().forEach((card) => {
          if (!deduped.has(card.id)) deduped.set(card.id, card);
        });
        setMarketCards(Array.from(deduped.values()).slice(0, 20));
      } catch {
        /* ticker optional */
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) onStartSearch(searchValue.trim());
  };

  return (
    <div id="top" className="bg-[#0a0f17] text-slate-100">
      {/* Above-the-fold hero */}
      <section className="relative overflow-hidden pb-6 pt-6 sm:pt-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(168,85,247,0.18),transparent_35%),radial-gradient(circle_at_85%_16%,rgba(16,185,129,0.12),transparent_30%)]" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionLabel className="text-violet-300/90">Collector finance terminal</SectionLabel>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-[3.25rem] lg:leading-tight">
            Your Pokémon collection, priced like a portfolio.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
            Search market listings, track P/L in your vault, rip simulated packs, and scan cards — one
            dark command center built for serious collectors.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onViewChange('cards')}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
            >
              Explore marketplace
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onViewChange('vault')}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.08]"
            >
              Open my vault
            </button>
            <button
              type="button"
              onClick={() => onViewChange('scanner')}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-400/35 bg-amber-400/10 px-5 py-2.5 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-400/20"
            >
              <Camera className="h-4 w-4" />
              Scan a card
            </button>
          </div>
        </div>
      </section>

      <section className="relative pb-6">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <div>
            <form onSubmit={handleSubmit}>
              <label htmlFor="hero-card-search" className="sr-only">
                Search Pokemon cards
              </label>
              <div className="flex flex-col gap-2 rounded-xl border border-white/15 bg-black/35 p-2 backdrop-blur-xl sm:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="hero-card-search"
                    type="text"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    placeholder="Search card, set, number..."
                    className="h-11 w-full rounded-lg border border-white/10 bg-[#111827] pl-11 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  Search
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="section-label !tracking-[0.16em]">Hot searches</span>
              {quickSearches.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onStartSearch(q)}
                  className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-200 hover:border-emerald-400/35 hover:bg-white/[0.08]"
                >
                  {q}
                </button>
              ))}
            </div>

            <MarketTicker cards={marketCards} onCardClick={(card) => onStartSearch(card.name)} />
          </div>

          <HeroPortfolioPreview cards={marketCards} onCardClick={(card) => onStartSearch(card.name)} />
        </div>
      </section>

      <section className="pb-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={BarChart3} numericValue={50000} suffix="+" label="Cards indexed" />
            <StatCard icon={Sparkles} numericValue={24} suffix="/day" label="Market refreshes" tone="accent" />
            <StatCard
              icon={Shield}
              numericValue={Math.max(vaultStats.totalCards, 0)}
              label="Cards in your vault"
              tone="success"
            />
            <StatCard icon={Camera} numericValue={3} suffix="s" label="Avg scan time" />
          </div>
        </div>
      </section>

      <section className="section-stack pb-12 pt-2">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionLabel className="text-violet-300/90">Core workflows</SectionLabel>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            Built for market-first collecting
          </h2>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {features.map((feature) => (
              <FeatureCard
                key={feature.title}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
