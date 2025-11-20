import React from 'react';
import { Zap } from 'lucide-react';
import { AppView } from '../../types/ui';

interface FooterProps {
  onViewChange: (view: AppView) => void;
}

export const Footer: React.FC<FooterProps> = ({ onViewChange }) => {
  return (
    <footer className="relative bg-gray-900 text-white mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-gradient-to-br from-primary-600 to-accent-600 p-2.5 rounded-xl">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-black">TCGTracker</h3>
                <p className="text-xs text-gray-400">Pro Market Tools</p>
              </div>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed mb-4">
              Your ultimate Pokemon TCG companion. Track prices, manage your collection, and discover the most valuable cards in real-time.
            </p>
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 font-semibold">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                LIVE DATA
              </span>
              <span className="text-gray-500">Updated Daily</span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-bold text-white mb-4">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button onClick={() => onViewChange('cards')} className="text-gray-400 hover:text-white transition-colors">
                  Browse Cards
                </button>
              </li>
              <li>
                <button onClick={() => onViewChange('packs')} className="text-gray-400 hover:text-white transition-colors">
                  Pack Opening
                </button>
              </li>
              <li>
                <button onClick={() => onViewChange('vault')} className="text-gray-400 hover:text-white transition-colors">
                  My Collection
                </button>
              </li>
              <li>
                <button onClick={() => onViewChange('tracking')} className="text-gray-400 hover:text-white transition-colors">
                  Price Tracker
                </button>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-bold text-white mb-4">Data Sources</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://pokemontcg.io/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  Pokemon TCG API
                </a>
              </li>
              <li>
                <a
                  href="https://tcgcsv.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  TCGCSV.com
                </a>
              </li>
              <li>
                <a
                  href="https://www.tcgplayer.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  TCGPlayer
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-gray-800">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-400">
            <p>© 2024 TCGTracker. All rights reserved. Built with ❤️ for collectors.</p>
            <div className="flex items-center gap-6">
              <span>52,000+ Cards Tracked</span>
              <span>•</span>
              <span>15,000+ Active Users</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

