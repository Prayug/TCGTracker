import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Album,
  Award,
  BookOpen,
  Camera,
  Heart,
  Layers,
  LayoutGrid,
  LineChart,
  Package,
  Swords,
  TrendingUp,
} from 'lucide-react';
import { useGame, GameType } from '../../contexts/GameContext';

const NAV_GROUPS: {
  label: string;
  items: { to: string; label: string; icon: React.ElementType; end?: boolean }[];
}[] = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Home', icon: LayoutGrid, end: true }],
  },
  {
    label: 'Collection',
    items: [
      { to: '/browse', label: 'Browse', icon: LayoutGrid },
      { to: '/binders', label: 'Binders', icon: Album },
      { to: '/vault', label: 'Vault', icon: BookOpen },
      { to: '/wishlist', label: 'Wishlist', icon: Heart },
      { to: '/sets', label: 'Sets', icon: Layers },
    ],
  },
  {
    label: 'Market',
    items: [
      { to: '/prices', label: 'Prices', icon: LineChart },
      { to: '/market-insights', label: 'Insights', icon: TrendingUp },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/packs', label: 'Packs', icon: Package },
      { to: '/scanner', label: 'Scan', icon: Camera },
      { to: '/grading', label: 'Grade', icon: Award },
    ],
  },
];

const GAME_OPTIONS: { value: GameType; label: string; icon: React.ElementType }[] = [
  { value: 'pokemon', label: 'Pokemon', icon: LayoutGrid },
  { value: 'onepiece', label: 'One Piece', icon: Swords },
];

export const Sidebar: React.FC = () => {
  const { game, setGame } = useGame();

  return (
    <aside className="hidden w-56 shrink-0 border-r border-border-subtle bg-surface-raised md:flex md:flex-col">
      <div className="flex h-14 items-center border-b border-border-subtle px-5">
        <NavLink to="/" className="flex items-center gap-2.5">
          <div className="relative flex h-8 w-8 items-center justify-center border border-accent bg-surface-base shadow-[0_0_12px_var(--ring-accent)]">
            <span className="font-display text-sm tracking-tight text-accent">T</span>
          </div>
          <span className="font-display text-base tracking-tight text-ink-primary">
            TCGTracker
          </span>
        </NavLink>
      </div>

      {/* Game Switcher */}
      <div className="relative px-3 pt-3 pb-3">
        <div className="flex border border-border-default bg-surface-inset">
          {GAME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setGame(value)}
              className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200 neon-flood ${
                game === value
                  ? 'bg-accent text-black shadow-[0_0_12px_var(--ring-accent)]'
                  : 'text-ink-muted hover:text-ink-secondary'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label}>
            {groupIndex > 0 && (
              <div className="mx-2 my-4 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" aria-hidden="true" />
            )}
            <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-ink-muted">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 border-l-2 px-3 py-2.5 text-sm font-semibold transition-all duration-200 neon-flood ${
                        isActive
                          ? 'border-accent bg-accent/10 text-accent shadow-[inset_0_0_20px_var(--ring-accent)]'
                          : 'border-transparent text-ink-secondary hover:border-accent/30 hover:bg-surface-hover hover:text-ink-primary'
                      }`
                    }
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 transition-colors duration-200 ${
                        'group-hover:text-accent'
                      }`}
                      aria-hidden="true"
                    />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border-subtle px-3 py-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-muted">
          {NAV_GROUPS.flatMap(g => g.items).length} tools · v2.0
        </div>
      </div>
    </aside>
  );
};
