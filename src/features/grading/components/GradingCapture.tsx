import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Upload, RotateCcw, Check, Smartphone } from 'lucide-react';
import { PhoneCaptureQr } from '../../capture/components/PhoneCaptureQr';
import { compressImageDataUrl } from '../../../utils/imageCompress';
import { assessClientQuality } from '../captureQuality';
import { GradeCapturePayload } from '../scanProtocol';

type Mode = 'idle' | 'camera' | 'phone';
type Step = 'front' | 'back';

interface GradingCaptureProps {
  onCapture: (payload: GradeCapturePayload) => void;
  isProcessing?: boolean;
  disabled?: boolean;
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

  const busy = disabled || isProcessing || checking;

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

  const handleModeSelect = async (m: 'camera' | 'phone') => {
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
        e instanceof Error ? e.message : 'Phone photo could not be read. Retake and try again.'
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
      const preview = typeof fileOrData === 'string' ? fileOrData : URL.createObjectURL(fileOrData);
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
      onCapture({
        mode: 'quick',
        front: frontImage,
        back: backImage || undefined,
      });
    }
  };

  const retakeFront = () => {
    setFrontPreview(null);
    setFrontImage(null);
    setBackPreview(null);
    setBackImage(null);
    setStep('front');
    setMode('idle');
    setError(null);
  };

  const retakeBack = () => {
    setBackPreview(null);
    setBackImage(null);
    setStep('back');
    setMode('idle');
    setError(null);
  };

  if (mode === 'phone') {
    const capturingBackOnly = step === 'back' && Boolean(frontImage);
    return (
      <CaptureShell>
        <StepRail step={step} frontDone={Boolean(frontPreview)} backDone={Boolean(backPreview)} />
        {error && <ErrorBanner message={error} />}
        <PhoneCaptureQr
          mode={capturingBackOnly ? 'scan' : 'grade'}
          sideHint={capturingBackOnly ? 'back' : undefined}
          disabled={busy}
          onCancel={() => {
            setMode('idle');
            setError(null);
          }}
          onImages={(front, back) => {
            if (capturingBackOnly) {
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
      </CaptureShell>
    );
  }

  if (mode === 'camera') {
    return (
      <CaptureShell>
        <StepRail step={step} frontDone={Boolean(frontPreview)} backDone={Boolean(backPreview)} />
        {error && <ErrorBanner message={error} />}
        <div className="space-y-3">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className="border-2 border-dashed border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                style={{ width: '42%', aspectRatio: '63 / 88', borderRadius: 6 }}
              />
            </div>
            <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-xs font-medium text-white">
              {step === 'front' ? 'Front' : 'Back'} — align the card inside the guide
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
              disabled={!isCameraActive || busy}
              className="btn-primary"
            >
              <Camera className="h-4 w-4" />
              {checking ? 'Checking…' : `Capture ${step}`}
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
      </CaptureShell>
    );
  }

  if (frontPreview && step === 'front') {
    return (
      <CaptureShell>
        <StepRail step="front" frontDone backDone={false} />
        {error && <ErrorBanner message={error} />}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <img
            src={frontPreview}
            alt="Front of card"
            className="mx-auto h-52 w-auto rounded-lg border border-border-subtle object-contain sm:mx-0"
          />
          <div className="flex flex-1 flex-col justify-center gap-3">
            <div>
              <h2 className="font-display text-h3 text-ink-primary">
                Front is in. Photograph the back.
              </h2>
              <p className="mt-1 text-sm text-ink-secondary">
                Same distance and lighting, card flipped. Both sides are required for a PSA number.
              </p>
            </div>
            <button type="button" onClick={handleNext} className="btn-primary self-start">
              <Camera className="h-4 w-4" />
              Add back of card
            </button>
            <button type="button" onClick={retakeFront} className="btn-secondary self-start">
              <RotateCcw className="h-4 w-4" />
              Retake front
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="self-start text-sm text-ink-muted hover:text-ink-primary"
            >
              Grade without back — listing condition only
            </button>
          </div>
        </div>
      </CaptureShell>
    );
  }

  if (step === 'back' && backPreview) {
    return (
      <CaptureShell>
        <StepRail step="back" frontDone backDone />
        {error && <ErrorBanner message={error} />}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex justify-center gap-2 sm:justify-start">
            <img
              src={frontPreview!}
              alt="Front"
              className="h-40 w-auto rounded-lg border border-border-subtle object-contain"
            />
            <img
              src={backPreview}
              alt="Back"
              className="h-40 w-auto rounded-lg border border-border-subtle object-contain"
            />
          </div>
          <div className="flex flex-1 flex-col justify-center gap-3">
            <div>
              <h2 className="font-display text-h3 text-ink-primary">Both sides captured</h2>
              <p className="mt-1 text-sm text-ink-secondary">
                We’ll return a predicted PSA number from these two photos.
              </p>
            </div>
            <button type="button" onClick={handleSubmit} className="btn-primary self-start">
              Get PSA estimate
            </button>
            <button type="button" onClick={retakeBack} className="btn-secondary self-start">
              <RotateCcw className="h-4 w-4" />
              Retake back
            </button>
          </div>
        </div>
      </CaptureShell>
    );
  }

  const askingBack = step === 'back';

  return (
    <CaptureShell>
      <StepRail
        step={askingBack ? 'back' : 'front'}
        frontDone={Boolean(frontPreview)}
        backDone={false}
      />
      {error && <ErrorBanner message={error} />}

      {askingBack && frontPreview && (
        <div className="mb-4 flex items-center gap-3">
          <img
            src={frontPreview}
            alt="Front"
            className="h-16 w-auto rounded border border-border-subtle object-contain"
          />
          <p className="text-sm text-ink-secondary">
            Front locked. Flip the card and match the same frame.
          </p>
        </div>
      )}

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
        className={`relative overflow-hidden rounded-xl border transition-colors ${
          isDragging ? 'border-accent bg-accent/10' : 'border-border-default bg-surface-inset/50'
        }`}
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        <div className="flex min-h-[280px] flex-col items-center justify-center px-5 py-10 text-center">
          <div
            className="mb-5 border border-dashed border-border-strong bg-surface-base/80"
            style={{ width: 92, aspectRatio: '63 / 88', borderRadius: 8 }}
            aria-hidden
          />
          <h2 className="font-display text-h3 text-ink-primary">
            {askingBack ? 'Photograph the back' : 'Photograph the front'}
          </h2>
          <p className="mt-1 max-w-md text-sm text-ink-secondary">
            {checking
              ? 'Checking photo quality…'
              : askingBack
                ? 'Same distance and lighting as the front. Pokémon backs glare easily — tilt slightly if you see a hot spot.'
                : 'Unsleeved, dark mat, fill the frame, camera parallel. Drop a photo here or capture one below.'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleModeSelect('camera')}
          className="btn-primary"
        >
          <Camera className="h-4 w-4" />
          Open camera
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleModeSelect('phone')}
          className="btn-secondary"
        >
          <Smartphone className="h-4 w-4" />
          Use phone
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setError(null);
            fileInputRef.current?.click();
          }}
          className="btn-secondary"
        >
          <Upload className="h-4 w-4" />
          Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) processFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {askingBack && (
        <button
          type="button"
          onClick={handleSubmit}
          className="mt-3 text-sm text-ink-muted hover:text-ink-primary"
        >
          Grade without back — listing condition only
        </button>
      )}
    </CaptureShell>
  );
};

function CaptureShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-raised p-5 sm:p-6">
      {children}
    </div>
  );
}

function StepRail({
  step,
  frontDone,
  backDone,
}: {
  step: Step;
  frontDone: boolean;
  backDone: boolean;
}) {
  return (
    <ol className="mb-5 flex items-center gap-3 text-sm">
      <li className="flex items-center gap-2">
        <StepMark done={frontDone} current={step === 'front' && !frontDone} />
        <span className={frontDone || step === 'front' ? 'text-ink-primary' : 'text-ink-muted'}>
          Front
        </span>
      </li>
      <li className="h-px flex-1 bg-border-default" aria-hidden />
      <li className="flex items-center gap-2">
        <StepMark done={backDone} current={step === 'back' && !backDone} />
        <span className={backDone || step === 'back' ? 'text-ink-primary' : 'text-ink-muted'}>
          Back
        </span>
      </li>
    </ol>
  );
}

function StepMark({ done, current }: { done: boolean; current: boolean }) {
  if (done) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gain/20 text-gain">
        <Check className="h-3 w-3" />
      </span>
    );
  }
  return (
    <span
      className={`h-5 w-5 rounded-full border ${
        current ? 'border-accent bg-accent/20' : 'border-border-strong bg-transparent'
      }`}
    />
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
      {message}
    </div>
  );
}
