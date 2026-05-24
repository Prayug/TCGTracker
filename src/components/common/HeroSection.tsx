import React from 'react';
import { ArrowRight, Camera, Search } from 'lucide-react';
import { StatsBar, StatCard } from './StatCard';
import { AppView } from '../../types/ui';
import { pokemonApi } from '../../services/pokemonApi';
import { vaultService } from '../../services/vaultService';
import { PokemonCard } from '../../types/pokemon';
import { HeroPortfolioPreview } from './HeroPortfolioPreview';
import { MarketPulseList } from './MarketTicker';

interface HeroSectionProps {
  onStartSearch: (query: string) => void;
  onViewChange: (view: AppView) => void;
}

const quickSearches = ['Charizard', 'Pikachu', 'Gengar', 'Umbreon'];

const workflows: { label: string; description: string; view: AppView }[] = [
  { label: 'Browse cards', description: 'Search listings by name, set, or rarity.', view: 'cards' },
  { label: 'Track prices', description: 'Watch cards and review price history.', view: 'prices' },
  { label: 'Manage vault', description: 'Log purchases and see portfolio value.', view: 'vault' },
  { label: 'Scan cards', description: 'Identify a card from a photo.', view: 'scanner' },
  { label: 'AI grade', description: 'Score centering, corners, edges & surface.', view: 'grading' },
];

export const HeroSection: React.FC<HeroSectionProps> = ({ onStartSearch, onViewChange }) => {
  const [searchValue, setSearchValue] = React.useState('');
  const [marketCards, setMarketCards] = React.useState<PokemonCard[]>([]);
  const vaultStats = vaultService.getVaultStats();

  React.useEffect(() => {
    let mounted = true;

    const load = async () => {
      const terms = ['charizard', 'pikachu', 'umbreon', 'mewtwo'];
      try {
        const results = await Promise.all(
          terms.map((term) => pokemonApi.searchCards(term, undefined, 20))
        );
        if (!mounted) return;

        const deduped = new Map<string, PokemonCard>();
        results.flat().forEach((card) => {
          if (!deduped.has(card.id)) deduped.set(card.id, card);
        });
        setMarketCards(Array.from(deduped.values()).slice(0, 20));
      } catch {
        /* optional */
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
    <div id="top" className="overflow-x-hidden bg-surface-base text-ink-primary">
      <section className="border-b border-border-subtle">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <p className="text-sm font-medium text-accent">Pokemon TCG Tracker</p>
          <h1 className="text-gradient mt-2 max-w-2xl text-display sm:text-[2.5rem] sm:leading-tight">
            Track your collection and its market value.
          </h1>
          <p className="mt-3 max-w-xl text-base text-ink-secondary">
            Search cards, log your vault, and follow prices — in one place.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 max-w-xl">
            <label htmlFor="hero-card-search" className="sr-only">
              Search Pokemon cards
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                  aria-hidden="true"
                />
                <input
                  id="hero-card-search"
                  type="text"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Card name, set, number…"
                  className="input input-with-icon h-11"
                />
              </div>
              <button type="submit" className="btn-primary h-11 justify-center px-5">
                Search
              </button>
            </div>
          </form>

          <div className="stagger-children mt-4 flex flex-wrap items-center gap-2">
            {quickSearches.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onStartSearch(q)}
                className="rounded-md border border-border-subtle bg-surface-raised px-3 py-1 text-sm text-ink-secondary transition-all duration-200 hover:scale-[1.03] hover:border-accent/40 hover:text-ink-primary"
              >
                {q}
              </button>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={() => onViewChange('cards')} className="btn-primary">
              Browse cards
            </button>
            <button type="button" onClick={() => onViewChange('vault')} className="btn-secondary">
              Open vault
            </button>
            <button
              type="button"
              onClick={() => onViewChange('scanner')}
              className="btn-ghost border border-border-subtle"
            >
              <Camera className="h-4 w-4" />
              Scan
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <StatsBar>
          <StatCard numericValue={50000} suffix="+" label="Cards indexed" />
          <StatCard numericValue={24} suffix="/day" label="Price updates" tone="accent" />
          <StatCard
            numericValue={Math.max(vaultStats.totalCards, 0)}
            label="Cards in vault"
            tone="success"
          />
          <StatCard numericValue={3} suffix="s" label="Avg scan time" />
        </StatsBar>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 pb-12 sm:px-6 lg:grid-cols-[1fr_340px] lg:px-8">
        <MarketPulseList cards={marketCards} onCardClick={(card) => onStartSearch(card.name)} />

        <HeroPortfolioPreview
          cards={marketCards}
          onCardClick={(card) => onStartSearch(card.name)}
        />
      </section>

      <div
        className="h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent"
        aria-hidden="true"
      />

      <section className="bg-surface-inset">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h2 className="text-h2 text-ink-primary">Quick links</h2>
          <ul className="stagger-children mt-6 grid gap-3 sm:grid-cols-2">
            {workflows.map(({ label, description, view }) => (
              <li key={view}>
                <button
                  type="button"
                  onClick={() => onViewChange(view)}
                  className="card card-interactive group flex w-full items-center justify-between gap-4 !p-4 text-left"
                >
                  <span>
                    <span className="block text-sm font-semibold text-ink-primary">{label}</span>
                    <span className="mt-0.5 block text-sm text-ink-muted">{description}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-accent" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
};
