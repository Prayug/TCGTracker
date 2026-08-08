import axios from 'axios';
import { buildApiUrl } from '../config/env';

export type CaptureMode = 'scan' | 'grade';
export type CaptureSide = 'front' | 'back';
export type CaptureSessionStatus = 'waiting' | 'partial' | 'ready' | 'consumed' | 'expired';

export interface CaptureSessionInfo {
  id: string;
  mode: CaptureMode;
  status: CaptureSessionStatus;
  hasFront: boolean;
  hasBack: boolean;
  createdAt: number;
  expiresAt: number;
  completedAt: number | null;
  capturePath?: string;
  frontImage?: string | null;
  backImage?: string | null;
  lanHosts?: string[];
  primaryLanHost?: string | null;
}

const client = axios.create({
  withCredentials: true,
  timeout: 60_000,
});

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export async function createCaptureSession(mode: CaptureMode): Promise<CaptureSessionInfo> {
  const res = await client.post(buildApiUrl('/api/capture-sessions'), { mode });
  return unwrap<CaptureSessionInfo>(res.data);
}

export async function getCaptureSession(
  id: string,
  includeImages = false
): Promise<CaptureSessionInfo> {
  const res = await client.get(buildApiUrl(`/api/capture-sessions/${id}`), {
    params: includeImages ? { includeImages: '1' } : undefined,
  });
  return unwrap<CaptureSessionInfo>(res.data);
}

export async function uploadCaptureImage(
  id: string,
  image: string,
  side: CaptureSide = 'front'
): Promise<CaptureSessionInfo> {
  const res = await client.post(buildApiUrl(`/api/capture-sessions/${id}/image`), {
    image,
    side,
  });
  return unwrap<CaptureSessionInfo>(res.data);
}

export async function completeCaptureSession(id: string): Promise<CaptureSessionInfo> {
  const res = await client.post(buildApiUrl(`/api/capture-sessions/${id}/complete`));
  return unwrap<CaptureSessionInfo>(res.data);
}

export async function consumeCaptureSession(id: string): Promise<CaptureSessionInfo> {
  const res = await client.post(buildApiUrl(`/api/capture-sessions/${id}/consume`));
  return unwrap<CaptureSessionInfo>(res.data);
}

export async function cancelCaptureSession(id: string): Promise<void> {
  await client.delete(buildApiUrl(`/api/capture-sessions/${id}`));
}

/** Build a phone-reachable origin. On localhost, swap in the machine's LAN IP. */
export function resolvePhoneCaptureOrigin(
  lanHost?: string | null,
  originOverride?: string
): string {
  const override = originOverride?.trim();
  if (override) return override.replace(/\/$/, '');

  const current = window.location.origin.replace(/\/$/, '');
  if (!isLocalhostOrigin(current) || !lanHost) return current;

  const { protocol, port } = window.location;
  const portSuffix = port ? `:${port}` : '';
  return `${protocol}//${lanHost}${portSuffix}`;
}

/** Build the phone-facing URL. Prefer a non-localhost origin so the phone can reach it. */
export function buildCapturePageUrl(
  sessionId: string,
  originOverride?: string,
  sideHint?: CaptureSide,
  lanHost?: string | null
): string {
  const origin = resolvePhoneCaptureOrigin(lanHost, originOverride);
  const url = `${origin}/capture/${sessionId}`;
  return sideHint && sideHint !== 'front' ? `${url}?side=${sideHint}` : url;
}

export function isLocalhostOrigin(origin: string = window.location.origin): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return true;
  }
}
