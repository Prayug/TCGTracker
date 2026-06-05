import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-auto border-t border-border-subtle bg-surface-inset">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 px-4 py-4 text-xs text-ink-muted sm:flex-row sm:items-center sm:px-6">
        <span>© 2026 TCGTracker</span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link to="/browse" className="transition-colors hover:text-ink-primary">
            Browse
          </Link>
          <Link to="/prices" className="transition-colors hover:text-ink-primary">
            Prices
          </Link>
          <Link to="/vault" className="transition-colors hover:text-ink-primary">
            Vault
          </Link>
          <a
            href="https://pokemontcg.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-ink-primary"
          >
            Pokémon TCG API
          </a>
        </div>
      </div>
    </footer>
  );
};
