import axios from 'axios';
import { env } from '../config/env';

const API_URL = env.apiUrl;

export interface User {
  id: number;
  username: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

class AuthService {
  private readonly TOKEN_KEY = 'tcgtracker_token';
  private readonly USER_KEY = 'tcgtracker_user';

  async register(username: string, email: string, password: string): Promise<AuthResponse> {
    const response = await axios.post<AuthResponse>(`${API_URL}/api/auth/register`, {
      username,
      email,
      password,
    });
    
    this.setSession(response.data);
    return response.data;
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await axios.post<AuthResponse>(`${API_URL}/api/auth/login`, {
      email,
      password,
    });
    
    this.setSession(response.data);
    return response.data;
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  async getCurrentUser(): Promise<User | null> {
    const token = this.getToken();
    if (!token) return null;

    try {
      const response = await axios.get<{ user: User }>(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data.user;
    } catch (error) {
      this.logout();
      return null;
    }
  }

  async updateProfile(username?: string, email?: string): Promise<User> {
    const token = this.getToken();
    if (!token) throw new Error('Not authenticated');

    const response = await axios.put<{ user: User }>(
      `${API_URL}/api/auth/update`,
      { username, email },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const user = response.data.user;
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    return user;
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const token = this.getToken();
    if (!token) throw new Error('Not authenticated');

    await axios.post(
      `${API_URL}/api/auth/change-password`,
      { oldPassword, newPassword },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  getUser(): User | null {
    const userJson = localStorage.getItem(this.USER_KEY);
    return userJson ? JSON.parse(userJson) : null;
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  private setSession(authResponse: AuthResponse): void {
    localStorage.setItem(this.TOKEN_KEY, authResponse.token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(authResponse.user));
  }

  getAuthHeaders(): Record<string, string> {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}

export const authService = new AuthService();

