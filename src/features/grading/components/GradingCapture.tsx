import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Upload, ChevronRight, RefreshCw, RotateCcw, Check, Smartphone } from 'lucide-react';
import { PhoneCaptureQr } from '../../capture/components/PhoneCaptureQr';
import { compressImageDataUrl } from '../../../utils/imageCompress';

type Mode = 'idle' | 'upload' | 'camera' | 'phone';
type Step = 'front' | 'back';

interface GradingCaptureProps {
  onCapture: (frontImage: File | string, backImage?: File | string) => void;
  isProcessing?: boolean;
  disabled?: boolean;
}

/** Client-side blur / brightness gate using a downscaled canvas sample. */
async function assessClientQuality(src: string | File): Promise<string | null> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not load image'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    const maxSide = 320;
    const scale = maxSide / Math.max(img.width, img.height);
    canvas.width = Math.max(32, Math.round(img.width * scale));
    canvas.height = Math.max(32, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let sum = 0;
    let sumSq = 0;
    const gray = new Float32Array(width * height);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      gray[p] = g;
      sum += g;
      sumSq += g * g;
    }
    const n = gray.length;
    const mean = sum / n;
    const contrast = Math.sqrt(Math.max(0, sumSq / n - mean * mean));

    // Laplacian variance proxy
    let lap = 0;
    let count = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const v =
          -4 * gray[i] +
          gray[i - 1] +
          gray[i + 1] +
          gray[i - width] +
          gray[i + width];
        lap += v * v;
        count++;
      }
    }
    const sharpness = lap / Math.max(1, count);

    if (sharpness < 28) return 'Photo looks blurry. Hold steady, tap to focus, and retake.';
    if (mean < 40) return 'Photo is too dark. Use even lighting and avoid shadows.';
    if (mean > 245) return 'Photo is overexposed. Reduce glare or bright reflections.';
    if (contrast < 16) return 'Low contrast — place the card on a contrasting solid background.';
    return null;
  } finally {
    if (typeof src !== 'string') URL.revokeObjectURL(url);
  }
}

export const GradingCapture: React.FC<GradingCaptureProps> = ({
  onCapture,
  isProcessing = false,
  disabled = false,
}) => {
  const [mode, setMode] = useState<Mode>('idle');
  const [step, setStep] = useState<Step>('front');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [frontImage, setFrontImage] = useState<File | string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<File | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraActive(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
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

  const handleModeSelect = async (m: 'upload' | 'camera' | 'phone') => {
    setError(null);
    setMode(m);
    if (m === 'camera') await startCamera();
  };

  const acceptPhoneImages = async (front: string, back?: string) => {
    setChecking(true);
    setError(null);
    try {
      const frontNorm = await compressImageDataUrl(front, { maxSide: 2000, quality: 0.9 });
      const backNorm = back
        ? await compressImageDataUrl(back, { maxSide: 2000, quality: 0.9 })
        : undefined;

      const frontQuality = await assessClientQuality(frontNorm);
      if (frontQuality) {
        setError(frontQuality);
        setMode('idle');
        return;
      }
      if (backNorm) {
        const backQuality = await assessClientQuality(backNorm);
        if (backQuality) {
          setError(backQuality);
          setMode('idle');
          return;
        }
      }
      setFrontPreview(frontNorm);
      setFrontImage(frontNorm);
      if (backNorm) {
        setBackPreview(backNorm);
        setBackImage(backNorm);
        setStep('back');
      } else {
        setStep('front');
      }
      setMode('idle');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Phone photo could not be read. Retake and try again.'
      );
      setMode('idle');
    } finally {
      setChecking(false);
    }
  };

  const acceptImage = async (fileOrData: File | string) => {
    setChecking(true);
    setError(null);
    try {
      const qualityError = await assessClientQuality(fileOrData);
      if (qualityError) {
        setError(qualityError);
        return;
      }
      const preview =
        typeof fileOrData === 'string' ? fileOrData : URL.createObjectURL(fileOrData);
      if (step === 'front') {
        setFrontPreview(preview);
        setFrontImage(fileOrData);
      } else {
        setBackPreview(preview);
        setBackImage(fileOrData);
      }
      setMode('idle');
    } finally {
      setChecking(false);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (JPG, PNG, WebP).');
      return;
    }
    void acceptImage(file);
  };

  const captureFrame = () => {
    if (!videoRef.current || isProcessing || checking) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Canvas error');
      return;
    }
    ctx.drawImage(videoRef.current, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg', 0.97);
    stopCamera();
    void acceptImage(base64);
  };

  const handleNext = () => {
    if (step === 'front' && frontImage) {
      setStep('back');
      setMode('idle');
    }
  };

  const handleSubmit = () => {
    if (frontImage) {
      onCapture(frontImage, backImage || undefined);
    }
  };

  if (mode === 'phone') {
    const capturingBackOnly = step === 'back' && Boolean(frontImage);
    return (
      <div className="card-glass-scene space-y-3">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
        <PhoneCaptureQr
          mode={capturingBackOnly ? 'scan' : 'grade'}
          sideHint={capturingBackOnly ? 'back' : undefined}
          disabled={disabled || isProcessing || checking}
          onCancel={() => {
            setMode('idle');
            setError(null);
          }}
          onImages={(front, back) => {
            if (capturingBackOnly) {
              // Single-image session: treat the photo as the card back.
              void (async () => {
                try {
                  const normalized = await compressImageDataUrl(front, {
                    maxSide: 2000,
                    quality: 0.9,
                  });
                  await acceptImage(normalized);
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : 'Phone photo could not be read. Retake and try again.'
                  );
                  setMode('idle');
                }
              })();
              return;
            }
            void acceptPhoneImages(front, back);
          }}
        />
      </div>
    );
  }

  // Idle mode — show front/back status + capture buttons
  if (mode === 'idle' && !frontPreview) {
    return (
      <div className="card-glass-scene">
        <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-ink-muted">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent">
            1
          </span>
          Capture front of card
        </div>
        <p className="mb-4 text-sm text-ink-muted">
          Place the card flat on a solid contrasting background. Fill the frame, avoid glare,
          and keep the camera parallel to the card.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleModeSelect('camera')}
            className="group rounded-xl border border-border-default bg-surface-raised p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-elevated disabled:opacity-50"
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-accent/30 bg-accent/10">
              <Camera className="h-5 w-5 text-accent" />
            </div>
            <h3 className="mb-1 font-semibold text-ink-primary">Camera grade</h3>
            <p className="text-sm text-ink-muted">
              Photograph your card under even lighting for best centering accuracy.
            </p>
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-accent">
              <span>Open camera</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() => handleModeSelect('phone')}
            className="group rounded-xl border border-border-default bg-surface-raised p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-elevated disabled:opacity-50"
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-accent/30 bg-accent/10">
              <Smartphone className="h-5 w-5 text-accent" />
            </div>
            <h3 className="mb-1 font-semibold text-ink-primary">Phone camera</h3>
            <p className="text-sm text-ink-muted">
              Scan a QR code and capture a steadier front/back photo on your phone.
            </p>
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-accent">
              <span>Show QR code</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() => handleModeSelect('upload')}
            className="group rounded-xl border border-border-default bg-surface-raised p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-elevated disabled:opacity-50 sm:col-span-2 lg:col-span-1"
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-accent/30 bg-accent/10">
              <Upload className="h-5 w-5 text-accent" />
            </div>
            <h3 className="mb-1 font-semibold text-ink-primary">Upload photo</h3>
            <p className="text-sm text-ink-muted">
              Use a clear, front-facing scan or photo (JPEG, PNG, WebP).
            </p>
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-accent">
              <span>Choose file</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          </button>
        </div>
      </div>
    );
  }

  // Front captured — show preview + option to add back
  if (mode === 'idle' && frontPreview && step === 'front') {
    return (
      <div className="card-glass-scene">
        <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-ink-muted">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gain/20 text-[10px] font-bold text-gain">
            <Check className="h-3 w-3" />
          </span>
          Front captured
        </div>
        <div className="flex flex-col gap-4 sm:flex-row">
          <img
            src={frontPreview}
            alt="Front of card"
            className="mx-auto h-48 w-auto rounded-lg border border-border-subtle object-contain sm:mx-0"
          />
          <div className="flex flex-1 flex-col justify-center gap-2">
            <p className="text-xs text-ink-muted">
              Adding the back improves accuracy — PSA grades the whole card by the worst side.
            </p>
            <button type="button" onClick={handleNext} className="btn-primary">
              <Camera className="h-4 w-4" />
              Add back of card (recommended)
            </button>
            <button
              type="button"
              onClick={() => {
                setFrontPreview(null);
                setFrontImage(null);
              }}
              className="btn-secondary"
            >
              <RotateCcw className="h-4 w-4" />
              Retake front
            </button>
            <button type="button" onClick={handleSubmit} className="btn-secondary text-xs">
              Grade now (front only)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Back capture mode
  if (step === 'back') {
    if (mode === 'idle' && !backPreview) {
      return (
        <div className="card-glass-scene">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-ink-muted">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent">
              2
            </span>
            Capture back of card
          </div>
          <div className="mb-3 flex items-center gap-3">
            <img
              src={frontPreview!}
              alt="Front"
              className="h-16 w-auto rounded border border-border-subtle object-contain"
            />
            <div className="text-xs text-ink-muted">
              Front captured — now photograph the back for a combined grade
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              disabled={disabled}
              onClick={() => handleModeSelect('camera')}
              className="group rounded-xl border border-border-default bg-surface-raised p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-elevated disabled:opacity-50"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-accent/30 bg-accent/10">
                <Camera className="h-5 w-5 text-accent" />
              </div>
              <h3 className="mb-1 font-semibold text-ink-primary">Camera (back)</h3>
              <p className="text-sm text-ink-muted">Flip the card and photograph the back.</p>
            </button>

            <button
              type="button"
              disabled={disabled}
              onClick={() => handleModeSelect('phone')}
              className="group rounded-xl border border-border-default bg-surface-raised p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-elevated disabled:opacity-50"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-accent/30 bg-accent/10">
                <Smartphone className="h-5 w-5 text-accent" />
              </div>
              <h3 className="mb-1 font-semibold text-ink-primary">Phone (back)</h3>
              <p className="text-sm text-ink-muted">Scan a QR and capture the back on your phone.</p>
            </button>

            <button
              type="button"
              disabled={disabled}
              onClick={() => handleModeSelect('upload')}
              className="group rounded-xl border border-border-default bg-surface-raised p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-elevated disabled:opacity-50 sm:col-span-2 lg:col-span-1"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-accent/30 bg-accent/10">
                <Upload className="h-5 w-5 text-accent" />
              </div>
              <h3 className="mb-1 font-semibold text-ink-primary">Upload (back)</h3>
              <p className="text-sm text-ink-muted">Upload a photo of the back.</p>
            </button>
          </div>
          <div className="mt-3">
            <button type="button" onClick={handleSubmit} className="btn-secondary text-xs">
              Skip back — grade front only
            </button>
          </div>
        </div>
      );
    }

    if (mode === 'idle' && backPreview) {
      return (
        <div className="card-glass-scene">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-ink-muted">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gain/20 text-[10px] font-bold text-gain">
              <Check className="h-3 w-3" />
            </span>
            Both sides captured
          </div>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex gap-2">
              <img
                src={frontPreview!}
                alt="Front"
                className="h-32 w-auto rounded-lg border border-border-subtle object-contain"
              />
              <img
                src={backPreview}
                alt="Back"
                className="h-32 w-auto rounded-lg border border-border-subtle object-contain"
              />
            </div>
            <div className="flex flex-1 flex-col justify-center gap-2">
              <button type="button" onClick={handleSubmit} className="btn-primary">
                <Camera className="h-4 w-4" />
                Grade front + back
              </button>
              <button
                type="button"
                onClick={() => {
                  setBackPreview(null);
                  setBackImage(null);
                }}
                className="btn-secondary"
              >
                <RotateCcw className="h-4 w-4" />
                Retake back
              </button>
            </div>
          </div>
        </div>
      );
    }
  }

  // Camera / Upload active
  return (
    <div className="card-glass-scene">
      {error && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {mode === 'camera' && (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-lg bg-black aspect-[4/3]">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            {/* Card aspect overlay (~63:88) */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className="border-2 border-dashed border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                style={{ width: '42%', aspectRatio: '63 / 88', borderRadius: 6 }}
              />
            </div>
            <div className="absolute top-2 left-2 rounded bg-black/60 px-2 py-1 text-[10px] font-medium text-white">
              {step === 'front' ? 'FRONT' : 'BACK'} — align card inside guide
            </div>
            {!isCameraActive && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-muted">
                Starting camera…
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={captureFrame}
              disabled={!isCameraActive || isProcessing || checking}
              className="btn-primary"
            >
              <Camera className="h-4 w-4" />
              {checking ? 'Checking…' : `Capture ${step === 'front' ? 'front' : 'back'}`}
            </button>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setMode('idle');
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'upload' && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) processFile(file);
          }}
          className={`flex min-h-[220px] flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 transition-colors ${
            isDragging
              ? 'border-accent bg-accent/10'
              : 'border-border-default bg-surface-inset/40'
          }`}
        >
          <Upload className="mb-3 h-8 w-8 text-ink-muted" />
          <p className="mb-3 text-sm text-ink-muted">
            Drag & drop or choose {step === 'front' ? 'front' : 'back'} card photo
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing || checking}
              className="btn-primary"
            >
              {isProcessing || checking ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  {checking ? 'Checking…' : 'Analyzing…'}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Select image
                </>
              )}
            </button>
            <button type="button" onClick={() => setMode('idle')} className="btn-secondary">
              Cancel
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) processFile(file);
            }}
          />
        </div>
      )}
    </div>
  );
};
