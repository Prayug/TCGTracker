import axios from 'axios';
import { buildApiUrl } from '../config/env';

export interface User {
  id: number;
  username: string;
  email: string;
  email_verified?: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  user: User;
  token?: string;
  requiresVerification?: boolean;
  emailSent?: boolean;
  verifyUrl?: string;
  message?: string;
}

class AuthService {
  private readonly USER_KEY = 'tcgtracker_user';

  async register(username: string, email: string, password: string): Promise<AuthResponse> {
    const response = await axios.post<AuthResponse>(buildApiUrl('/api/auth/register'), {
      username,
      email,
      password,
    });
    // Never persist a session on register — email must be verified first.
    this.clearUser();
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

  async verifyEmail(token: string): Promise<AuthResponse> {
    const response = await axios.post<AuthResponse>(buildApiUrl('/api/auth/verify-email'), {
      token,
    });
    if (response.data.user) {
      this.setUser(response.data.user);
    }
    return response.data;
  }

  async resendVerification(email: string): Promise<{
    success: boolean;
    emailSent?: boolean;
    verifyUrl?: string;
    message?: string;
  }> {
    const response = await axios.post<{
      success: boolean;
      emailSent?: boolean;
      verifyUrl?: string;
      message?: string;
    }>(buildApiUrl('/api/auth/resend-verification'), { email });
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
      const response = await axios.get<{ user: User | null }>(buildApiUrl('/api/auth/me'));
      const user = response.data.user;
      if (!user) {
        this.clearUser();
        return null;
      }
      this.setUser(user);
      return user;
    } catch {
      this.clearUser();
      return null;
    }
  }

  async updateProfile(username?: string, email?: string): Promise<User> {
    const response = await axios.put<{ user: User; requiresVerification?: boolean }>(
      buildApiUrl('/api/auth/update'),
      { username, email }
    );

    if (response.data.requiresVerification) {
      this.clearUser();
    } else {
      this.setUser(response.data.user);
    }
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
