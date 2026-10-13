import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, LogIn, LogOut, Settings, UserPlus, Vault } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { env } from '../../config/env';
import { useToast } from '../common/Toast';
import { AnimatePresence, motion } from 'motion/react';

export const UserMenu: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout, openAuthModal } = useAuth();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
        className="flex h-9 items-center gap-2 rounded-[10px] py-1 pl-1 pr-2 transition-[background-color,transform] duration-150 ease-out hover:bg-surface-hover active:scale-[0.97]"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-muted text-[11px] font-semibold text-accent">
          {initials}
        </span>
        <span className="hidden max-w-[100px] truncate text-sm font-medium text-ink-secondary sm:block">
          {displayName}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-ink-muted transition-transform duration-200 ease-out ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            // Scale out of the trigger, which sits above the menu's right edge.
            style={{ transformOrigin: 'top right' }}
            className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border-default bg-surface-overlay p-1 shadow-popover"
          >
            <div className="mb-1 border-b border-border-subtle px-2.5 pb-2 pt-1.5">
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
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-ink-secondary hover:bg-surface-hover"
            >
              <Vault className="h-4 w-4 text-accent" />
              My Vault
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                navigate('/settings');
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-ink-secondary hover:bg-surface-hover"
            >
              <Settings className="h-4 w-4 text-ink-muted" />
              Settings
            </button>
            {user && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  void logout().then(() => showToast('Signed out — guest data restored', 'info'));
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-loss hover:bg-loss-muted"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            )}
            {!user && env.enableAuth && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    openAuthModal('login');
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-accent hover:bg-accent-muted"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  Sign in
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    openAuthModal('register');
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-ink-secondary hover:bg-surface-hover"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Create account
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
