import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Album,
  ArrowLeftRight,
  Award,
  BookOpen,
  Boxes,
  Camera,
  Heart,
  Home,
  Layers,
  LayoutGrid,
  LineChart,
  Percent,
  Package,
  Settings,
  Swords,
  TrendingUp,
  Waves,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useGame, GameType } from '../../contexts/GameContext';
import { BrandMark } from './BrandMark';
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
      { to: '/trade', label: 'Trade', icon: ArrowLeftRight },
      { to: '/sets', label: 'Sets', icon: Layers },
    ],
  },
  {
    label: 'Market',
    items: [
      { to: '/prices', label: 'Slabs', icon: Layers },
      { to: '/money-flow', label: 'Money Flow', icon: Waves },
      { to: '/market-insights', label: 'Insights', icon: TrendingUp },
      { to: '/investments', label: 'Investments', icon: LineChart },
      { to: '/deals', label: 'Deals', icon: Percent },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/open', label: 'OP Boosters', icon: Boxes },
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
        <NavLink to="/" className="flex items-center gap-2" aria-label="TCGTracker home">
          <BrandMark className="h-5 w-5 text-accent" />
          <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink-primary">
            TCGTracker
          </span>
        </NavLink>
      </div>

      <div className="px-3 pt-4 pb-2">
        <div
          role="radiogroup"
          aria-label="Game"
          className="flex rounded-[10px] bg-surface-inset p-0.5 shadow-[inset_0_0_0_1px_var(--border-subtle)]"
        >
          {GAME_OPTIONS.map(({ value, label, icon: Icon }) => {
            const active = game === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setGame(value)}
                className={cn(
                  'relative flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors duration-150',
                  active ? 'text-ink-primary' : 'text-ink-muted hover:text-ink-secondary'
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="sidebar-game-indicator"
                    className="absolute inset-0 -z-0 rounded-lg bg-surface-overlay shadow-[inset_0_0_0_1px_var(--border-default),0_1px_2px_rgb(0_0_0/0.25)]"
                    transition={{ type: 'spring', duration: 0.35, bounce: 0.12 }}
                  />
                ) : null}
                <Icon className="relative h-3.5 w-3.5" />
                <span className="relative">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-3">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label} className={cn(groupIndex > 0 && 'mt-4')}>
            <p className="mb-1 px-2.5 text-[11px] font-medium text-ink-muted">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex h-8 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors duration-150',
                        isActive
                          ? 'text-ink-primary'
                          : 'text-ink-secondary hover:bg-surface-hover/60 hover:text-ink-primary'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive ? (
                          <motion.span
                            layoutId="sidebar-active"
                            aria-hidden
                            className="absolute inset-0 rounded-lg bg-surface-hover shadow-[inset_0_0_0_1px_var(--border-subtle)]"
                            transition={{ type: 'spring', duration: 0.3, bounce: 0.1 }}
                          />
                        ) : null}
                        <Icon
                          className={cn(
                            'relative h-4 w-4 shrink-0 transition-colors duration-150',
                            isActive
                              ? 'text-accent'
                              : 'text-ink-muted group-hover:text-ink-secondary'
                          )}
                          aria-hidden="true"
                        />
                        <span className="relative">{label}</span>
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
