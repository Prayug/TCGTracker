import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Album,
  Award,
  BookOpen,
  Boxes,
  Camera,
  Heart,
  Home,
  Layers,
  LayoutGrid,
  LineChart,
  Package,
  Settings,
  Swords,
  TrendingUp,
} from 'lucide-react';
import { useGame, GameType } from '../../contexts/GameContext';
import { cn } from '@/lib/utils';

const NAV_GROUPS: {
  label: string;
  items: { to: string; label: string; icon: React.ElementType; end?: boolean }[];
}[] = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Home', icon: Home, end: true }],
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
      { to: '/open', label: 'Open Packs', icon: Boxes },
      { to: '/packs', label: 'Pack Shop', icon: Package },
      { to: '/scanner', label: 'Scan', icon: Camera },
      { to: '/grading', label: 'Grade', icon: Award },
      { to: '/settings', label: 'Settings', icon: Settings },
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
    <aside className="hidden w-56 shrink-0 border-r border-border-subtle bg-sidebar/95 backdrop-blur-xl md:flex md:flex-col">
      <div className="flex h-14 items-center border-b border-border-subtle px-5">
        <NavLink to="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-accent/35 bg-accent/15 text-accent">
            <span className="font-display text-sm font-bold tracking-tight">T</span>
          </div>
          <span className="font-display text-base font-semibold tracking-tight text-ink-primary">
            TCGTracker
          </span>
        </NavLink>
      </div>

      <div className="px-3 pt-4 pb-2">
        <div className="flex rounded-xl border border-border-default bg-surface-inset p-0.5">
          {GAME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setGame(value)}
              className={cn(
                'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors duration-200',
                game === value
                  ? 'bg-foil/15 text-foil'
                  : 'text-ink-muted hover:text-ink-secondary'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-3">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label} className={cn(groupIndex > 0 && 'mt-5')}>
            <p className="mb-1.5 px-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200',
                        isActive
                          ? 'bg-accent/10 text-accent'
                          : 'text-ink-secondary hover:bg-surface-hover hover:text-ink-primary'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive ? (
                          <span
                            className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent"
                            aria-hidden
                          />
                        ) : null}
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
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

      <div className="border-t border-border-subtle px-4 py-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          Collection command
        </p>
      </div>
    </aside>
  );
};
