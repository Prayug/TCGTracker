import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  ArrowLeftRight,
  Award,
  BookOpen,
  Boxes,
  Camera,
  Heart,
  Home,
  LayoutGrid,
  LineChart,
  Percent,
  Settings,
  Swords,
  TrendingUp,
} from 'lucide-react';
import { useGame, type GameType } from '../../contexts/GameContext';
import { cn } from '@/lib/utils';

const NAV_GROUPS: {
  label?: string;
  items: { to: string; label: string; icon: React.ElementType; end?: boolean }[];
}[] = [
  {
    items: [{ to: '/', label: 'Home', icon: Home, end: true }],
  },
  {
    label: 'Collection',
    items: [
      { to: '/browse', label: 'Browse', icon: LayoutGrid },
      { to: '/vault', label: 'Vault', icon: BookOpen },
      { to: '/wishlist', label: 'Wishlist', icon: Heart },
      { to: '/trade', label: 'Trade', icon: ArrowLeftRight },
    ],
  },
  {
    label: 'Market',
    items: [
      { to: '/prices', label: 'Market', icon: TrendingUp },
      { to: '/deals', label: 'Deals', icon: Percent },
      { to: '/market-insights', label: 'Insights', icon: LineChart },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/scanner', label: 'Scan', icon: Camera },
      { to: '/grading', label: 'Grade', icon: Award },
      { to: '/open', label: 'Open Packs', icon: Boxes },
    ],
  },
];

const GAME_OPTIONS: { value: GameType; label: string; short: string; icon: React.ElementType }[] = [
  { value: 'pokemon', label: 'Pokémon', short: 'PKM', icon: LayoutGrid },
  { value: 'onepiece', label: 'One Piece', short: 'OP', icon: Swords },
];

export const Sidebar: React.FC = () => {
  const { game, setGame } = useGame();

  return (
    <aside className="hidden w-[15.5rem] shrink-0 border-r border-border-subtle bg-sidebar/95 backdrop-blur-xl md:flex md:flex-col">
      <div className="flex h-14 items-center border-b border-border-subtle px-4">
        <NavLink to="/" className="min-w-0">
          <span className="text-lg font-semibold tracking-[-0.02em] text-ink-primary">
            TCG Tracker
          </span>
        </NavLink>
      </div>

      <div className="border-b border-border-subtle px-3 py-3">
        <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-secondary">
          Game
        </p>
        <div
          role="group"
          aria-label="Active game"
          className="grid grid-cols-2 gap-1.5 rounded-lg border border-border-strong bg-surface-inset/80 p-1.5"
        >
          {GAME_OPTIONS.map(({ value, label, icon: Icon }) => {
            const active = game === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setGame(value)}
                aria-pressed={active}
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-1 rounded-md px-2 py-2.5 text-center transition-colors duration-200',
                  active
                    ? 'bg-accent/20 text-accent ring-1 ring-accent/35'
                    : 'text-ink-secondary hover:bg-surface-hover hover:text-ink-primary'
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                <span className="text-[11px] font-semibold leading-tight">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-3">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label ?? `group-${groupIndex}`} className={cn(groupIndex > 0 && 'mt-5')}>
            {group.label ? (
              <p className="mb-1.5 px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-secondary">
                {group.label}
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <li key={`${to}-${label}`}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200',
                        isActive
                          ? 'bg-accent/10 font-semibold text-accent'
                          : 'text-ink-secondary hover:bg-surface-hover hover:text-ink-primary'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive ? (
                          <span
                            className="absolute left-0 top-1/2 h-4 w-px -translate-y-1/2 bg-accent"
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

      <div className="border-t border-border-subtle px-3 py-3">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-accent/10 font-semibold text-accent'
                : 'text-ink-secondary hover:bg-surface-hover hover:text-ink-primary'
            )
          }
        >
          <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
          Settings
        </NavLink>
      </div>
    </aside>
  );
};
