import axios from 'axios';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const API_BASE_URL = (
  import.meta.env.VITE_CARD_SCANNER_API_URL || 'http://localhost:5001'
).replace(/\/+$/, '');

const scannerAxios = axios.create({
  withCredentials: false,
  timeout: 30000,
});

export interface ScanResult {
  success: boolean;
  card?: {
    name: string;
    set: string;
    number: string;
    confidence: number;
    id: string | null;
    image?: {
      small: string;
      large: string;
    };
  };
  message?: string;
  error?: string;
}

export interface AvailableSets {
  success: boolean;
  sets?: string[];
  error?: string;
}

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `Unsupported file type: ${file.type}. Allowed: JPEG, PNG, WebP.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 10MB.`;
  }
  return null;
}

export async function scanCardFromFile(file: File): Promise<ScanResult> {
  const validationError = validateFile(file);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const formData = new FormData();
  formData.append('image', file);

  try {
    const response = await scannerAxios.post<ScanResult>(
      `${API_BASE_URL}/api/scan-card`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data;
    }
    throw error;
  }
}

export async function scanCardFromBase64(base64Image: string): Promise<ScanResult> {
  if (base64Image.length > MAX_FILE_SIZE * 1.37) {
    return { success: false, error: 'Image data too large. Max: 10MB.' };
  }

  try {
    const response = await scannerAxios.post<ScanResult>(
      `${API_BASE_URL}/api/scan-card`,
      {
        image: base64Image,
      },
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data;
    }
    throw error;
  }
}

export async function getAvailableSets(): Promise<AvailableSets> {
  try {
    const response = await scannerAxios.get<AvailableSets>(
      `${API_BASE_URL}/api/available-sets`
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data;
    }
    throw error;
  }
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await scannerAxios.get(`${API_BASE_URL}/health`, {
      timeout: 5000,
    });
    return response.data.status === 'ok';
  } catch {
    return false;
  }
}

export interface ReferenceStatus {
  success: boolean;
  ready: boolean;
  error?: string;
  path?: string;
  set_files?: number;
}

export async function checkReferenceStatus(): Promise<ReferenceStatus> {
  try {
    const response = await scannerAxios.get<ReferenceStatus>(
      `${API_BASE_URL}/api/reference-status`,
      { timeout: 5000 }
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      return error.response.data as ReferenceStatus;
    }
    return {
      success: false,
      ready: false,
      error: 'Could not reach reference-status endpoint',
    };
  }
}

/** True when the error message indicates a missing / empty reference DB. */
export function isReferenceDbError(message: string | undefined | null): boolean {
  if (!message) return false;
  return /reference (database|build|db)|not built|reference directory|build_reference/i.test(
    message
  );
}
