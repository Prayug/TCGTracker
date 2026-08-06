import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

export type CaptureMode = 'scan' | 'grade';
export type CaptureSide = 'front' | 'back';
export type CaptureSessionStatus = 'waiting' | 'partial' | 'ready' | 'consumed' | 'expired';

export interface CaptureSession {
  id: string;
  mode: CaptureMode;
  status: CaptureSessionStatus;
  frontImage?: string;
  backImage?: string;
  createdAt: number;
  expiresAt: number;
  completedAt?: number;
  consumedAt?: number;
}

type SessionMeta = Omit<CaptureSession, 'frontImage' | 'backImage'> & {
  hasFront: boolean;
  hasBack: boolean;
};

const SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_SESSIONS = 200;
const MAX_IMAGE_CHARS = 12_000_000;
const STORE_DIR = path.join(os.tmpdir(), 'tcgtracker-capture-sessions');

const sessions = new Map<string, CaptureSession>();

function ensureStoreDir(): void {
  try {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

function metaPath(id: string): string {
  return path.join(STORE_DIR, `${id}.json`);
}

function imagePath(id: string, side: CaptureSide): string {
  return path.join(STORE_DIR, `${id}-${side}.jpg`);
}

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/s.exec(dataUrl);
  if (!match?.[1]) return null;
  try {
    return Buffer.from(match[1], 'base64');
  } catch {
    return null;
  }
}

function bufferToJpegDataUrl(buf: Buffer): string {
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

function writeImageFile(id: string, side: CaptureSide, dataUrl: string): boolean {
  const buf = dataUrlToBuffer(dataUrl);
  if (!buf || buf.length < 32) return false;
  ensureStoreDir();
  fs.writeFileSync(imagePath(id, side), buf);
  return true;
}

function readImageFile(id: string, side: CaptureSide): string | undefined {
  try {
    const buf = fs.readFileSync(imagePath(id, side));
    if (buf.length < 32) return undefined;
    return bufferToJpegDataUrl(buf);
  } catch {
    return undefined;
  }
}

function deleteImageFiles(id: string): void {
  for (const side of ['front', 'back'] as CaptureSide[]) {
    try {
      fs.unlinkSync(imagePath(id, side));
    } catch {
      // ignore
    }
  }
}

function persistMeta(session: CaptureSession): void {
  try {
    ensureStoreDir();
    const meta: SessionMeta = {
      id: session.id,
      mode: session.mode,
      status: session.status,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      completedAt: session.completedAt,
      consumedAt: session.consumedAt,
      hasFront: Boolean(session.frontImage) || fs.existsSync(imagePath(session.id, 'front')),
      hasBack: Boolean(session.backImage) || fs.existsSync(imagePath(session.id, 'back')),
    };
    fs.writeFileSync(metaPath(session.id), JSON.stringify(meta), 'utf8');
  } catch {
    // Best-effort disk mirror.
  }
}

function deletePersistedSession(id: string): void {
  try {
    fs.unlinkSync(metaPath(id));
  } catch {
    // ignore
  }
  deleteImageFiles(id);
}

function loadPersistedSession(id: string): CaptureSession | null {
  try {
    const raw = fs.readFileSync(metaPath(id), 'utf8');
    const meta = JSON.parse(raw) as SessionMeta;
    if (!meta?.id || meta.id !== id) return null;
    const session: CaptureSession = {
      id: meta.id,
      mode: meta.mode,
      status: meta.status,
      createdAt: meta.createdAt,
      expiresAt: meta.expiresAt,
      completedAt: meta.completedAt,
      consumedAt: meta.consumedAt,
      frontImage: meta.hasFront ? readImageFile(id, 'front') : undefined,
      backImage: meta.hasBack ? readImageFile(id, 'back') : undefined,
    };
    sessions.set(id, session);
    return session;
  } catch {
    return null;
  }
}

function purgeExpired(now = Date.now()): void {
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now || session.status === 'consumed') {
      if (session.status === 'consumed' && session.consumedAt && now - session.consumedAt > 60_000) {
        sessions.delete(id);
        deletePersistedSession(id);
      } else if (session.expiresAt <= now) {
        if (session.status !== 'consumed') {
          session.status = 'expired';
        }
        sessions.delete(id);
        deletePersistedSession(id);
      }
    }
  }

  try {
    ensureStoreDir();
    for (const file of fs.readdirSync(STORE_DIR)) {
      if (!file.endsWith('.json')) continue;
      const id = file.slice(0, -5);
      if (sessions.has(id)) continue;
      const loaded = loadPersistedSession(id);
      if (!loaded) {
        deletePersistedSession(id);
        continue;
      }
      if (loaded.expiresAt <= now || loaded.status === 'consumed') {
        sessions.delete(id);
        deletePersistedSession(id);
      }
    }
  } catch {
    // ignore
  }

  if (sessions.size <= MAX_SESSIONS) return;
  const ordered = [...sessions.values()].sort((a, b) => a.createdAt - b.createdAt);
  const overflow = sessions.size - MAX_SESSIONS;
  for (let i = 0; i < overflow; i++) {
    sessions.delete(ordered[i].id);
    deletePersistedSession(ordered[i].id);
  }
}

function recomputeStatus(session: CaptureSession): CaptureSessionStatus {
  if (session.status === 'consumed' || session.status === 'expired') return session.status;
  if (session.completedAt) return 'ready';
  if (session.mode === 'scan' && session.frontImage) return 'ready';
  if (session.frontImage) return 'partial';
  return 'waiting';
}

export function createCaptureSession(mode: CaptureMode): CaptureSession {
  purgeExpired();
  const now = Date.now();
  const session: CaptureSession = {
    id: randomUUID(),
    mode,
    status: 'waiting',
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  sessions.set(session.id, session);
  persistMeta(session);
  return session;
}

export function getCaptureSession(id: string): CaptureSession | null {
  purgeExpired();
  let session = sessions.get(id) || loadPersistedSession(id);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    session.status = 'expired';
    sessions.delete(id);
    deletePersistedSession(id);
    return null;
  }
  // Hydrate images from disk if memory only has metadata after restart.
  if (!session.frontImage) session.frontImage = readImageFile(id, 'front');
  if (!session.backImage) session.backImage = readImageFile(id, 'back');
  session.status = recomputeStatus(session);
  return session;
}

export function uploadCaptureImage(
  id: string,
  side: CaptureSide,
  image: string
): { session?: CaptureSession; error?: string; status?: number } {
  const session = getCaptureSession(id);
  if (!session) return { error: 'Capture session not found or expired', status: 404 };
  if (session.status === 'consumed') {
    return { error: 'Capture session already consumed', status: 409 };
  }
  if (session.status === 'ready' && session.completedAt) {
    return { error: 'Capture session already completed', status: 409 };
  }
  if (!image.startsWith('data:image/')) {
    return { error: 'Image must be a base64 data URL', status: 400 };
  }
  if (image.length > MAX_IMAGE_CHARS) {
    return { error: 'Image too large', status: 413 };
  }
  if (side === 'back' && session.mode === 'scan') {
    return { error: 'Scan sessions only accept a front image', status: 400 };
  }
  if (side === 'back' && !session.frontImage) {
    return { error: 'Capture the front of the card first', status: 400 };
  }
  if (!writeImageFile(id, side, image)) {
    return { error: 'Could not store image — retake and try again', status: 400 };
  }

  if (side === 'front') session.frontImage = image;
  else session.backImage = image;

  if (session.mode === 'scan') {
    session.completedAt = Date.now();
  }
  session.status = recomputeStatus(session);
  persistMeta(session);
  return { session };
}

export function completeCaptureSession(
  id: string
): { session?: CaptureSession; error?: string; status?: number } {
  const session = getCaptureSession(id);
  if (!session) return { error: 'Capture session not found or expired', status: 404 };
  if (session.status === 'consumed') {
    return { error: 'Capture session already consumed', status: 409 };
  }
  if (!session.frontImage) {
    return { error: 'Front image is required before completing', status: 400 };
  }
  session.completedAt = Date.now();
  session.status = 'ready';
  persistMeta(session);
  return { session };
}

export function consumeCaptureSession(
  id: string
): { session?: CaptureSession; error?: string; status?: number } {
  const session = getCaptureSession(id);
  if (!session) return { error: 'Capture session not found or expired', status: 404 };
  if (session.status === 'consumed') {
    return { error: 'Capture session already consumed', status: 409 };
  }
  if (!session.frontImage) {
    return { error: 'No images available yet', status: 400 };
  }
  session.status = 'consumed';
  session.consumedAt = Date.now();
  const snapshot: CaptureSession = {
    ...session,
    frontImage: session.frontImage,
    backImage: session.backImage,
  };
  session.frontImage = undefined;
  session.backImage = undefined;
  persistMeta(session);
  // Keep binary files briefly so a late poll can still hydrate if needed, then
  // purgeExpired/deletePersistedSession cleans them after the consumed TTL.
  return { session: snapshot };
}

export function cancelCaptureSession(id: string): boolean {
  const existed = sessions.delete(id) || fs.existsSync(metaPath(id));
  deletePersistedSession(id);
  return existed;
}

export function toPublicSession(session: CaptureSession, includeImages = false) {
  return {
    id: session.id,
    mode: session.mode,
    status: session.status,
    hasFront: Boolean(session.frontImage),
    hasBack: Boolean(session.backImage),
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    completedAt: session.completedAt ?? null,
    ...(includeImages
      ? {
          frontImage: session.frontImage ?? null,
          backImage: session.backImage ?? null,
        }
      : {}),
  };
}
