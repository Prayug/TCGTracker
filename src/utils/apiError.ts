import axios from 'axios';

function asMessage(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object') {
    const obj = value as { error?: unknown; message?: unknown };
    if (typeof obj.error === 'string' && obj.error.trim()) return obj.error.trim();
    if (typeof obj.message === 'string' && obj.message.trim()) return obj.message.trim();
  }
  return null;
}

/** Turn axios/network failures into a message users can act on. Never returns a non-string. */
export function formatApiError(error: unknown, fallback: string): string {
  if (axios.isCancel(error)) {
    return '';
  }

  if (axios.isAxiosError(error)) {
    const code = error.code;
    if (code === 'ECONNREFUSED' || code === 'ERR_NETWORK') {
      return 'Cannot reach the backend API. Start it with: npm run dev:full';
    }
    if (code === 'ECONNABORTED') {
      return 'Request timed out. The backend may still be starting or the query is too heavy.';
    }
    const status = error.response?.status;
    const bodyMsg = asMessage(error.response?.data);
    // Vercel edge 502 when the Cloudflare tunnel hostname is dead.
    if (
      status === 502 &&
      typeof error.response?.data === 'string' &&
      /DNS_HOSTNAME_NOT_FOUND/i.test(error.response.data)
    ) {
      return 'Backend tunnel is offline. Restart the API tunnel and retarget Vercel.';
    }
    if (status === 502 || status === 503) {
      return bodyMsg && !/^\d{3}$/.test(bodyMsg)
        ? `Backend unavailable (${bodyMsg}). Try again in a moment.`
        : 'Backend unavailable. Try again in a moment.';
    }
    if (bodyMsg) return bodyMsg;
    if (status === 404) {
      return 'API endpoint not found. Check VITE_API_URL and that the backend is deployed.';
    }
    if (error.message) {
      return error.message;
    }
  }

  const direct = asMessage(error);
  if (direct) return direct;

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function isAbortError(error: unknown): boolean {
  if (axios.isCancel(error)) return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  return false;
}
