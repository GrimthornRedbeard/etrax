import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { JWTService, TokenPair } from './JWTService';
import { EmailService } from '../EmailService';
import { logger } from '../../utils/logger';

const prisma = new PrismaClient();

export interface LoginRequest {
  email: string;
  password: string;
  organizationId?: string;
  deviceInfo?: any;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationId?: string;
  role?: string;
  inviteToken?: string;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    organizationId: string | null;
    isActive: boolean;
    emailVerified: boolean;
  };
  tokens: TokenPair;
  requiresEmailVerification?: boolean;
  requiresMfa?: boolean;
}

export class AuthService {
  private static readonly BCRYPT_ROUNDS = 12;
  private static readonly MAX_LOGIN_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

  /**
   * Authenticate user with email and password
   */
  static async login(request: LoginRequest): Promise<AuthResult> {
    const { email, password, organizationId, deviceInfo } = request;

    // Find user by email and organization
    const user = await this.findUserByEmailAndOrg(email, organizationId);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Check if account is locked
    await this.checkAccountLockout(user.id);

    // Verify password
    const isValidPassword = await this.verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      await this.recordFailedLogin(user.id);
      throw new Error('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    // Reset login attempts on successful login
    await this.resetLoginAttempts(user.id);

    // Generate token pair
    const permissions = await this.getUserPermissions(user.role, user.organizationId);
    const tokens = await JWTService.generateTokenPair(
      user.id,
      user.email,
      user.organizationId,
      user.role,
      permissions,
      deviceInfo
    );

    // Log successful login
    await this.logAuthEvent('login', user.id, { deviceInfo });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
        isActive: user.isActive,
        emailVerified: user.emailVerified || false
      },
      tokens,
      requiresEmailVerification: !user.emailVerified,
      requiresMfa: user.mfaEnabled || false
    };
  }

  /**
   * Register a new user
   */
  static async register(request: RegisterRequest): Promise<AuthResult> {
    const { email, password, firstName, lastName, organizationId, role = 'USER', inviteToken } = request;

    // Validate invite token if provided
    if (inviteToken) {
      await this.validateInviteToken(inviteToken, email);
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      throw new Error('User already exists');
    }

    // Validate password strength
    this.validatePasswordStrength(password);

    // Hash password
    const passwordHash = await this.hashPassword(password);

    // Determine organization
    let userOrgId = organizationId;
    if (!userOrgId && !inviteToken) {
      // Auto-assign based on email domain
      userOrgId = await this.getOrganizationByEmailDomain(email);
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        role: inviteToken ? role : 'USER', // Honor invited role
        organizationId: userOrgId,
        isActive: true,
        emailVerified: false,
        authProvider: 'LOCAL'
      }
    });

    // Send email verification
    await this.sendEmailVerification(user.id, email);

    // Generate token pair
    const permissions = await this.getUserPermissions(user.role, user.organizationId);
    const tokens = await JWTService.generateTokenPair(
      user.id,
      user.email,
      user.organizationId,
      user.role,
      permissions
    );

    // Log registration
    await this.logAuthEvent('register', user.id, { email, organizationId: userOrgId });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
        isActive: user.isActive,
        emailVerified: false
      },
      tokens,
      requiresEmailVerification: true
    };
  }

  /**
   * Logout user and revoke tokens
   */
  static async logout(userId: string, sessionId: string): Promise<void> {
    await JWTService.revokeRefreshToken(userId, sessionId);
    await this.logAuthEvent('logout', userId, { sessionId });
  }

  /**
   * Logout from all devices
   */
  static async logoutAll(userId: string): Promise<void> {
    await JWTService.revokeAllUserTokens(userId);
    await this.logAuthEvent('logout_all', userId, {});
  }

  /**
   * Refresh access token
   */
  static async refreshToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    return await JWTService.refreshAccessToken(refreshToken);
  }

  /**
   * Send password reset email
   */
  static async requestPasswordReset(email: string, organizationId?: string): Promise<void> {
    const user = await this.findUserByEmailAndOrg(email, organizationId);
    if (!user) {
      // Don't reveal whether user exists
      return;
    }

    const resetToken = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour

    // Store reset token
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: resetToken,
        expiresAt
      }
    });

    // Send reset email
    await EmailService.sendPasswordResetEmail(user.email, user.firstName, resetToken);
    await this.logAuthEvent('password_reset_request', user.id, { email });
  }

  /**
   * Reset password with token
   */
  static async resetPassword(token: string, newPassword: string): Promise<void> {
    // Find valid reset token
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        token,
        expiresAt: { gt: new Date() },
        usedAt: null
      },
      include: { user: true }
    });

    if (!resetToken) {
      throw new Error('Invalid or expired reset token');
    }

    // Validate new password
    this.validatePasswordStrength(newPassword);

    // Hash new password
    const passwordHash = await this.hashPassword(newPassword);

    // Update user password
    await prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash }
    });

    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() }
    });

    // Revoke all existing sessions
    await JWTService.revokeAllUserTokens(resetToken.userId);

    await this.logAuthEvent('password_reset', resetToken.userId, { token: token.substring(0, 8) + '...' });
  }

  /**
   * Verify email with token
   */
  static async verifyEmail(token: string): Promise<void> {
    const verification = await prisma.emailVerificationToken.findFirst({
      where: {
        token,
        expiresAt: { gt: new Date() }
      }
    });

    if (!verification) {
      throw new Error('Invalid or expired verification token');
    }

    // Update user as verified
    await prisma.user.update({
      where: { id: verification.userId },
      data: { emailVerified: true }
    });

    // Delete verification token
    await prisma.emailVerificationToken.delete({
      where: { id: verification.id }
    });

    await this.logAuthEvent('email_verified', verification.userId, {});
  }

  /**
   * Change user password (authenticated)
   */
  static async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.passwordHash) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValidPassword = await this.verifyPassword(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Current password is incorrect');
    }

    // Validate new password
    this.validatePasswordStrength(newPassword);

    // Hash new password
    const passwordHash = await this.hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    });

    // Revoke all existing sessions except current one
    await JWTService.revokeAllUserTokens(userId);

    await this.logAuthEvent('password_change', userId, {});
  }

  // Private helper methods

  private static async findUserByEmailAndOrg(email: string, organizationId?: string) {
    const where: any = { email };
    if (organizationId) {
      where.organizationId = organizationId;
    }

    return await prisma.user.findFirst({
      where,
      include: { organization: true }
    });
  }

  private static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  private static async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, this.BCRYPT_ROUNDS);
  }

  private static validatePasswordStrength(password: string): void {
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    if (!/(?=.*[a-z])/.test(password)) {
      throw new Error('Password must contain at least one lowercase letter');
    }

    if (!/(?=.*[A-Z])/.test(password)) {
      throw new Error('Password must contain at least one uppercase letter');
    }

    if (!/(?=.*\d)/.test(password)) {
      throw new Error('Password must contain at least one number');
    }

    if (!/(?=.*[@$!%*?&])/.test(password)) {
      throw new Error('Password must contain at least one special character');
    }
  }

  private static async checkAccountLockout(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { loginAttempts: true, lockedUntil: true }
    });

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new Error('Account is temporarily locked. Please try again later.');
    }
  }

  private static async recordFailedLogin(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { loginAttempts: true }
    });

    const attempts = (user?.loginAttempts || 0) + 1;
    const updateData: any = { loginAttempts: attempts };

    if (attempts >= this.MAX_LOGIN_ATTEMPTS) {
      updateData.lockedUntil = new Date(Date.now() + this.LOCKOUT_DURATION);
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData
    });
  }

  private static async resetLoginAttempts(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        loginAttempts: 0,
        lockedUntil: null
      }
    });
  }

  private static async getUserPermissions(role: string, organizationId: string | null): Promise<string[]> {
    // This would typically come from a permissions system
    // For now, return role-based permissions
    const rolePermissions: Record<string, string[]> = {
      'SUPER_ADMIN': ['*'],
      'ADMIN': ['users:*', 'equipment:*', 'reports:*'],
      'MANAGER': ['equipment:*', 'reports:read'],
      'USER': ['equipment:read', 'equipment:checkout'],
      'VIEWER': ['equipment:read']
    };

    return rolePermissions[role] || rolePermissions['VIEWER'];
  }

  private static async getOrganizationByEmailDomain(email: string): Promise<string | null> {
    const domain = email.split('@')[1];
    const org = await prisma.organization.findFirst({
      where: { domain }
    });
    return org?.id || null;
  }

  private static async validateInviteToken(token: string, email: string): Promise<void> {
    const invite = await prisma.userInvite.findFirst({
      where: {
        token,
        email,
        expiresAt: { gt: new Date() },
        acceptedAt: null
      }
    });

    if (!invite) {
      throw new Error('Invalid or expired invite token');
    }
  }

  private static async sendEmailVerification(userId: string, email: string): Promise<void> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await prisma.emailVerificationToken.create({
      data: {
        userId,
        token,
        expiresAt
      }
    });

    await EmailService.sendEmailVerification(email, token);
  }

  private static async logAuthEvent(event: string, userId: string, metadata: any): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action: `auth.${event}`,
          resource: 'authentication',
          metadata
        }
      });
    } catch (error) {
      logger.error('Failed to log auth event:', error);
    }
  }
}