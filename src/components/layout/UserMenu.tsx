import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Settings, User, Vault } from 'lucide-react';
import { authService, User as AuthUser } from '../../services/authService';

export const UserMenu: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUser(authService.getUser());
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const displayName = user?.username ?? 'Collector';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md border border-border-default bg-surface-raised py-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-surface-hover"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-muted text-xs font-bold text-accent">
          {initials}
        </span>
        <span className="hidden max-w-[100px] truncate text-sm font-medium text-ink-secondary sm:block">
          {displayName}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-lg border border-border-default bg-surface-overlay py-1 shadow-popover animate-fade-in"
        >
          <div className="border-b border-border-subtle px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-ink-primary">{displayName}</p>
            <p className="truncate text-xs text-ink-muted">
              {user?.email ?? 'Guest · local session'}
            </p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              navigate('/vault');
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-secondary hover:bg-surface-hover"
          >
            <Vault className="h-4 w-4 text-accent" />
            My Vault
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-secondary hover:bg-surface-hover"
          >
            <Settings className="h-4 w-4 text-ink-muted" />
            Settings
          </button>
          {user && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                authService.logout();
                setUser(null);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-loss hover:bg-loss-muted"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          )}
          {!user && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-ink-muted">
              <User className="h-3.5 w-3.5" />
              Sign in when backend auth is enabled
            </div>
          )}
        </div>
      )}
    </div>
  );
};
