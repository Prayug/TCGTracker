import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_CARD_SCANNER_API_URL || 'http://localhost:5001';

// Scanner API uses its own axios instance to avoid inheriting withCredentials
// from the global defaults (which is for Node backend auth cookies).
const scannerAxios = axios.create({ withCredentials: false });

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

/**
 * Scan a Pokemon card from an uploaded file
 */
export async function scanCardFromFile(file: File): Promise<ScanResult> {
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

/**
 * Scan a Pokemon card from base64 image data (for camera capture)
 */
export async function scanCardFromBase64(base64Image: string): Promise<ScanResult> {
  try {
    const response = await scannerAxios.post<ScanResult>(
      `${API_BASE_URL}/api/scan-card`,
      {
        image: base64Image,
      },
      {
        headers: {
          'Content-Type': 'application/json',
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

/**
 * Get list of available Pokemon card sets
 */
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

/**
 * Check if the card scanner backend is available
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await scannerAxios.get(`${API_BASE_URL}/health`, {
      timeout: 5000,
    });
    return response.data.status === 'ok';
  } catch (error) {
    return false;
  }
}
