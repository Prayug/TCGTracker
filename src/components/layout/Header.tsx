import React, { useState } from 'react';
import { LayoutGrid, TrendingUp, BookOpen, Package, Camera, Menu, X, Zap } from 'lucide-react';
import { AppView } from '../../types/ui';

interface HeaderProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
}

const navItems: { view: AppView; label: string; icon: React.ReactNode }[] = [
  { view: 'cards', label: 'Browse', icon: <LayoutGrid className="w-4 h-4" /> },
  { view: 'tracking', label: 'Prices', icon: <TrendingUp className="w-4 h-4" /> },
  { view: 'vault', label: 'Collection', icon: <BookOpen className="w-4 h-4" /> },
  { view: 'packs', label: 'Packs', icon: <Package className="w-4 h-4" /> },
  { view: 'scanner', label: 'Scanner', icon: <Camera className="w-4 h-4" /> },
];

export const Header: React.FC<HeaderProps> = ({ currentView, onViewChange }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <button
            onClick={() => { onViewChange('home'); setMobileOpen(false); }}
            className="flex items-center gap-2 group"
          >
            <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900 text-base tracking-tight">
              TCGTracker
            </span>
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(({ view, label, icon }) => (
              <button
                key={view}
                onClick={() => onViewChange(view)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 ${
                  currentView === view
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </nav>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white animate-slide-down">
          <nav className="max-w-7xl mx-auto px-4 py-2 flex flex-col gap-1">
            {navItems.map(({ view, label, icon }) => (
              <button
                key={view}
                onClick={() => { onViewChange(view); setMobileOpen(false); }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  currentView === view
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
};
