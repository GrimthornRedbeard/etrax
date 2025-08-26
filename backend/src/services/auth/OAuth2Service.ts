import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import { PrismaClient } from '@prisma/client';
import { JWTService } from './JWTService';
import { AuthService } from './AuthService';
import { logger } from '../../utils/logger';

const prisma = new PrismaClient();

export interface OAuth2Profile {
  provider: string;
  providerId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  profileUrl?: string;
  organizationInfo?: any;
}

export interface OAuth2User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  organizationId: string | null;
  provider: string;
  isNewUser: boolean;
}

export class OAuth2Service {
  private static initialized = false;

  /**
   * Initialize OAuth2 strategies
   */
  static initialize(): void {
    if (this.initialized) return;

    // Google OAuth2 Strategy
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: '/api/auth/google/callback',
        scope: ['profile', 'email']
      }, async (accessToken, refreshToken, profile, done) => {
        try {
          const oauth2Profile: OAuth2Profile = {
            provider: 'google',
            providerId: profile.id,
            email: profile.emails?.[0]?.value || '',
            firstName: profile.name?.givenName || '',
            lastName: profile.name?.familyName || '',
            avatarUrl: profile.photos?.[0]?.value,
            profileUrl: profile.profileUrl
          };

          const user = await this.handleOAuth2Login(oauth2Profile, accessToken);
          return done(null, user);
        } catch (error) {
          logger.error('Google OAuth2 error:', error);
          return done(error, null);
        }
      }));
    }

    // Microsoft OAuth2 Strategy
    if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
      passport.use(new MicrosoftStrategy({
        clientID: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        callbackURL: '/api/auth/microsoft/callback',
        scope: ['user.read']
      }, async (accessToken, refreshToken, profile, done) => {
        try {
          const oauth2Profile: OAuth2Profile = {
            provider: 'microsoft',
            providerId: profile.id,
            email: profile.emails?.[0]?.value || profile._json?.mail || profile._json?.userPrincipalName || '',
            firstName: profile.name?.givenName || profile._json?.givenName || '',
            lastName: profile.name?.familyName || profile._json?.surname || '',
            avatarUrl: profile.photos?.[0]?.value,
            organizationInfo: profile._json?.jobTitle ? {
              jobTitle: profile._json.jobTitle,
              department: profile._json.department,
              companyName: profile._json.companyName
            } : undefined
          };

          const user = await this.handleOAuth2Login(oauth2Profile, accessToken);
          return done(null, user);
        } catch (error) {
          logger.error('Microsoft OAuth2 error:', error);
          return done(error, null);
        }
      }));
    }

    // GitHub OAuth2 Strategy
    if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
      passport.use(new GitHubStrategy({
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: '/api/auth/github/callback',
        scope: ['user:email']
      }, async (accessToken, refreshToken, profile, done) => {
        try {
          const oauth2Profile: OAuth2Profile = {
            provider: 'github',
            providerId: profile.id,
            email: profile.emails?.[0]?.value || '',
            firstName: profile.displayName?.split(' ')[0] || profile.username || '',
            lastName: profile.displayName?.split(' ').slice(1).join(' ') || '',
            avatarUrl: profile.photos?.[0]?.value,
            profileUrl: profile.profileUrl
          };

          const user = await this.handleOAuth2Login(oauth2Profile, accessToken);
          return done(null, user);
        } catch (error) {
          logger.error('GitHub OAuth2 error:', error);
          return done(error, null);
        }
      }));
    }

    // Passport serialization (required but not used in JWT setup)
    passport.serializeUser((user: any, done) => {
      done(null, user.id);
    });

    passport.deserializeUser(async (id: string, done) => {
      try {
        const user = await prisma.user.findUnique({
          where: { id },
          include: { organization: true }
        });
        done(null, user);
      } catch (error) {
        done(error, null);
      }
    });

    this.initialized = true;
    logger.info('OAuth2 strategies initialized');
  }

  /**
   * Handle OAuth2 login/registration
   */
  private static async handleOAuth2Login(profile: OAuth2Profile, accessToken: string): Promise<OAuth2User> {
    if (!profile.email) {
      throw new Error('Email is required for OAuth2 authentication');
    }

    // Check if user exists with this OAuth2 provider
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { 
            email: profile.email,
            authProvider: profile.provider.toUpperCase()
          },
          {
            externalId: profile.providerId,
            authProvider: profile.provider.toUpperCase()
          }
        ]
      },
      include: { organization: true }
    });

    let isNewUser = false;

    if (!user) {
      // Check if user exists with same email but different provider
      const existingUser = await prisma.user.findUnique({
        where: { email: profile.email }
      });

      if (existingUser) {
        // Link OAuth2 account to existing user
        user = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            authProvider: profile.provider.toUpperCase(),
            externalId: profile.providerId,
            avatarUrl: profile.avatarUrl
          },
          include: { organization: true }
        });
      } else {
        // Create new user
        const organizationId = await this.getOrganizationForUser(profile);
        const role = await this.determineUserRole(profile, organizationId);

        user = await prisma.user.create({
          data: {
            email: profile.email,
            firstName: profile.firstName,
            lastName: profile.lastName,
            role,
            organizationId,
            authProvider: profile.provider.toUpperCase(),
            externalId: profile.providerId,
            avatarUrl: profile.avatarUrl,
            isActive: true,
            emailVerified: true // OAuth2 emails are pre-verified
          },
          include: { organization: true }
        });

        isNewUser = true;
      }
    } else {
      // Update existing user info
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          firstName: profile.firstName || user.firstName,
          lastName: profile.lastName || user.lastName,
          avatarUrl: profile.avatarUrl || user.avatarUrl,
          lastLoginAt: new Date()
        },
        include: { organization: true }
      });
    }

    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    // Log OAuth2 login
    await this.logOAuth2Event('oauth2_login', user.id, {
      provider: profile.provider,
      providerId: profile.providerId,
      isNewUser
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      organizationId: user.organizationId,
      provider: profile.provider,
      isNewUser
    };
  }

  /**
   * Generate tokens for OAuth2 user
   */
  static async generateOAuth2Tokens(oauth2User: OAuth2User, deviceInfo?: any) {
    const permissions = await this.getUserPermissions(oauth2User.role, oauth2User.organizationId);
    
    return await JWTService.generateTokenPair(
      oauth2User.id,
      oauth2User.email,
      oauth2User.organizationId,
      oauth2User.role,
      permissions,
      deviceInfo
    );
  }

  /**
   * Link OAuth2 account to existing user
   */
  static async linkOAuth2Account(userId: string, provider: string, profile: OAuth2Profile): Promise<void> {
    // Check if OAuth2 account is already linked to another user
    const existingLink = await prisma.user.findFirst({
      where: {
        externalId: profile.providerId,
        authProvider: provider.toUpperCase(),
        id: { not: userId }
      }
    });

    if (existingLink) {
      throw new Error('OAuth2 account is already linked to another user');
    }

    // Link account
    await prisma.user.update({
      where: { id: userId },
      data: {
        externalId: profile.providerId,
        authProvider: provider.toUpperCase(),
        avatarUrl: profile.avatarUrl || undefined
      }
    });

    await this.logOAuth2Event('oauth2_link', userId, {
      provider,
      providerId: profile.providerId
    });
  }

  /**
   * Unlink OAuth2 account from user
   */
  static async unlinkOAuth2Account(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.passwordHash) {
      throw new Error('Cannot unlink OAuth2 account without a password set');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        authProvider: 'LOCAL',
        externalId: null,
        avatarUrl: null
      }
    });

    await this.logOAuth2Event('oauth2_unlink', userId, {
      provider: user.authProvider
    });
  }

  /**
   * Get available OAuth2 providers
   */
  static getAvailableProviders(): Array<{
    name: string;
    displayName: string;
    enabled: boolean;
    authUrl: string;
  }> {
    return [
      {
        name: 'google',
        displayName: 'Google',
        enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        authUrl: '/api/auth/google'
      },
      {
        name: 'microsoft',
        displayName: 'Microsoft',
        enabled: !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
        authUrl: '/api/auth/microsoft'
      },
      {
        name: 'github',
        displayName: 'GitHub',
        enabled: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
        authUrl: '/api/auth/github'
      }
    ];
  }

  /**
   * Validate OAuth2 configuration
   */
  static validateConfiguration(): { isValid: boolean; missingVars: string[] } {
    const requiredVars = [
      'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
      'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET',
      'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    const isValid = missingVars.length === 0;

    return { isValid, missingVars };
  }

  // Private helper methods

  private static async getOrganizationForUser(profile: OAuth2Profile): Promise<string | null> {
    // Try to match by email domain
    const emailDomain = profile.email.split('@')[1];
    
    const org = await prisma.organization.findFirst({
      where: {
        OR: [
          { domain: emailDomain },
          { allowedDomains: { has: emailDomain } }
        ]
      }
    });

    // For Microsoft, try to extract organization info
    if (profile.provider === 'microsoft' && profile.organizationInfo?.companyName) {
      const msOrg = await prisma.organization.findFirst({
        where: {
          name: { contains: profile.organizationInfo.companyName, mode: 'insensitive' }
        }
      });
      
      if (msOrg) return msOrg.id;
    }

    return org?.id || null;
  }

  private static async determineUserRole(profile: OAuth2Profile, organizationId: string | null): Promise<string> {
    // Default role for new OAuth2 users
    let role = 'USER';

    // Check if this is the first user in the organization (make them admin)
    if (organizationId) {
      const userCount = await prisma.user.count({
        where: { organizationId }
      });

      if (userCount === 0) {
        role = 'ADMIN';
      }
    }

    // Check for admin email patterns
    const adminPatterns = [
      /^admin@/i,
      /^administrator@/i,
      /^it@/i,
      /^tech@/i
    ];

    if (adminPatterns.some(pattern => pattern.test(profile.email))) {
      role = 'ADMIN';
    }

    return role;
  }

  private static async getUserPermissions(role: string, organizationId: string | null): Promise<string[]> {
    // This would typically come from a permissions system
    const rolePermissions: Record<string, string[]> = {
      'SUPER_ADMIN': ['*'],
      'ADMIN': ['users:*', 'equipment:*', 'reports:*', 'settings:*'],
      'MANAGER': ['equipment:*', 'reports:read', 'users:read'],
      'USER': ['equipment:read', 'equipment:checkout', 'reports:read'],
      'VIEWER': ['equipment:read']
    };

    return rolePermissions[role] || rolePermissions['USER'];
  }

  private static async logOAuth2Event(event: string, userId: string, metadata: any): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action: `oauth2.${event}`,
          resource: 'authentication',
          metadata
        }
      });
    } catch (error) {
      logger.error('Failed to log OAuth2 event:', error);
    }
  }
}