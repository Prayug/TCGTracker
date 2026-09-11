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
      { to: '/trade', label: 'Trade', icon: ArrowLeftRight },
      { to: '/sets', label: 'Sets', icon: Layers },
    ],
  },
  {
    label: 'Market',
    items: [
      { to: '/prices', label: 'Slabs', icon: Layers },
      { to: '/market-insights', label: 'Insights', icon: TrendingUp },
      { to: '/investments', label: 'Investments', icon: LineChart },
      { to: '/deals', label: 'Deals', icon: Percent },
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
    <aside className="hidden w-56 shrink-0 border-r border-white/10 bg-chrome md:flex md:flex-col">
      <div className="flex h-14 items-center border-b border-white/10 px-5">
        <NavLink to="/" className="min-w-0">
          <span className="font-display text-lg font-extrabold tracking-tight text-felt-ink">
            TCG Tracker
          </span>
        </NavLink>
      </div>

      <div className="px-3 pt-4 pb-2">
        <div className="flex rounded-[4px] border border-white/10 bg-black/20 p-0.5">
          {GAME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setGame(value)}
              className={cn(
                'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[3px] px-2 py-1.5 text-xs font-medium transition-colors duration-200',
                game === value
                  ? 'bg-foil/20 text-foil'
                  : 'text-felt-muted hover:text-felt-secondary'
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
            <p className="mb-1.5 px-2.5 text-[11px] font-medium text-felt-muted">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex cursor-pointer items-center gap-3 rounded-[4px] px-3 py-2 text-sm font-medium transition-colors duration-200',
                        isActive
                          ? 'bg-white/10 font-semibold text-felt-ink'
                          : 'text-felt-secondary hover:bg-white/5 hover:text-felt-ink'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive ? (
                          <span
                            className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 bg-sticker"
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

      <div className="border-t border-white/10 px-4 py-3">
        <p className="text-[11px] font-medium text-felt-muted">Shop desk</p>
      </div>
    </aside>
  );
};
