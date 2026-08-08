import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Camera, Check, Loader2, RefreshCw, Upload } from 'lucide-react';
import {
  CaptureMode,
  CaptureSessionInfo,
  CaptureSide,
  completeCaptureSession,
  getCaptureSession,
  uploadCaptureImage,
} from '../../../services/captureSessionApi';
import { compressImageDataUrl } from '../../../utils/imageCompress';

type Phase = 'loading' | 'camera' | 'preview' | 'uploading' | 'done' | 'error';

export function PhoneCapturePage() {
  const { sessionId = '' } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const sideHint = searchParams.get('side') === 'back' ? 'back' : 'front';
  const [session, setSession] = useState<CaptureSessionInfo | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [side, setSide] = useState<CaptureSide>('front');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [displaySide, setDisplaySide] = useState<CaptureSide>(sideHint);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          // Keep captures manageable for the desktop relay (4K JPEGs were truncating).
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraActive(true);
        setError(null);
      }
    } catch {
      setError('Camera permission denied. You can still upload a photo from your library.');
      setIsCameraActive(false);
    }
  }, [stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await getCaptureSession(sessionId);
        if (cancelled) return;
        if (info.status === 'consumed' || info.status === 'expired') {
          setError('This capture link has already been used or expired.');
          setPhase('error');
          return;
        }
        if (info.status === 'ready') {
          setSession(info);
          setPhase('done');
          return;
        }
        setSession(info);
        const nextSide: CaptureSide = info.hasFront ? 'back' : 'front';
        setSide(nextSide);
        setDisplaySide(info.mode === 'scan' && sideHint === 'back' ? 'back' : nextSide);
        setPhase('camera');
        await startCamera();
      } catch {
        if (!cancelled) {
          setError('Capture session not found or expired. Generate a new QR on your computer.');
          setPhase('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, startCamera]);

  const captureFrame = () => {
    if (!videoRef.current || !isCameraActive) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Could not capture frame');
      return;
    }
    ctx.drawImage(videoRef.current, 0, 0);
    const quality = session?.mode === 'grade' ? 0.9 : 0.85;
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    stopCamera();
    void compressImageDataUrl(dataUrl, {
      maxSide: session?.mode === 'grade' ? 2000 : 1600,
      quality: session?.mode === 'grade' ? 0.9 : 0.85,
    })
      .then((compressed) => {
        setPreview(compressed);
        setPhase('preview');
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Could not process photo');
        setPhase('camera');
        void startCamera();
      });
  };

  const acceptFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please choose a JPEG, PNG, or WebP image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      stopCamera();
      void compressImageDataUrl(String(reader.result), {
        maxSide: session?.mode === 'grade' ? 2000 : 1600,
        quality: session?.mode === 'grade' ? 0.9 : 0.85,
      })
        .then((compressed) => {
          setPreview(compressed);
          setPhase('preview');
          setError(null);
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : 'Could not process photo');
        });
    };
    reader.onerror = () => setError('Failed to read image');
    reader.readAsDataURL(file);
  };

  const sendImage = async () => {
    if (!preview || !session) return;
    setPhase('uploading');
    setError(null);
    try {
      const updated = await uploadCaptureImage(session.id, preview, side);
      setSession(updated);

      if (session.mode === 'scan' || updated.status === 'ready') {
        setPhase('done');
        stopCamera();
        return;
      }

      // Grade mode: offer back after front
      if (side === 'front' && !updated.hasBack) {
        setPreview(null);
        setSide('back');
        setDisplaySide('back');
        setPhase('camera');
        await startCamera();
        return;
      }

      await completeCaptureSession(session.id);
      setPhase('done');
      stopCamera();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
      setPhase('preview');
    }
  };

  const finishWithoutBack = async () => {
    if (!session) return;
    setPhase('uploading');
    try {
      await completeCaptureSession(session.id);
      setPhase('done');
      stopCamera();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish session');
      setPhase('camera');
    }
  };

  const modeLabel = (session?.mode || 'scan') as CaptureMode;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col bg-surface-base px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-ink-primary">
      <header className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foil">
          Phone capture
        </p>
        <h1 className="font-display text-2xl text-ink-primary">
          {modeLabel === 'grade' ? 'Grade with phone' : 'Scan with phone'}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {displaySide === 'front'
            ? 'Photograph the front of the card.'
            : 'Photograph the back of the card.'}
        </p>
      </header>

      {error && (
        <div className="mb-3 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {phase === 'loading' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-ink-muted">
          <Loader2 className="h-7 w-7 animate-spin" />
          <p className="text-sm">Opening capture session…</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm text-ink-secondary">Generate a new QR code on your computer.</p>
        </div>
      )}

      {phase === 'done' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-gain/30 bg-gain/10">
            <Check className="h-7 w-7 text-gain" />
          </div>
          <p className="text-lg font-semibold text-ink-primary">Sent to your computer</p>
          <p className="max-w-xs text-sm text-ink-muted">
            You can close this tab. The desktop app should pick up the photo automatically.
          </p>
        </div>
      )}

      {(phase === 'camera' || phase === 'uploading') && (
        <div className="flex flex-1 flex-col gap-3">
          <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className="border-2 border-dashed border-white/75 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                style={{ width: '58%', aspectRatio: '63 / 88', borderRadius: 8 }}
              />
            </div>
            <div className="absolute left-3 top-3 rounded-md bg-black/65 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
              {displaySide}
            </div>
            {!isCameraActive && phase === 'camera' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white/80">
                Starting camera…
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={captureFrame}
              disabled={!isCameraActive || phase === 'uploading'}
              className="btn-primary justify-center py-3"
            >
              <Camera className="h-4 w-4" />
              Capture
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={phase === 'uploading'}
              className="btn-secondary justify-center py-3"
            >
              <Upload className="h-4 w-4" />
              Library
            </button>
          </div>

          {side === 'back' && session?.hasFront && (
            <button
              type="button"
              onClick={() => void finishWithoutBack()}
              disabled={phase === 'uploading'}
              className="btn-secondary justify-center text-xs"
            >
              Skip back — send front only
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) acceptFile(file);
            }}
          />
        </div>
      )}

      {phase === 'preview' && preview && (
        <div className="flex flex-1 flex-col gap-3">
          <img
            src={preview}
            alt={`${side} preview`}
            className="mx-auto max-h-[55dvh] w-auto rounded-2xl border border-border-subtle object-contain"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setPhase('camera');
                void startCamera();
              }}
              className="btn-secondary justify-center py-3"
            >
              <RefreshCw className="h-4 w-4" />
              Retake
            </button>
            <button
              type="button"
              onClick={() => void sendImage()}
              className="btn-primary justify-center py-3"
            >
              <Check className="h-4 w-4" />
              Use photo
            </button>
          </div>
        </div>
      )}

      {phase === 'uploading' && (
        <div className="fixed inset-x-0 bottom-8 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border-default bg-surface-raised px-4 py-2 text-sm shadow-elevated">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            Sending to computer…
          </div>
        </div>
      )}
    </div>
  );
}
