import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { PageHeader, PageShell } from '../components/layout/PageShell';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/common/Toast';
import { formatApiError } from '../utils/apiError';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { verifyEmail, openAuthModal } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    token ? 'loading' : 'error'
  );
  const [message, setMessage] = useState(
    token ? 'Verifying your email…' : 'Missing verification token.'
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    void (async () => {
      try {
        const sync = await verifyEmail(token);
        if (cancelled) return;
        setStatus('success');
        setMessage(sync.message || 'Email verified. You are signed in.');
        showToast('Email verified — welcome!', 'success');
        window.setTimeout(() => navigate('/vault', { replace: true }), 1600);
      } catch (err: unknown) {
        if (cancelled) return;
        setStatus('error');
        setMessage(formatApiError(err, 'Verification failed'));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, verifyEmail, navigate, showToast]);

  return (
    <PageShell>
      <PageHeader eyebrow="Account" title="Email verification" description={message} />
      <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-border-default bg-surface-raised px-6 py-10 text-center">
        {status === 'loading' && (
          <Loader2 className="mb-4 h-10 w-10 animate-spin text-accent" aria-hidden />
        )}
        {status === 'success' && (
          <CheckCircle2 className="mb-4 h-10 w-10 text-gain" aria-hidden />
        )}
        {status === 'error' && <XCircle className="mb-4 h-10 w-10 text-loss" aria-hidden />}

        <p className="text-sm text-ink-secondary">{message}</p>

        {status === 'success' && (
          <p className="mt-3 text-xs text-ink-muted">Redirecting to your vault…</p>
        )}

        {status === 'error' && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className="btn-primary px-4 py-2 text-sm"
            >
              Sign in
            </button>
            <Link to="/settings?mode=register" className="btn-secondary px-4 py-2 text-sm">
              Create account
            </Link>
          </div>
        )}
      </div>
    </PageShell>
  );
}
