import React from 'react';
import { ArrowUpRight, BookOpen, Camera, LayoutGrid, LineChart, Package, Zap } from 'lucide-react';
import { AppView } from '../../types/ui';

interface FooterProps {
  onViewChange: (view: AppView) => void;
}

const NAV_ITEMS: { view: AppView; label: string; icon: React.ElementType }[] = [
  { view: 'cards', label: 'Browse Cards', icon: LayoutGrid },
  { view: 'tracking', label: 'Price Tracker', icon: LineChart },
  { view: 'vault', label: 'Collection', icon: BookOpen },
  { view: 'packs', label: 'Pack Opening', icon: Package },
  { view: 'scanner', label: 'Card Scanner', icon: Camera },
];

export const Footer: React.FC<FooterProps> = ({ onViewChange }) => {
  return (
    <footer className="mt-14 border-t border-white/10 bg-[#070b12] text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-300/35 bg-emerald-400/10">
                <Zap className="h-4 w-4 text-emerald-300" />
              </div>
              <span className="text-sm font-semibold text-white">TCGTracker</span>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-slate-400">
              Market-focused Pokemon TCG tracking for collectors who care about portfolio performance,
              pricing confidence, and fast workflows.
            </p>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Platform</p>
            <ul className="space-y-2 text-sm">
              {NAV_ITEMS.map(({ view, label, icon: Icon }) => (
                <li key={view}>
                  <button
                    onClick={() => onViewChange(view)}
                    className="inline-flex items-center gap-2 text-slate-400 transition-colors hover:text-white"
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Data Sources</p>
            <ul className="space-y-2 text-sm">
              {[
                { href: 'https://pokemontcg.io/', label: 'Pokémon TCG API' },
                { href: 'https://tcgcsv.com/', label: 'TCGCSV' },
                { href: 'https://www.tcgplayer.com/', label: 'TCGPlayer' },
              ].map(({ href, label }) => (
                <li key={href}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-slate-400 transition-colors hover:text-white"
                  >
                    {label}
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Built For</p>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>Collectors tracking real market value</li>
              <li>Investors comparing buy opportunities</li>
              <li>Users maintaining long-term portfolios</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-2 border-t border-white/10 pt-5 text-xs text-slate-500 sm:flex-row sm:items-center">
          <span>© 2026 TCGTracker. All rights reserved.</span>
          <span className="text-slate-500">Pricing references provided by trusted partner APIs.</span>
        </div>
      </div>
    </footer>
  );
};
