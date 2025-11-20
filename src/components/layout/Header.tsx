import React, { useState } from 'react';
import { Zap, TrendingUp, Vault, Package, Menu, X } from 'lucide-react';
import { AppView } from '../../types/ui';

interface HeaderProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView, onViewChange }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <button
            onClick={() => onViewChange('home')}
            className="flex items-center space-x-3 group"
          >
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary-600 to-accent-600 rounded-xl blur opacity-30 group-hover:opacity-50 transition duration-300" />
              <div className="relative bg-gradient-to-br from-primary-600 to-accent-600 p-2.5 rounded-xl shadow-lg">
                <Zap className="w-7 h-7 text-white" />
              </div>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-2xl font-black text-gray-900">
                TCG<span className="text-primary-600">Tracker</span>
              </h1>
              <p className="text-xs text-gray-500 font-semibold -mt-1">Pro Market Tools</p>
            </div>
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-1">
            <button
              onClick={() => onViewChange('home')}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
                currentView === 'home'
                  ? 'text-primary-600 bg-primary-50'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Home
            </button>
            <button
              onClick={() => onViewChange('cards')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
                currentView === 'cards'
                  ? 'text-primary-600 bg-primary-50'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Zap className="w-4 h-4" />
              Browse Cards
            </button>
            <button
              onClick={() => onViewChange('packs')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
                currentView === 'packs'
                  ? 'text-primary-600 bg-primary-50'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Package className="w-4 h-4" />
              Pack Opening
            </button>
            <button
              onClick={() => onViewChange('vault')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
                currentView === 'vault'
                  ? 'text-primary-600 bg-primary-50'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Vault className="w-4 h-4" />
              My Collection
            </button>
            <button
              onClick={() => onViewChange('tracking')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
                currentView === 'tracking'
                  ? 'text-primary-600 bg-primary-50'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Price Tracker
            </button>
          </nav>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-4 border-t border-gray-200">
            <nav className="flex flex-col space-y-2">
              <button
                onClick={() => { onViewChange('home'); setMobileMenuOpen(false); }}
                className={`px-4 py-3 rounded-lg font-semibold text-left ${
                  currentView === 'home' ? 'text-primary-600 bg-primary-50' : 'text-gray-700'
                }`}
              >
                Home
              </button>
              <button
                onClick={() => { onViewChange('cards'); setMobileMenuOpen(false); }}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg font-semibold text-left ${
                  currentView === 'cards' ? 'text-primary-600 bg-primary-50' : 'text-gray-700'
                }`}
              >
                <Zap className="w-4 h-4" />
                Browse Cards
              </button>
              <button
                onClick={() => { onViewChange('packs'); setMobileMenuOpen(false); }}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg font-semibold text-left ${
                  currentView === 'packs' ? 'text-primary-600 bg-primary-50' : 'text-gray-700'
                }`}
              >
                <Package className="w-4 h-4" />
                Pack Opening
              </button>
              <button
                onClick={() => { onViewChange('vault'); setMobileMenuOpen(false); }}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg font-semibold text-left ${
                  currentView === 'vault' ? 'text-primary-600 bg-primary-50' : 'text-gray-700'
                }`}
              >
                <Vault className="w-4 h-4" />
                My Collection
              </button>
              <button
                onClick={() => { onViewChange('tracking'); setMobileMenuOpen(false); }}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg font-semibold text-left ${
                  currentView === 'tracking' ? 'text-primary-600 bg-primary-50' : 'text-gray-700'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                Price Tracker
              </button>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

