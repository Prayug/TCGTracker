import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera, Upload, X, AlertCircle, CheckCircle, RefreshCw, Scan,
  ChevronRight
} from 'lucide-react';
import { scanCardFromFile, scanCardFromBase64, checkBackendHealth, ScanResult } from '../../../services/cardScannerApi';
import { ScanResultActions } from './ScanResultActions';
import { markOnboardingStep } from '../../../components/common/OnboardingChecklist';
import { SectionLabel } from '../../../components/common/SectionLabel';

type Mode = 'idle' | 'upload' | 'camera';

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80
      ? 'text-gain bg-gain/10 border-gain/30'
      : pct >= 50
        ? 'text-amber-300 bg-amber-500/10 border-amber-500/30'
        : 'text-loss bg-loss/10 border-loss/30';
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums ${color}`}>
      {pct}% match
    </span>
  );
}

function ScanResultSheet({ result }: { result: ScanResult }) {
  if (!result.success || !result.card) return null;
  const { name, set, number, confidence, id } = result.card;

  return (
    <div
      className="rounded-xl border border-border-strong bg-surface-overlay p-5 shadow-sm animate-slide-up"
      role="region"
      aria-live="polite"
      aria-label="Scan result"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gain/30 bg-gain/10">
            <CheckCircle className="h-4 w-4 text-gain" aria-hidden="true" />
          </div>
          <div>
            <p className="font-semibold text-ink-primary">Card identified</p>
            <p className="mt-0.5 text-xs text-ink-muted">Recognition complete</p>
          </div>
        </div>
        <ConfidenceBadge value={confidence} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-border-subtle bg-surface-inset p-3">
        <div>
          <dt className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-muted">Name</dt>
          <dd className="text-sm font-semibold text-ink-primary">{name}</dd>
        </div>
        <div>
          <dt className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-muted">Set</dt>
          <dd className="text-sm font-semibold text-ink-primary">{set}</dd>
        </div>
        <div>
          <dt className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-muted">Number</dt>
          <dd className="text-sm font-semibold tabular-nums text-ink-primary">{number || '—'}</dd>
        </div>
        {id && (
          <div>
            <dt className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-muted">ID</dt>
            <dd className="truncate text-sm font-mono text-ink-secondary">{id}</dd>
          </div>
        )}
      </dl>
      <ScanResultActions result={result} />
    </div>
  );
}

export function CardScanner() {
  const [mode, setMode] = useState<Mode>('idle');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [backendStatus, setBackendStatus] = useState<boolean | null>(null);
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
    streamRef.current?.getTracks().forEach(t => t.stop());
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

  const handleModeSelect = async (m: 'upload' | 'camera') => {
    setScanResult(null);
    setError(null);
    setMode(m);
    if (m === 'camera') await startCamera();
  };

  const processFile = useCallback(async (file: File) => {
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
      if (!result.success) setError(result.message ?? result.error ?? 'Failed to identify card');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed. Please try again.');
    } finally {
      setIsScanning(false);
    }
  }, []);

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
      if (!result.success) setError(result.message ?? result.error ?? 'No card detected');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setIsScanning(false);
    }
  };

  const recheckBackend = () => {
    setBackendStatus(null);
    checkBackendHealth().then(setBackendStatus);
  };

  if (backendStatus === false) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-xl border border-border-default bg-surface-raised p-8 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10">
            <Camera className="h-10 w-10 text-amber-300/80" />
          </div>
          <h2 className="text-xl font-semibold text-ink-primary">Scanner warming up…</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
            We&apos;re trying to reach the recognition service on port 5001. Start the Python backend
            locally, or wait — we&apos;ll retry automatically.
          </p>

          <div className="mx-auto mt-6 max-w-xs">
            <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-ink-muted">
              <span>Auto-retry</span>
              <span>{retryProgress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-accent/70 transition-all duration-500"
                style={{ width: `${retryProgress}%` }}
              />
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-border-subtle bg-black/40 p-4 text-left font-mono text-xs">
            <p className="mb-2 text-ink-muted"># Start the scanner backend</p>
            <p className="text-emerald-400">cd card-scanner-backend</p>
            <p className="text-emerald-400">pip install -r requirements.txt</p>
            <p className="text-emerald-400">python app.py</p>
          </div>

          <button type="button" onClick={recheckBackend} className="btn-primary mt-6">
            <RefreshCw className="h-4 w-4" />
            Retry now
          </button>
        </div>
      </div>
    );
  }

  if (backendStatus === null) {
    return (
      <div className="mx-auto flex max-w-2xl items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border-default border-t-accent" />
        <span className="ml-3 text-sm text-ink-muted">Connecting to scanner…</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <SectionLabel className="text-accent/90">Scanner</SectionLabel>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-h2 text-ink-primary">Card scanner</h1>
          <span className="inline-flex items-center gap-1 rounded-full border border-gain/30 bg-gain-muted px-2 py-0.5 text-[10px] font-medium text-gain">
            Online
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          Identify any Pokémon card by uploading a photo or using your camera.
        </p>
      </div>

      {/* Mode selection */}
      {mode === 'idle' && (
        <div className="grid animate-fade-in gap-4 sm:grid-cols-2">
          <button
            onClick={() => handleModeSelect('camera')}
            className="group rounded-xl border border-border-default bg-surface-raised p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-border-strong"
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 transition-colors group-hover:bg-accent-hover/20">
              <Camera className="h-5 w-5 text-accent" />
            </div>
            <h3 className="mb-1 font-semibold text-ink-primary">Camera scan</h3>
            <p className="text-sm text-ink-muted">Use your device camera to scan a physical card in real time.</p>
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-accent">
              <span>Open camera</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          </button>

          <button
            onClick={() => handleModeSelect('upload')}
            className="group rounded-xl border border-border-default bg-surface-raised p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-border-strong"
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 transition-colors group-hover:bg-accent-hover/20">
              <Upload className="h-5 w-5 text-accent" />
            </div>
            <h3 className="mb-1 font-semibold text-ink-primary">Upload image</h3>
            <p className="text-sm text-ink-muted">Upload a photo from your device or drag and drop.</p>
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-accent">
              <span>Choose file</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          </button>
        </div>
      )}

      {/* Camera mode */}
      {mode === 'camera' && (
        <div className="animate-fade-in overflow-hidden rounded-xl border border-border-default bg-surface-raised shadow-sm">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-ink-muted" />
              <span className="text-sm font-medium text-ink-primary">Camera Scanner</span>
              {isCameraActive && (
                <span className="flex items-center gap-1 text-xs text-gain">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gain" />
                  Live
                </span>
              )}
            </div>
            <button onClick={reset} className="p-1.5 text-ink-muted hover:text-ink-primary">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative bg-black/60 aspect-video">
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
                  <span className="absolute -top-7 left-0 right-0 text-center text-[10px] font-semibold uppercase tracking-wider text-accent">
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
                  Capture & Identify
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
        <div className="animate-fade-in overflow-hidden rounded-xl border border-border-default bg-surface-raised shadow-sm">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-ink-muted" />
              <span className="text-sm font-medium text-ink-primary">Upload Image</span>
            </div>
            <button onClick={reset} className="p-1.5 text-ink-muted hover:text-ink-primary">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Drop zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
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
                <div className="w-5 h-5 border-2 border-border-default border-t-emerald-400 rounded-full animate-spin" />
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
      <p className="text-sm text-red-200">{message}</p>
    </div>
  );
}
