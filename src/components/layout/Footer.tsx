import React from 'react';
import { Zap } from 'lucide-react';
import { AppView } from '../../types/ui';

interface FooterProps {
  onViewChange: (view: AppView) => void;
}

export const Footer: React.FC<FooterProps> = ({ onViewChange }) => {
  return (
    <footer className="bg-slate-900 text-slate-400 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-bold text-white text-sm">TCGTracker</span>
            </div>
            <p className="text-sm leading-relaxed">
              Track prices, manage your collection, and discover valuable Pokémon TCG cards.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Navigation</p>
            <ul className="space-y-2 text-sm">
              {[
                { view: 'cards' as AppView, label: 'Browse Cards' },
                { view: 'tracking' as AppView, label: 'Price Tracker' },
                { view: 'vault' as AppView, label: 'My Collection' },
                { view: 'packs' as AppView, label: 'Pack Opening' },
                { view: 'scanner' as AppView, label: 'Card Scanner' },
              ].map(({ view, label }) => (
                <li key={view}>
                  <button
                    onClick={() => onViewChange(view)}
                    className="hover:text-white transition-colors"
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Data sources */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Data Sources</p>
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
                    className="hover:text-white transition-colors"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <span>© 2025 TCGTracker. All rights reserved.</span>
          <span>Data provided by Pokémon TCG API</span>
        </div>
      </div>
    </footer>
  );
};
