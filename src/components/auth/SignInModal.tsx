import { FormEvent, useEffect, useState } from 'react';
import { LogIn, Mail, UserPlus } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../common/Toast';
import { formatApiError } from '../../utils/apiError';
import axios from 'axios';

export type AuthModalMode = 'login' | 'register';

interface SignInModalProps {
  isOpen: boolean;
  mode: AuthModalMode;
  onModeChange: (mode: AuthModalMode) => void;
  onClose: () => void;
}

export function SignInModal({ isOpen, mode, onModeChange, onClose }: SignInModalProps) {
  const { login, register, resendVerification } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState<string | null>(null);
  const [devVerifyUrl, setDevVerifyUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setPassword('');
    setPendingVerifyEmail(null);
    setDevVerifyUrl(null);
  }, [isOpen, mode]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const sync = await login(email.trim(), password);
        showToast(sync?.message || 'Signed in — your collection is synced', 'success');
        setPassword('');
        onClose();
      } else {
        if (username.trim().length < 3) {
          setError('Username must be at least 3 characters');
          setSubmitting(false);
          return;
        }
        const result = await register(username.trim(), email.trim(), password);
        setPendingVerifyEmail(result.email);
        setDevVerifyUrl(result.verifyUrl ?? null);
        setPassword('');
        showToast(result.message, result.emailSent ? 'success' : 'info');
      }
    } catch (err: unknown) {
      const code = axios.isAxiosError(err) ? err.response?.data?.code : undefined;
      if (code === 'EMAIL_NOT_VERIFIED') {
        setPendingVerifyEmail(email.trim());
        setError('Please verify your email before signing in. We can resend the link below.');
      } else {
        setError(formatApiError(err, 'Authentication failed'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!pendingVerifyEmail) return;
    setResending(true);
    setError(null);
    try {
      const result = await resendVerification(pendingVerifyEmail);
      if (result.verifyUrl) setDevVerifyUrl(result.verifyUrl);
      showToast(result.message || 'Verification email sent', 'success');
    } catch (err: unknown) {
      setError(formatApiError(err, 'Could not resend verification email'));
    } finally {
      setResending(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-border-default bg-surface-inset px-3 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';
  const labelClass = 'mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-ink-muted';

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="small" variant="confirm">
      <div className="space-y-5 p-1">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-foil">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            Account
          </p>
          <h2 className="mt-2 font-display text-xl font-semibold text-ink-primary">
            {pendingVerifyEmail
              ? 'Check your email'
              : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {pendingVerifyEmail
              ? `We sent a verification link to ${pendingVerifyEmail}. Open it to finish signing up.`
              : mode === 'login'
                ? 'Sync your vault, watchlists, and alerts across devices.'
                : 'We will email you a verification link to confirm your account.'}
          </p>
        </div>

        {pendingVerifyEmail ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-border-default bg-surface-inset px-3 py-3">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <div className="min-w-0 text-sm text-ink-secondary">
                <p>
                  Click the link in the email to verify. The link expires in 24 hours.
                </p>
                {devVerifyUrl && (
                  <p className="mt-2 break-all text-xs text-ink-muted">
                    Dev link (SMTP off):{' '}
                    <a href={devVerifyUrl} className="text-accent underline">
                      {devVerifyUrl}
                    </a>
                  </p>
                )}
              </div>
            </div>
            {error && (
              <p className="rounded-lg border border-loss/30 bg-loss-muted px-3 py-2 text-sm text-loss" role="alert">
                {error}
              </p>
            )}
            <button
              type="button"
              disabled={resending}
              onClick={() => void handleResend()}
              className="btn-secondary w-full justify-center py-2.5 disabled:opacity-50"
            >
              {resending ? 'Sending…' : 'Resend verification email'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingVerifyEmail(null);
                setDevVerifyUrl(null);
                onModeChange('login');
              }}
              className="w-full text-center text-sm text-ink-muted hover:text-ink-secondary"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-1 rounded-xl border border-border-default bg-surface-inset p-1">
              <button
                type="button"
                onClick={() => onModeChange('login')}
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
                onClick={() => onModeChange('register')}
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

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
              {mode === 'register' && (
                <div>
                  <label htmlFor="signin-username" className={labelClass}>
                    Username
                  </label>
                  <input
                    id="signin-username"
                    type="text"
                    autoComplete="username"
                    required
                    minLength={3}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={inputClass}
                    placeholder="collector"
                  />
                </div>
              )}
              <div>
                <label htmlFor="signin-email" className={labelClass}>
                  Email
                </label>
                <input
                  id="signin-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label htmlFor="signin-password" className={labelClass}>
                  Password
                </label>
                <input
                  id="signin-password"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  placeholder="••••••••"
                />
                {mode === 'register' && (
                  <p className="mt-1.5 text-xs text-ink-muted">At least 8 characters.</p>
                )}
              </div>

              {error && (
                <p
                  className="rounded-lg border border-loss/30 bg-loss-muted px-3 py-2 text-sm text-loss"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full justify-center py-2.5 disabled:opacity-50"
              >
                {submitting
                  ? mode === 'login'
                    ? 'Signing in…'
                    : 'Creating account…'
                  : mode === 'login'
                    ? 'Sign in & sync'
                    : 'Create account'}
              </button>
            </form>

            <p className="text-center text-xs text-ink-muted">
              New accounts require email verification. Sessions use a secure cookie.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
