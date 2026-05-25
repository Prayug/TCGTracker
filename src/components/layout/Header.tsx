import React, { useState } from 'react';
import {
  BookOpen,
  Camera,
  ChevronRight,
  CircleDollarSign,
  LayoutGrid,
  LineChart,
  Menu,
  Package,
  X,
  Zap,
} from 'lucide-react';
import { AppView } from '../../types/ui';
import { UserMenu } from './UserMenu';

interface HeaderProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
}

const navItems: { view: AppView; label: string; icon: React.ReactNode }[] = [
  { view: 'home', label: 'Home', icon: <Zap className="h-4 w-4" /> },
  { view: 'cards', label: 'Browse', icon: <LayoutGrid className="h-4 w-4" /> },
  { view: 'tracking', label: 'Prices', icon: <LineChart className="h-4 w-4" /> },
  { view: 'vault', label: 'Collection', icon: <BookOpen className="h-4 w-4" /> },
  { view: 'packs', label: 'Packs', icon: <Package className="h-4 w-4" /> },
  { view: 'scanner', label: 'Scanner', icon: <Camera className="h-4 w-4" /> },
];

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
        active
          ? 'bg-white/[0.1] text-white'
          : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-emerald-400"
          aria-hidden="true"
        />
      )}
      <span className={active ? 'pl-1' : ''}>{children}</span>
    </button>
  );
}

export const Header: React.FC<HeaderProps> = ({ currentView, onViewChange }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0f17]/90 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => {
              onViewChange('home');
              setMobileOpen(false);
            }}
            className="group flex shrink-0 items-center gap-2.5"
          >
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-300/40 bg-emerald-400/10">
              <Zap className="h-4 w-4 text-emerald-300" />
            </div>
            <span className="text-base font-semibold tracking-tight text-white">TCGTracker</span>
          </button>

          <nav className="hidden items-center gap-0.5 md:flex">
            {navItems.map(({ view, label, icon }) => (
              <NavButton
                key={view}
                active={currentView === view}
                onClick={() => onViewChange(view)}
              >
                {icon}
                {label}
              </NavButton>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <button
              type="button"
              onClick={() => onViewChange('tracking')}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-500/20"
            >
              <span className="live-pulse-dot" aria-hidden="true" />
              Market Live
            </button>
            <UserMenu onViewChange={onViewChange} />
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <UserMenu onViewChange={onViewChange} />
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="animate-slide-down border-t border-white/10 bg-[#0a0f17] md:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
            {navItems.map(({ view, label, icon }) => (
              <button
                key={view}
                type="button"
                onClick={() => {
                  onViewChange(view);
                  setMobileOpen(false);
                }}
                className={`flex items-center justify-between rounded-lg border-l-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  currentView === view
                    ? 'border-l-emerald-400 bg-white/[0.08] text-white'
                    : 'border-l-transparent text-slate-300 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2">
                  {icon}
                  {label}
                </span>
                <ChevronRight className="h-4 w-4 text-slate-500" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                onViewChange('tracking');
                setMobileOpen(false);
              }}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-200"
            >
              <CircleDollarSign className="h-3.5 w-3.5" />
              <span className="live-pulse-dot" />
              Market Live
            </button>
          </nav>
        </div>
      )}
    </header>
  );
};
