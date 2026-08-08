import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, Smartphone, X } from 'lucide-react';
import {
  CaptureMode,
  CaptureSide,
  CaptureSessionInfo,
  buildCapturePageUrl,
  cancelCaptureSession,
  consumeCaptureSession,
  createCaptureSession,
  getCaptureSession,
  isLocalhostOrigin,
  resolvePhoneCaptureOrigin,
} from '../../../services/captureSessionApi';

interface PhoneCaptureQrProps {
  mode: CaptureMode;
  /** When capturing a single side that isn't the front (e.g. grade back-only). */
  sideHint?: CaptureSide;
  onImages: (frontImage: string, backImage?: string) => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function PhoneCaptureQr({
  mode,
  sideHint,
  onImages,
  onCancel,
  disabled,
}: PhoneCaptureQrProps) {
  const [session, setSession] = useState<CaptureSessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [originOverride, setOriginOverride] = useState('');
  const [statusLabel, setStatusLabel] = useState('Starting session…');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const consumedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const created = await createCaptureSession(mode);
        if (!active) return;
        sessionIdRef.current = created.id;
        setSession(created);
        setStatusLabel('Waiting for phone…');
      } catch (e) {
        if (!active) return;
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          setError(
            'Capture API not found (404). Restart the Vite dev server so it proxies /api/capture-sessions, and make sure the Node backend is running on port 3001.'
          );
        } else if (status === 429) {
          setError(
            'Too many API requests (429). Wait about a minute, then try Phone camera again.'
          );
        } else {
          setError(e instanceof Error ? e.message : 'Could not start phone capture session');
        }
      }
    })();

    // Do not cancel the session on unmount — React Strict Mode remounts in dev and
    // that was deleting the QR session before the phone could use it.
    return () => {
      active = false;
    };
  }, [mode]);

  useEffect(() => {
    if (!session?.id || consumedRef.current) return;

    const poll = window.setInterval(async () => {
      if (document.hidden) return;
      try {
        const latest = await getCaptureSession(session.id);
        setSession((prev) => ({
          ...latest,
          lanHosts: prev?.lanHosts,
          primaryLanHost: prev?.primaryLanHost,
        }));

        if (latest.status === 'partial') {
          setStatusLabel(
            latest.hasBack
              ? 'Photos received — finishing on phone…'
              : 'Front received — waiting for back or Finish on phone…'
          );
        } else if (latest.status === 'waiting') {
          setStatusLabel('Waiting for phone…');
        }

        if (latest.status === 'ready' && !consumedRef.current) {
          consumedRef.current = true;
          setStatusLabel('Receiving photo…');
          const consumed = await consumeCaptureSession(session.id);
          if (!consumed.frontImage) {
            setError('Phone finished but no image was received. Try again.');
            consumedRef.current = false;
            return;
          }
          onImages(consumed.frontImage, consumed.backImage || undefined);
        }
      } catch (e) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        const message = e instanceof Error ? e.message : 'Lost connection to capture session';
        if (status === 429) {
          setError('Rate limited — wait ~15 seconds, then close and reopen Phone camera.');
          return;
        }
        if (status === 404 || /404|expired/i.test(message)) {
          setError('Capture session was lost. Close this panel and open Phone camera again.');
          window.clearInterval(poll);
        }
      }
    }, 2500);

    return () => window.clearInterval(poll);
  }, [session?.id, onImages]);

  const lanHost = session?.primaryLanHost || session?.lanHosts?.[0] || null;
  const phoneOrigin = useMemo(
    () => resolvePhoneCaptureOrigin(lanHost, originOverride),
    [lanHost, originOverride]
  );
  const captureUrl = session
    ? buildCapturePageUrl(session.id, originOverride, sideHint, lanHost)
    : '';
  const usedAutoLan = isLocalhostOrigin() && Boolean(lanHost) && !originOverride.trim();
  const missingLan = isLocalhostOrigin() && !lanHost && !originOverride.trim();

  return (
    <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/10">
            <Smartphone className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-ink-primary">Phone camera</h3>
            <p className="mt-0.5 text-sm text-ink-muted">
              Scan the QR code with your phone. Photos appear here automatically.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            const id = sessionIdRef.current;
            if (id && !consumedRef.current) {
              void cancelCaptureSession(id);
            }
            onCancel();
          }}
          disabled={disabled}
          className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-inset hover:text-ink-primary"
          aria-label="Cancel phone capture"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="rounded-2xl border border-border-subtle bg-white p-3 shadow-sm">
          {captureUrl && !missingLan ? (
            <QRCodeSVG value={captureUrl} size={180} level="M" includeMargin={false} />
          ) : (
            <div className="flex h-[180px] w-[180px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3 text-sm">
          <div className="flex items-center gap-2 text-ink-secondary">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
            <span>{statusLabel}</span>
          </div>

          {captureUrl && !missingLan && (
            <p className="break-all rounded-lg border border-border-subtle bg-surface-inset px-3 py-2 font-mono text-[11px] text-ink-muted">
              {captureUrl}
            </p>
          )}

          {usedAutoLan && (
            <p className="rounded-lg border border-gain/25 bg-gain/10 px-3 py-2 text-xs text-gain">
              Using your Wi‑Fi address automatically ({phoneOrigin}) so this works from localhost.
              Phone and computer must be on the same Wi‑Fi.
            </p>
          )}

          {missingLan && (
            <div className="space-y-2 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-100">
              <p>
                Couldn&apos;t detect a Wi‑Fi address automatically. Paste your Network URL origin
                below (from the Vite terminal), e.g.{' '}
                <code className="text-amber-50">http://192.168.1.9:5173</code>.
              </p>
              <label className="block space-y-1">
                <span className="text-amber-200/80">LAN origin</span>
                <input
                  type="url"
                  value={originOverride}
                  onChange={(e) => setOriginOverride(e.target.value)}
                  placeholder="http://192.168.1.9:5173"
                  className="w-full rounded-md border border-border-default bg-surface-raised px-2 py-1.5 text-ink-primary placeholder:text-ink-muted"
                />
              </label>
            </div>
          )}

          {!missingLan && (
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-xs font-medium text-ink-muted underline-offset-2 hover:text-ink-secondary hover:underline"
              >
                {showAdvanced ? 'Hide network options' : 'Wrong Wi‑Fi address?'}
              </button>
              {showAdvanced && (
                <label className="mt-2 block space-y-1 text-xs text-ink-muted">
                  <span>Override phone URL origin</span>
                  <input
                    type="url"
                    value={originOverride}
                    onChange={(e) => setOriginOverride(e.target.value)}
                    placeholder={phoneOrigin}
                    className="w-full rounded-md border border-border-default bg-surface-inset px-2 py-1.5 text-ink-primary placeholder:text-ink-muted"
                  />
                  {session?.lanHosts && session.lanHosts.length > 1 && (
                    <p className="text-[11px] text-ink-muted">
                      Detected: {session.lanHosts.join(', ')}
                    </p>
                  )}
                </label>
              )}
            </div>
          )}

          <ul className="list-disc space-y-1 pl-4 text-xs text-ink-muted">
            <li>Keep this page open on your computer while you shoot on your phone.</li>
            <li>
              {mode === 'grade'
                ? 'On your phone: capture the front, optionally the back, then tap Finish.'
                : 'On your phone: capture the card — it uploads automatically.'}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
