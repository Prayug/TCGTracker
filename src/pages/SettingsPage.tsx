import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, LogOut, UserPlus } from 'lucide-react';
import { PageHeader, PageShell } from '../components/layout/PageShell';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/common/Toast';
import { authService } from '../services/authService';
import { env } from '../config/env';
import { syncUserDataOnLogin } from '../services/userDataSyncService';

type AuthMode = 'login' | 'register';

export function SettingsPage() {
  const {
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    refreshUser,
    openAuthModal,
  } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const modeParam = searchParams.get('mode');
  const [mode, setMode] = useState<AuthMode>(modeParam === 'register' ? 'register' : 'login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profileUsername, setProfileUsername] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (modeParam === 'register' || modeParam === 'login') {
      setMode(modeParam);
      if (!user && env.enableAuth) {
        openAuthModal(modeParam);
      }
    }
  }, [modeParam, user, openAuthModal]);

  useEffect(() => {
    if (user) {
      setProfileUsername(user.username);
      setProfileEmail(user.email);
    }
  }, [user]);

  const setAuthMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set('mode', next);
        return params;
      },
      { replace: true }
    );
  };

  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const sync = await login(email.trim(), password);
        showToast(sync.message || 'Signed in', 'success');
        setPassword('');
        navigate('/settings', { replace: true });
      } else {
        const result = await register(username.trim(), email.trim(), password);
        showToast(result.message, result.emailSent ? 'success' : 'info');
        setPassword('');
        openAuthModal('register');
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string; code?: string } } })?.response?.data
          ?.error ||
        (err as Error)?.message ||
        'Authentication failed';
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === 'EMAIL_NOT_VERIFIED') {
        openAuthModal('login');
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await authService.updateProfile(
        profileUsername.trim() || undefined,
        profileEmail.trim() || undefined
      );
      await refreshUser();
      showToast('Profile updated', 'success');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (err as Error)?.message ||
        'Failed to update profile';
      showToast(message, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    showToast('Signed out', 'info');
    setAuthMode('login');
  };

  const inputClass =
    'w-full rounded-lg border border-border-default bg-surface-inset px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';
  const labelClass = 'mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-ink-muted';

  if (isLoading) {
    return (
      <PageShell>
        <PageHeader title="Settings" description="Loading account…" />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description={
          isAuthenticated
            ? 'Manage your account and notification preferences.'
            : 'Sign in to sync your vault, watchlists, and price alerts.'
        }
      />

      {isAuthenticated && user ? (
        <div className="mx-auto max-w-lg space-y-8">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-ink-primary">Account</h2>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label htmlFor="profile-username" className={labelClass}>
                  Username
                </label>
                <input
                  id="profile-username"
                  className={inputClass}
                  value={profileUsername}
                  onChange={(e) => setProfileUsername(e.target.value)}
                  autoComplete="username"
                  minLength={3}
                  required
                />
              </div>
              <div>
                <label htmlFor="profile-email" className={labelClass}>
                  Email
                </label>
                <input
                  id="profile-email"
                  type="email"
                  className={inputClass}
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
                <p className="mt-1.5 text-xs text-ink-muted">
                  Used for price alert emails when SMTP is configured on the server.
                </p>
              </div>
              <button
                type="submit"
                disabled={savingProfile}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {savingProfile ? 'Saving…' : 'Save changes'}
              </button>
            </form>
          </section>

          <section className="space-y-2 border-t border-border-subtle pt-6">
            <h2 className="text-sm font-semibold text-ink-primary">Cloud sync</h2>
            <p className="text-sm text-ink-secondary">
              Vault, watchlists, and alerts sync when you sign in. Push local changes anytime.
            </p>
            <button
              type="button"
              onClick={async () => {
                try {
                  const result = await syncUserDataOnLogin();
                  showToast(result.message, 'success');
                } catch {
                  showToast('Sync failed', 'error');
                }
              }}
              className="rounded-lg border border-border-default bg-surface-inset px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-hover"
            >
              Sync now
            </button>
          </section>

          <section className="space-y-2 border-t border-border-subtle pt-6">
            <h2 className="text-sm font-semibold text-ink-primary">Preferences</h2>
            <p className="text-sm text-ink-secondary">
              Theme is controlled from the sun/moon toggle in the header.
            </p>
          </section>

          <section className="border-t border-border-subtle pt-6">
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-lg border border-loss/30 bg-loss-muted px-4 py-2 text-sm font-medium text-loss transition-colors hover:bg-loss/15"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </section>
        </div>
      ) : (
        <div className="mx-auto max-w-md space-y-6">
          <div className="flex rounded-xl border border-border-default bg-surface-inset p-0.5">
            <button
              type="button"
              onClick={() => setAuthMode('login')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                mode === 'login'
                  ? 'bg-accent/15 text-accent'
                  : 'text-ink-muted hover:text-ink-secondary'
              }`}
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('register')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                mode === 'register'
                  ? 'bg-accent/15 text-accent'
                  : 'text-ink-muted hover:text-ink-secondary'
              }`}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Register
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label htmlFor="auth-username" className={labelClass}>
                  Username
                </label>
                <input
                  id="auth-username"
                  className={inputClass}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  minLength={3}
                  required
                />
              </div>
            )}
            <div>
              <label htmlFor="auth-email" className={labelClass}>
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label htmlFor="auth-password" className={labelClass}>
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={mode === 'register' ? 8 : undefined}
                required
              />
              {mode === 'register' && (
                <p className="mt-1.5 text-xs text-ink-muted">At least 8 characters.</p>
              )}
            </div>

            {error && (
              <p className="rounded-lg border border-loss/25 bg-loss-muted px-3 py-2 text-sm text-loss">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting
                ? mode === 'login'
                  ? 'Signing in…'
                  : 'Creating account…'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>
        </div>
      )}
    </PageShell>
  );
}
