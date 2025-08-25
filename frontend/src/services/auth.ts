import { apiClient } from './api';
import { User, UserRole } from '@shared/types';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  schoolId?: string;
  organizationId?: string;
  role?: UserRole;
}

export interface AuthResponse {
  success: boolean;
  user: User;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
  expiresAt: string;
}

export interface RefreshTokenResponse {
  success: boolean;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
  expiresAt: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordReset {
  token: string;
  password: string;
  confirmPassword: string;
}

export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export class AuthService {
  private static readonly AUTH_TOKEN_KEY = 'auth_token';
  private static readonly REFRESH_TOKEN_KEY = 'refresh_token';
  private static readonly USER_KEY = 'user';

  static async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
    
    if (response.success) {
      this.saveTokens(response.tokens);
      this.saveUser(response.user);
    }
    
    return response;
  }

  static async register(data: RegisterData): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/register', data);
    
    if (response.success) {
      this.saveTokens(response.tokens);
      this.saveUser(response.user);
    }
    
    return response;
  }

  static async logout(): Promise<void> {
    try {
      const refreshToken = this.getRefreshToken();
      if (refreshToken) {
        await apiClient.post('/auth/logout', { refreshToken });
      }
    } catch (error) {
      // Even if logout fails, clear local storage
      console.warn('Logout request failed:', error);
    } finally {
      this.clearAuth();
    }
  }

  static async refreshToken(): Promise<RefreshTokenResponse> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await apiClient.post<RefreshTokenResponse>('/auth/refresh', {
      refreshToken,
    });

    if (response.success) {
      this.saveTokens(response.tokens);
    }

    return response;
  }

  static async requestPasswordReset(data: PasswordResetRequest): Promise<{ success: boolean; message: string }> {
    return await apiClient.post('/auth/forgot-password', data);
  }

  static async resetPassword(data: PasswordReset): Promise<{ success: boolean; message: string }> {
    return await apiClient.post('/auth/reset-password', data);
  }

  static async changePassword(data: ChangePasswordData): Promise<{ success: boolean; message: string }> {
    return await apiClient.post('/auth/change-password', data);
  }

  static async getCurrentUser(): Promise<User> {
    return await apiClient.get<User>('/auth/me');
  }

  static async updateProfile(data: Partial<User>): Promise<User> {
    const response = await apiClient.put<{ user: User }>('/auth/profile', data);
    this.saveUser(response.user);
    return response.user;
  }

  static async verifyEmail(token: string): Promise<{ success: boolean; message: string }> {
    return await apiClient.post('/auth/verify-email', { token });
  }

  static async resendEmailVerification(): Promise<{ success: boolean; message: string }> {
    return await apiClient.post('/auth/resend-verification');
  }

  // Token management
  static saveTokens(tokens: { accessToken: string; refreshToken: string }): void {
    localStorage.setItem(this.AUTH_TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, tokens.refreshToken);
  }

  static getAuthToken(): string | null {
    return localStorage.getItem(this.AUTH_TOKEN_KEY);
  }

  static getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  static saveUser(user: User): void {
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  }

  static getUser(): User | null {
    const userStr = localStorage.getItem(this.USER_KEY);
    if (!userStr) return null;
    
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  static clearAuth(): void {
    localStorage.removeItem(this.AUTH_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  static isAuthenticated(): boolean {
    const token = this.getAuthToken();
    const user = this.getUser();
    return !!(token && user);
  }

  static hasRole(requiredRole: UserRole): boolean {
    const user = this.getUser();
    if (!user) return false;

    const roleHierarchy = {
      SUPER_ADMIN: 5,
      ADMIN: 4,
      MANAGER: 3,
      STAFF: 2,
      USER: 1,
    };

    const userRoleLevel = roleHierarchy[user.role as keyof typeof roleHierarchy] || 0;
    const requiredRoleLevel = roleHierarchy[requiredRole as keyof typeof roleHierarchy] || 0;

    return userRoleLevel >= requiredRoleLevel;
  }

  static canAccessFeature(feature: string): boolean {
    const user = this.getUser();
    if (!user) return false;

    // Feature access based on roles
    const featurePermissions: Record<string, UserRole[]> = {
      'reports': ['ADMIN', 'MANAGER'],
      'settings': ['ADMIN'],
      'users': ['ADMIN', 'MANAGER'],
      'bulk-operations': ['ADMIN', 'MANAGER'],
      'voice-commands': ['ADMIN', 'MANAGER', 'STAFF'],
      'qr-generation': ['ADMIN', 'MANAGER', 'STAFF'],
    };

    const allowedRoles = featurePermissions[feature];
    if (!allowedRoles) return true; // Feature has no restrictions

    return allowedRoles.includes(user.role as UserRole);
  }

  // Session management
  static setupTokenRefresh(): void {
    // Auto-refresh token before it expires
    const refreshInterval = 30 * 60 * 1000; // 30 minutes
    
    setInterval(async () => {
      if (this.isAuthenticated()) {
        try {
          await this.refreshToken();
        } catch (error) {
          console.warn('Token refresh failed:', error);
          this.clearAuth();
          window.location.href = '/login';
        }
      }
    }, refreshInterval);
  }
}