import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Settings, User, Vault } from 'lucide-react';
import { authService, User as AuthUser } from '../../services/authService';
import { AppView } from '../../types/ui';

interface UserMenuProps {
  onViewChange: (view: AppView) => void;
}

export const UserMenu: React.FC<UserMenuProps> = ({ onViewChange }) => {
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
        className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] py-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-white/[0.08]"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/40 to-emerald-500/30 text-xs font-bold text-white">
          {initials}
        </span>
        <span className="hidden max-w-[100px] truncate text-sm font-medium text-slate-200 sm:block">
          {displayName}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-white/15 bg-[#0f1624] py-1 shadow-popover animate-fade-in"
        >
          <div className="border-b border-white/10 px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-white">{displayName}</p>
            <p className="truncate text-xs text-slate-400">
              {user?.email ?? 'Guest · local session'}
            </p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onViewChange('vault');
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.06]"
          >
            <Vault className="h-4 w-4 text-violet-300" />
            My Vault
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.06]"
          >
            <Settings className="h-4 w-4 text-slate-400" />
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
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-300 hover:bg-rose-500/10"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          )}
          {!user && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
              <User className="h-3.5 w-3.5" />
              Sign in when backend auth is enabled
            </div>
          )}
        </div>
      )}
    </div>
  );
};
