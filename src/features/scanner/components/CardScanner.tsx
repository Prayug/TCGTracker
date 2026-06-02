import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera, Upload, X, AlertCircle, CheckCircle, RefreshCw, Scan,
  ChevronRight
} from 'lucide-react';
import { scanCardFromFile, scanCardFromBase64, checkBackendHealth, ScanResult } from '../../../services/cardScannerApi';

type Mode = 'idle' | 'upload' | 'camera';

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : pct >= 50 ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-red-700 bg-red-50 border-red-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-semibold ${color}`}>
      {pct}% confidence
    </span>
  );
}

function ResultCard({ result }: { result: ScanResult }) {
  if (!result.success || !result.card) return null;
  const { name, set, number, confidence, id } = result.card;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 animate-fade-in">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-center flex-shrink-0">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
        </div>
        <div>
          <p className="font-semibold text-slate-900">Card Identified</p>
          <ConfidenceBadge value={confidence} />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <dt className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-0.5">Name</dt>
          <dd className="text-sm font-semibold text-slate-900">{name}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-0.5">Set</dt>
          <dd className="text-sm font-semibold text-slate-900">{set}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-0.5">Number</dt>
          <dd className="text-sm font-semibold text-slate-900">{number || '—'}</dd>
        </div>
        {id && (
          <div>
            <dt className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-0.5">ID</dt>
            <dd className="text-sm font-mono text-slate-700">{id}</dd>
          </div>
        )}
      </dl>
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
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10">
            <Camera className="h-10 w-10 text-amber-300/80" />
          </div>
          <h2 className="text-xl font-semibold text-white">Scanner warming up…</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            We&apos;re trying to reach the recognition service on port 5001. Start the Python backend
            locally, or wait — we&apos;ll retry automatically.
          </p>

          <div className="mx-auto mt-6 max-w-xs">
            <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-slate-500">
              <span>Auto-retry</span>
              <span>{retryProgress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-500/70 transition-all duration-500"
                style={{ width: `${retryProgress}%` }}
              />
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-white/10 bg-black/40 p-4 text-left font-mono text-xs">
            <p className="mb-2 text-slate-500"># Start the scanner backend</p>
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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-emerald-400" />
        <span className="ml-3 text-sm text-slate-400">Connecting to scanner…</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2">
          <Scan className="h-5 w-5 text-emerald-400" />
          <h1 className="text-xl font-bold text-white">Card scanner</h1>
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
            <span className="live-pulse-dot scale-75" />
            Online
          </span>
        </div>
        <p className="text-sm text-slate-400">
          Identify any Pokémon card by uploading a photo or using your camera.
        </p>
      </div>

      {/* Mode selection */}
      {mode === 'idle' && (
        <div className="grid sm:grid-cols-2 gap-4 animate-fade-in">
          <button
            onClick={() => handleModeSelect('camera')}
            className="group bg-white border border-slate-200 hover:border-blue-300 hover:shadow-card-hover
                       rounded-xl p-6 text-left transition-all duration-200"
          >
            <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-center mb-4
                            group-hover:bg-blue-100 transition-colors">
              <Camera className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-1">Camera Scan</h3>
            <p className="text-sm text-slate-500">Use your device camera to scan a physical card in real-time.</p>
            <div className="flex items-center gap-1 mt-3 text-xs text-blue-600 font-medium">
              <span>Open camera</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </button>

          <button
            onClick={() => handleModeSelect('upload')}
            className="group bg-white border border-slate-200 hover:border-blue-300 hover:shadow-card-hover
                       rounded-xl p-6 text-left transition-all duration-200"
          >
            <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-center mb-4
                            group-hover:bg-blue-100 transition-colors">
              <Upload className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-1">Upload Image</h3>
            <p className="text-sm text-slate-500">Upload a photo of your card from your device or drag & drop.</p>
            <div className="flex items-center gap-1 mt-3 text-xs text-blue-600 font-medium">
              <span>Choose file</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </button>
        </div>
      )}

      {/* Camera mode */}
      {mode === 'camera' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-slate-600" />
              <span className="text-sm font-medium text-slate-900">Camera Scanner</span>
              {isCameraActive && (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <button onClick={reset} className="btn-ghost p-1.5">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative bg-slate-900 aspect-video">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
            />
            {!isCameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400">
                <Camera className="w-10 h-10 opacity-30" />
                <p className="text-sm">Starting camera…</p>
              </div>
            )}
            {isCameraActive && !isScanning && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-[68%] w-[42%] max-w-[220px] rounded-xl border-2 border-emerald-400/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                  <span className="absolute -top-7 left-0 right-0 text-center text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                    Align card here
                  </span>
                  <span className="absolute -left-1 -top-1 h-4 w-4 border-l-2 border-t-2 border-emerald-400" />
                  <span className="absolute -right-1 -top-1 h-4 w-4 border-r-2 border-t-2 border-emerald-400" />
                  <span className="absolute -bottom-1 -left-1 h-4 w-4 border-b-2 border-l-2 border-emerald-400" />
                  <span className="absolute -bottom-1 -right-1 h-4 w-4 border-b-2 border-r-2 border-emerald-400" />
                </div>
              </div>
            )}
            {isScanning && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <p className="text-white text-sm font-medium">Scanning card…</p>
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
            {scanResult?.success && <ResultCard result={scanResult} />}
          </div>
        </div>
      )}

      {/* Upload mode */}
      {mode === 'upload' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-slate-600" />
              <span className="text-sm font-medium text-slate-900">Upload Image</span>
            </div>
            <button onClick={reset} className="btn-ghost p-1.5">
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
              className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
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
                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <Upload className="w-5 h-5 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-700 mb-1">
                    Click to upload or drag & drop
                  </p>
                  <p className="text-xs text-slate-400">JPG, PNG, WebP up to 10 MB</p>
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
                <div className="w-5 h-5 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-sm text-slate-500">Analyzing card…</p>
              </div>
            )}

            {error && <ErrorBanner message={error} />}

            {scanResult?.success && (
              <>
                <ResultCard result={scanResult} />
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
    <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-red-700">{message}</p>
    </div>
  );
}
