import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-auto border-t border-border-subtle bg-surface-inset/80">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 px-4 py-4 text-xs text-ink-muted sm:flex-row sm:items-center sm:px-6">
        <span className="font-display tracking-wide text-ink-secondary">
          © 2026 TCGTracker · Chromatic Vault
        </span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link to="/browse" className="cursor-pointer transition-colors hover:text-accent">
            Browse
          </Link>
          <Link to="/prices" className="cursor-pointer transition-colors hover:text-accent">
            Prices
          </Link>
          <Link to="/vault" className="cursor-pointer transition-colors hover:text-accent">
            Vault
          </Link>
          <a
            href="https://pokemontcg.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer transition-colors hover:text-foil"
          >
            Pokémon TCG API
          </a>
        </div>
      </div>
    </footer>
  );
};
