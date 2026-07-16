import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  BookOpen,
  Camera,
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
      { to: '/vault', label: 'Vault', icon: BookOpen },
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
          <div className="relative flex h-8 w-8 items-center justify-center rounded-md border border-border-default bg-gradient-accent shadow-glow-accent">
            <span className="font-mono text-sm font-semibold text-white">T</span>
          </div>
          <span className="font-display text-sm font-semibold tracking-tight text-ink-primary">
            TCGTracker
          </span>
        </NavLink>
      </div>

      {/* Game Switcher */}
      <div className="relative px-3 pt-3 pb-3">
        <div
          className="pointer-events-none absolute inset-x-3 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent"
          aria-hidden="true"
        />
        <div className="flex rounded-lg border border-border-default bg-surface-inset p-0.5">
          {GAME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setGame(value)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all duration-200 ${
                game === value
                  ? 'bg-gradient-accent text-white shadow-sm'
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
              <div className="mx-2 my-4 h-px bg-border-subtle" aria-hidden="true" />
            )}
            <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-ink-muted">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? 'bg-accent/10 text-accent'
                          : 'text-ink-secondary hover:bg-surface-hover hover:text-ink-primary'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent transition-opacity duration-200 ${
                            isActive ? 'opacity-100' : 'opacity-0'
                          }`}
                          aria-hidden="true"
                        />
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-colors duration-200 ${
                            isActive ? 'text-accent' : ''
                          }`}
                          aria-hidden="true"
                        />
                        {label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
};
