import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Upload,
  X,
  AlertCircle,
  RefreshCw,
  Scan,
  ChevronRight,
  Smartphone,
} from 'lucide-react';
import {
  scanCardFromFile,
  scanCardFromBase64,
  checkBackendHealth,
  checkReferenceStatus,
  isReferenceDbError,
  ScanResult,
} from '../../../services/cardScannerApi';
import { ScanResultActions } from './ScanResultActions';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageShell';
import { CardArt } from '../../../components/exchange/CardArt';
import { Unavailable } from '../../../components/exchange/Price';
import { cn } from '@/lib/utils';
import { confidenceLabel } from '../confidence';
import { markOnboardingStep } from '../../../components/common/OnboardingChecklist';
import { PhoneCaptureQr } from '../../capture/components/PhoneCaptureQr';
import { compressImageDataUrl } from '../../../utils/imageCompress';

type Mode = 'idle' | 'upload' | 'camera' | 'phone';

function ScanResultSheet({ result }: { result: ScanResult }) {
  if (!result.success || !result.card) return null;
  const { name, set, number, confidence, id, image } = result.card;
  const conf = confidenceLabel(confidence);

  return (
    <section
      className="grid gap-4 border-t border-rule-strong pt-4 sm:grid-cols-[9rem_minmax(0,1fr)]"
      aria-live="polite"
      aria-label="Scan result"
    >
      <div className="w-32 sm:w-36">
        <CardArt card={{ name, images: image, number, set: { name: set } }} size="large" />
      </div>
      <div className="min-w-0">
        <h2 className="text-h2">{name}</h2>
        <p className="text-[13px] text-ink-secondary">
          {set}
          {number ? ` · ${number}` : ''}
          {id ? <span className="font-mono text-ink-muted"> · {id}</span> : null}
        </p>
        <p
          className={cn(
            'mt-2 text-[13px] font-medium',
            conf.tone === 'good' && 'text-gain',
            conf.tone === 'check' && 'text-warn',
            conf.tone === 'weak' && 'text-loss'
          )}
        >
          {conf.text}
        </p>
        <ScanResultActions result={result} />
        <p className="mt-3 text-[12.5px] text-ink-muted">
          Not the right card?{' '}
          <Link
            to={`/browse?q=${encodeURIComponent(name)}`}
            className="text-accent hover:underline"
          >
            Search the catalog for “{name}”
          </Link>
        </p>
      </div>
    </section>
  );
}

export function CardScanner() {
  const [mode, setMode] = useState<Mode>('idle');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [backendStatus, setBackendStatus] = useState<boolean | null>(null);
  const [referenceReady, setReferenceReady] = useState<boolean | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [retryProgress, setRetryProgress] = useState(0);

  useEffect(() => {
    checkBackendHealth().then(setBackendStatus);
  }, []);

  useEffect(() => {
    if (backendStatus !== true) {
      setReferenceReady(null);
      return;
    }
    let cancelled = false;
    checkReferenceStatus().then((status) => {
      if (cancelled) return;
      setReferenceReady(Boolean(status.ready));
      setReferenceError(status.ready ? null : (status.error ?? 'Reference database not built'));
    });
    return () => {
      cancelled = true;
    };
  }, [backendStatus]);

  useEffect(() => {
    if (backendStatus !== false) return;

    let attempts = 0;
    const maxAttempts = 12;
    const interval = setInterval(async () => {
      attempts += 1;
      setRetryProgress(Math.round((attempts / maxAttempts) * 100));
      const ok = await checkBackendHealth();
      if (ok) {
        setBackendStatus(true);
        clearInterval(interval);
      }
      if (attempts >= maxAttempts) clearInterval(interval);
    }, 3000);

    return () => clearInterval(interval);
  }, [backendStatus]);

  useEffect(() => () => stopCamera(), []);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraActive(false);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraActive(true);
        setError(null);
      }
    } catch {
      setError('Unable to access camera. Please allow camera permission and try again.');
    }
  };

  const reset = () => {
    stopCamera();
    setMode('idle');
    setScanResult(null);
    setError(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  const handleModeSelect = async (m: 'upload' | 'camera' | 'phone') => {
    setScanResult(null);
    setError(null);
    setMode(m);
    if (m === 'camera') await startCamera();
  };

  const applyScanFailure = useCallback((message: string) => {
    if (isReferenceDbError(message)) {
      setReferenceReady(false);
      setReferenceError(message);
      setError(null);
      return;
    }
    setError(message);
  }, []);

  const processBase64 = useCallback(
    async (base64: string) => {
      setIsScanning(true);
      setScanResult(null);
      setError(null);
      try {
        // Re-encode so phone relay payloads are valid JPEGs (avoids Pillow
        // "broken data stream when reading image file" on truncated frames).
        const normalized = await compressImageDataUrl(base64, { maxSide: 1600, quality: 0.88 });
        setPreviewUrl(normalized);
        const result = await scanCardFromBase64(normalized);
        setScanResult(result);
        if (result.success) markOnboardingStep('scan');
        if (!result.success) {
          applyScanFailure(result.message ?? result.error ?? 'Failed to identify card');
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Scan failed. Please try again.';
        if (isReferenceDbError(message)) {
          setReferenceReady(false);
          setReferenceError(message);
        } else if (/broken data stream|decode|corrupt|empty/i.test(message)) {
          setError('Photo was incomplete or corrupted. Retake with Phone camera and try again.');
        } else {
          setError(message);
        }
      } finally {
        setIsScanning(false);
      }
    },
    [applyScanFailure]
  );

  const processFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setError('Please upload an image file (JPG, PNG, WebP, etc.)');
        return;
      }
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setIsScanning(true);
      setScanResult(null);
      setError(null);

      try {
        const result = await scanCardFromFile(file);
        setScanResult(result);
        if (result.success) markOnboardingStep('scan');
        if (!result.success) {
          applyScanFailure(result.message ?? result.error ?? 'Failed to identify card');
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Scan failed. Please try again.';
        if (isReferenceDbError(message)) {
          setReferenceReady(false);
          setReferenceError(message);
        } else {
          setError(message);
        }
      } finally {
        setIsScanning(false);
      }
    },
    [applyScanFailure]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const captureAndScan = async () => {
    if (!videoRef.current || isScanning) return;
    setIsScanning(true);
    setError(null);
    setScanResult(null);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas error');
      ctx.drawImage(videoRef.current, 0, 0);
      const base64 = canvas.toDataURL('image/jpeg', 0.92);
      const result = await scanCardFromBase64(base64);
      setScanResult(result);
      if (result.success) markOnboardingStep('scan');
      if (!result.success) {
        const msg = result.message ?? result.error ?? 'No card detected';
        if (isReferenceDbError(msg)) {
          setReferenceReady(false);
          setReferenceError(msg);
        } else {
          setError(msg);
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Scan failed';
      if (isReferenceDbError(message)) {
        setReferenceReady(false);
        setReferenceError(message);
      } else {
        setError(message);
      }
    } finally {
      setIsScanning(false);
    }
  };

  const recheckBackend = () => {
    setBackendStatus(null);
    setReferenceReady(null);
    setReferenceError(null);
    checkBackendHealth().then(setBackendStatus);
  };

  const header = (status?: string) => (
    <PageHeader
      title="Scan a card"
      meta={status}
      description="Point your camera at a Pokémon card to identify it, then add it to your vault or wishlist."
      className="mb-6"
    />
  );

  if (backendStatus === false) {
    return (
      <div className="mx-auto max-w-3xl">
        {header('Recognition service offline')}
        <Unavailable
          title="The scanner can’t identify cards right now"
          action={
            <button type="button" onClick={recheckBackend} className="btn-secondary">
              <RefreshCw className="h-4 w-4" aria-hidden />
              Check again
            </button>
          }
        >
          The card recognition service isn’t running. It needs a separate image backend, which isn’t
          part of the hosted demo.
          {retryProgress < 100 ? ` Checking again automatically (${retryProgress}%).` : ''}
        </Unavailable>
        <details className="mt-4 max-w-md">
          <summary className="cursor-pointer text-[13px] font-medium text-ink-secondary hover:text-ink-primary">
            Running locally? Start the backend
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md border border-border-default bg-surface-inset p-3 font-mono text-[12px] text-ink-secondary">
            {'cd card-scanner-backend\npip install -r requirements.txt\npython app.py'}
          </pre>
        </details>
      </div>
    );
  }

  if (backendStatus === null || (backendStatus === true && referenceReady === null)) {
    return (
      <div className="mx-auto max-w-3xl">
        {header()}
        <p className="flex items-center gap-3 text-[13px] text-ink-muted" role="status">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-border-default border-t-accent motion-reduce:animate-none" />
          Connecting to the scanner…
        </p>
      </div>
    );
  }

  if (referenceReady === false) {
    return (
      <div className="mx-auto max-w-3xl">
        {header('Reference cards missing')}
        <Unavailable
          title="The scanner is online but has no reference cards to compare against"
          action={
            <button type="button" onClick={recheckBackend} className="btn-secondary">
              <RefreshCw className="h-4 w-4" aria-hidden />
              Check again
            </button>
          }
        >
          Recognition starts once the reference database is built.
          {referenceError ? ` (${referenceError})` : ''}
        </Unavailable>
        <details className="mt-4 max-w-md">
          <summary className="cursor-pointer text-[13px] font-medium text-ink-secondary hover:text-ink-primary">
            Build the reference database
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md border border-border-default bg-surface-inset p-3 font-mono text-[12px] text-ink-secondary">
            {
              'cd card-scanner-backend\npython build_reference.py   # 30–60 min, needs a pokemontcg.io key'
            }
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {header('Recognition service online')}

      {/* Camera first; the phone and upload routes sit beside it. */}
      {mode === 'idle' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => handleModeSelect('camera')}
            className="group flex w-full items-center gap-4 rounded-lg border border-border-strong bg-surface-raised p-5 text-left transition-colors hover:border-ink-muted"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-ink-primary text-surface-base">
              <Camera className="h-6 w-6" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-medium">Use this device’s camera</span>
              <span className="block text-[13px] text-ink-muted">
                Hold the card flat in good light and fill the frame.
              </span>
            </span>
            <ChevronRight className="h-5 w-5 text-ink-muted" aria-hidden />
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleModeSelect('phone')}
              className="btn-secondary"
            >
              <Smartphone className="h-4 w-4" aria-hidden />
              Use your phone instead
            </button>
            <button
              type="button"
              onClick={() => handleModeSelect('upload')}
              className="btn-secondary"
            >
              <Upload className="h-4 w-4" aria-hidden />
              Upload a photo
            </button>
          </div>
        </div>
      )}

      {mode === 'phone' && (
        <div className="space-y-4">
          {!scanResult && !isScanning && (
            <PhoneCaptureQr
              mode="scan"
              onCancel={reset}
              onImages={(front) => {
                void processBase64(front);
              }}
            />
          )}
          {isScanning && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border-default bg-surface-raised py-10">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Captured card"
                  className="mb-2 max-h-40 rounded-lg object-contain"
                />
              )}
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-border-default border-t-gain" />
              <p className="text-sm text-ink-muted">Analyzing card from phone…</p>
            </div>
          )}
          {error && <ErrorBanner message={error} />}
          {scanResult?.success && (
            <>
              <ScanResultSheet result={scanResult} />
              <button type="button" onClick={reset} className="btn-secondary w-full justify-center">
                <Scan className="h-4 w-4" />
                Scan another card
              </button>
            </>
          )}
        </div>
      )}

      {/* Camera mode */}
      {mode === 'camera' && (
        <div className="overflow-hidden rounded-lg border border-border-default bg-surface-raised">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-ink-muted" />
              <span className="text-[13.5px] font-medium">Camera</span>
              {isCameraActive && (
                <span className="flex items-center gap-1 text-xs text-gain">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gain" />
                  Live
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={reset}
              aria-label="Close and choose another way to scan"
              className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink-primary"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="relative aspect-[3/4] bg-black sm:aspect-video">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
            />
            {!isCameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-ink-muted">
                <Camera className="w-10 h-10 opacity-30" />
                <p className="text-sm">Starting camera…</p>
              </div>
            )}
            {isCameraActive && !isScanning && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-[68%] w-[42%] max-w-[220px] rounded-xl border-2 border-accent/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                  <span className="absolute -top-7 left-0 right-0 text-center text-[11.5px] font-medium text-accent">
                    Align card here
                  </span>
                  <span className="absolute -left-1 -top-1 h-4 w-4 border-l-2 border-t-2 border-accent" />
                  <span className="absolute -right-1 -top-1 h-4 w-4 border-r-2 border-t-2 border-accent" />
                  <span className="absolute -bottom-1 -left-1 h-4 w-4 border-b-2 border-l-2 border-accent" />
                  <span className="absolute -bottom-1 -right-1 h-4 w-4 border-b-2 border-r-2 border-accent" />
                </div>
              </div>
            )}
            {isScanning && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <p className="text-ink-primary text-sm font-medium">Scanning card…</p>
              </div>
            )}
          </div>

          <div className="p-4 space-y-3">
            <button
              onClick={captureAndScan}
              disabled={isScanning || !isCameraActive}
              className="btn-primary w-full justify-center py-2.5"
            >
              {isScanning ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Scanning…
                </>
              ) : (
                <>
                  <Scan className="w-4 h-4" />
                  Identify this card
                </>
              )}
            </button>

            {error && <ErrorBanner message={error} />}
            {scanResult?.success && <ScanResultSheet result={scanResult} />}
          </div>
        </div>
      )}

      {/* Upload mode */}
      {mode === 'upload' && (
        <div className="overflow-hidden rounded-lg border border-border-default bg-surface-raised">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-ink-muted" />
              <span className="text-[13.5px] font-medium">Upload a photo</span>
            </div>
            <button
              type="button"
              onClick={reset}
              aria-label="Close and choose another way to scan"
              className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink-primary"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Drop zone */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`relative cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
                isDragging
                  ? 'border-accent bg-accent/10'
                  : 'border-border-default hover:border-border-strong hover:bg-surface-inset'
              }`}
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Card preview"
                  className="max-h-48 mx-auto rounded-lg object-contain"
                />
              ) : (
                <>
                  <div className="w-10 h-10 bg-surface-hover rounded-lg flex items-center justify-center mx-auto mb-3">
                    <Upload className="w-5 h-5 text-ink-muted" />
                  </div>
                  <p className="text-sm font-medium text-ink-secondary mb-1">
                    Click to upload or drag & drop
                  </p>
                  <p className="text-xs text-ink-muted">JPG, PNG, WebP up to 10 MB</p>
                </>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            {previewUrl && !scanResult && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isScanning}
                className="btn-secondary w-full justify-center"
              >
                <Upload className="w-4 h-4" />
                Choose different image
              </button>
            )}

            {isScanning && (
              <div className="flex items-center justify-center gap-3 py-4">
                <div className="w-5 h-5 border-2 border-border-default border-t-gain rounded-full animate-spin" />
                <p className="text-sm text-ink-muted">Analyzing card…</p>
              </div>
            )}

            {error && <ErrorBanner message={error} />}

            {scanResult?.success && (
              <>
                <ScanResultSheet result={scanResult} />
                <button
                  onClick={() => {
                    setScanResult(null);
                    setError(null);
                    if (previewUrl) {
                      URL.revokeObjectURL(previewUrl);
                      setPreviewUrl(null);
                    }
                  }}
                  className="btn-secondary w-full justify-center"
                >
                  <Scan className="w-4 h-4" />
                  Scan another card
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-loss/30 bg-loss/10 p-3"
      role="alert"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-loss" />
      <p className="text-[13px] text-ink-primary">{message}</p>
    </div>
  );
}
