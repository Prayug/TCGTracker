import axios from 'axios';

/** Turn axios/network failures into a message users can act on. */
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
    const body = error.response?.data as { error?: string } | undefined;
    if (body?.error) {
      return body.error;
    }
    if (status === 404) {
      return 'API endpoint not found. Check VITE_API_URL and that the backend is deployed.';
    }
    if (status === 502 || status === 503) {
      return 'Backend unavailable. Try again in a moment.';
    }
    if (error.message) {
      return error.message;
    }
  }

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
