import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';

const prisma = new PrismaClient();

export interface JWTPayload {
  userId: string;
  email: string;
  organizationId: string | null;
  role: string;
  permissions: string[];
  sessionId: string;
  tokenType: 'access' | 'refresh' | 'id';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
  tokenType: string;
}

export class JWTService {
  private static readonly ACCESS_TOKEN_EXPIRY = '15m';
  private static readonly REFRESH_TOKEN_EXPIRY = '7d';
  private static readonly ID_TOKEN_EXPIRY = '1h';
  
  // In production, these should be loaded from secure key storage
  private static readonly JWT_SECRET = process.env.JWT_SECRET || 'development-secret-key-change-in-production';
  private static readonly REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'development-refresh-secret';

  /**
   * Generate RSA key pair for JWT signing (production implementation)
   */
  private static generateKeyPair(): { privateKey: string; publicKey: string } {
    // In production, generate and store RSA keys securely
    // For now, return mock keys for development
    return {
      privateKey: this.JWT_SECRET,
      publicKey: this.JWT_SECRET
    };
  }

  /**
   * Create a new JWT access token
   */
  static async createAccessToken(payload: Omit<JWTPayload, 'tokenType'>): Promise<string> {
    const tokenPayload: JWTPayload = {
      ...payload,
      tokenType: 'access'
    };

    return jwt.sign(tokenPayload, this.JWT_SECRET, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
      issuer: 'etrax-api',
      audience: 'etrax-frontend',
      algorithm: 'HS256' // Use RS256 in production with RSA keys
    });
  }

  /**
   * Create a new JWT refresh token
   */
  static async createRefreshToken(payload: Omit<JWTPayload, 'tokenType'>): Promise<string> {
    const tokenPayload: JWTPayload = {
      ...payload,
      tokenType: 'refresh'
    };

    const refreshToken = jwt.sign(tokenPayload, this.REFRESH_SECRET, {
      expiresIn: this.REFRESH_TOKEN_EXPIRY,
      issuer: 'etrax-api',
      audience: 'etrax-frontend',
      algorithm: 'HS256'
    });

    // Store refresh token hash in database for revocation
    const tokenHash = this.hashToken(refreshToken);
    await this.storeRefreshToken(payload.userId, payload.sessionId, tokenHash);

    return refreshToken;
  }

  /**
   * Create a new JWT ID token (contains user profile info)
   */
  static async createIdToken(payload: Omit<JWTPayload, 'tokenType' | 'permissions'>): Promise<string> {
    const tokenPayload = {
      ...payload,
      tokenType: 'id' as const
    };

    return jwt.sign(tokenPayload, this.JWT_SECRET, {
      expiresIn: this.ID_TOKEN_EXPIRY,
      issuer: 'etrax-api',
      audience: 'etrax-frontend',
      algorithm: 'HS256'
    });
  }

  /**
   * Generate a complete token set for a user
   */
  static async generateTokenPair(
    userId: string,
    email: string,
    organizationId: string | null,
    role: string,
    permissions: string[],
    deviceInfo?: any
  ): Promise<TokenPair> {
    const sessionId = randomBytes(32).toString('hex');

    // Create session record
    await this.createUserSession(userId, sessionId, deviceInfo);

    const basePayload = {
      userId,
      email,
      organizationId,
      role,
      sessionId
    };

    const [accessToken, refreshToken, idToken] = await Promise.all([
      this.createAccessToken({ ...basePayload, permissions }),
      this.createRefreshToken({ ...basePayload, permissions }),
      this.createIdToken(basePayload)
    ]);

    return {
      accessToken,
      refreshToken,
      idToken,
      expiresIn: 900, // 15 minutes in seconds
      tokenType: 'Bearer'
    };
  }

  /**
   * Verify and decode a JWT token
   */
  static async verifyToken(token: string, tokenType: 'access' | 'refresh' | 'id' = 'access'): Promise<JWTPayload> {
    try {
      const secret = tokenType === 'refresh' ? this.REFRESH_SECRET : this.JWT_SECRET;
      
      const payload = jwt.verify(token, secret, {
        issuer: 'etrax-api',
        audience: 'etrax-frontend',
        algorithms: ['HS256']
      }) as JWTPayload;

      // Verify token type matches expected
      if (payload.tokenType !== tokenType) {
        throw new Error(`Invalid token type. Expected ${tokenType}, got ${payload.tokenType}`);
      }

      // For refresh tokens, verify it hasn't been revoked
      if (tokenType === 'refresh') {
        const isValid = await this.verifyRefreshToken(payload.userId, payload.sessionId, token);
        if (!isValid) {
          throw new Error('Refresh token has been revoked');
        }
      }

      return payload;
    } catch (error) {
      logger.error('JWT verification failed:', error);
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Refresh access token using refresh token
   */
  static async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    const payload = await this.verifyToken(refreshToken, 'refresh');
    
    // Get updated user permissions
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { organization: true }
    });

    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }

    const permissions = await this.getUserPermissions(user.role, user.organizationId);

    const accessToken = await this.createAccessToken({
      userId: payload.userId,
      email: payload.email,
      organizationId: payload.organizationId,
      role: payload.role,
      permissions,
      sessionId: payload.sessionId
    });

    return {
      accessToken,
      expiresIn: 900 // 15 minutes
    };
  }

  /**
   * Revoke a refresh token and end session
   */
  static async revokeRefreshToken(userId: string, sessionId: string): Promise<void> {
    try {
      await prisma.userSession.delete({
        where: {
          userId_sessionId: {
            userId,
            sessionId
          }
        }
      });
      logger.info(`Session revoked for user ${userId}, session ${sessionId}`);
    } catch (error) {
      logger.error('Failed to revoke refresh token:', error);
    }
  }

  /**
   * Revoke all refresh tokens for a user
   */
  static async revokeAllUserTokens(userId: string): Promise<void> {
    try {
      await prisma.userSession.deleteMany({
        where: { userId }
      });
      logger.info(`All sessions revoked for user ${userId}`);
    } catch (error) {
      logger.error('Failed to revoke all user tokens:', error);
    }
  }

  /**
   * Hash a token for secure storage
   */
  private static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Store refresh token hash in database
   */
  private static async storeRefreshToken(userId: string, sessionId: string, tokenHash: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await prisma.userSession.upsert({
      where: {
        userId_sessionId: {
          userId,
          sessionId
        }
      },
      create: {
        userId,
        sessionId,
        refreshTokenHash: tokenHash,
        expiresAt,
        deviceInfo: {}
      },
      update: {
        refreshTokenHash: tokenHash,
        expiresAt
      }
    });
  }

  /**
   * Verify refresh token against stored hash
   */
  private static async verifyRefreshToken(userId: string, sessionId: string, token: string): Promise<boolean> {
    try {
      const session = await prisma.userSession.findUnique({
        where: {
          userId_sessionId: {
            userId,
            sessionId
          }
        }
      });

      if (!session || session.expiresAt < new Date()) {
        return false;
      }

      const tokenHash = this.hashToken(token);
      return session.refreshTokenHash === tokenHash;
    } catch (error) {
      logger.error('Refresh token verification failed:', error);
      return false;
    }
  }

  /**
   * Create a new user session record
   */
  private static async createUserSession(userId: string, sessionId: string, deviceInfo?: any): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await prisma.userSession.create({
      data: {
        userId,
        sessionId,
        refreshTokenHash: '', // Will be updated when refresh token is created
        expiresAt,
        deviceInfo: deviceInfo || {}
      }
    });
  }

  /**
   * Get user permissions based on role and organization
   */
  private static async getUserPermissions(role: string, organizationId: string | null): Promise<string[]> {
    // Define role-based permissions
    const rolePermissions: Record<string, string[]> = {
      'SUPER_ADMIN': ['*'], // All permissions
      'ADMIN': [
        'users:read', 'users:write', 'users:delete',
        'equipment:read', 'equipment:write', 'equipment:delete',
        'categories:read', 'categories:write', 'categories:delete',
        'locations:read', 'locations:write', 'locations:delete',
        'transactions:read', 'transactions:write',
        'reports:read', 'reports:generate',
        'settings:read', 'settings:write'
      ],
      'MANAGER': [
        'users:read',
        'equipment:read', 'equipment:write',
        'categories:read', 'categories:write',
        'locations:read', 'locations:write',
        'transactions:read', 'transactions:write',
        'reports:read', 'reports:generate'
      ],
      'USER': [
        'equipment:read',
        'categories:read',
        'locations:read',
        'transactions:read', 'transactions:write'
      ],
      'VIEWER': [
        'equipment:read',
        'categories:read',
        'locations:read',
        'transactions:read'
      ]
    };

    return rolePermissions[role] || rolePermissions['VIEWER'];
  }

  /**
   * Clean up expired sessions
   */
  static async cleanupExpiredSessions(): Promise<void> {
    try {
      const result = await prisma.userSession.deleteMany({
        where: {
          expiresAt: {
            lt: new Date()
          }
        }
      });
      logger.info(`Cleaned up ${result.count} expired sessions`);
    } catch (error) {
      logger.error('Failed to cleanup expired sessions:', error);
    }
  }
}