import axios from 'axios';
import { buildApiUrl } from '../config/env';

export interface User {
  id: number;
  username: string;
  email: string;
  created_at: string;
  updated_at: string;
  isAdmin?: boolean;
}

export interface AuthResponse {
  user: User;
  token?: string;
}

class AuthService {
  private readonly USER_KEY = 'tcgtracker_user';

  async register(username: string, email: string, password: string): Promise<AuthResponse> {
    const response = await axios.post<AuthResponse>(buildApiUrl('/api/auth/register'), {
      username,
      email,
      password,
    });

    this.setUser(response.data.user);
    return response.data;
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await axios.post<AuthResponse>(buildApiUrl('/api/auth/login'), {
      email,
      password,
    });

    this.setUser(response.data.user);
    return response.data;
  }

  async logout(): Promise<void> {
    try {
      await axios.post(buildApiUrl('/api/auth/logout'));
    } catch {
      /* clear local state regardless */
    }
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem('tcgtracker_token');
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      const response = await axios.get<{ user: User }>(buildApiUrl('/api/auth/me'));
      this.setUser(response.data.user);
      return response.data.user;
    } catch {
      this.clearUser();
      return null;
    }
  }

  async updateProfile(username?: string, email?: string): Promise<User> {
    const response = await axios.put<{ user: User }>(buildApiUrl('/api/auth/update'), {
      username,
      email,
    });

    this.setUser(response.data.user);
    return response.data.user;
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await axios.post(buildApiUrl('/api/auth/change-password'), { oldPassword, newPassword });
  }

  getUser(): User | null {
    try {
      const userJson = localStorage.getItem(this.USER_KEY);
      return userJson ? JSON.parse(userJson) : null;
    } catch {
      this.clearUser();
      return null;
    }
  }

  isAuthenticated(): boolean {
    return !!this.getUser();
  }

  private setUser(user: User): void {
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  }

  private clearUser(): void {
    localStorage.removeItem(this.USER_KEY);
  }
}

export const authService = new AuthService();
