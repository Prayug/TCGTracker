import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  BookOpen,
  Camera,
  Layers,
  LayoutGrid,
  LineChart,
  Package,
  TrendingUp,
} from 'lucide-react';

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

export const Sidebar: React.FC = () => {
  return (
    <aside className="hidden w-56 shrink-0 border-r border-border-subtle bg-surface-raised md:flex md:flex-col">
      <div className="flex h-14 items-center border-b border-border-subtle px-5">
        <NavLink to="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border-default bg-accent-muted">
            <span className="font-mono text-sm font-semibold text-accent">T</span>
          </div>
          <span className="text-sm font-semibold tracking-tight text-ink-primary">TCGTracker</span>
        </NavLink>
      </div>

      <nav aria-label="Primary" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-2 text-[11px] font-medium text-ink-muted">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-surface-hover text-ink-primary'
                          : 'text-ink-secondary hover:bg-surface-hover hover:text-ink-primary'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {label}
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
