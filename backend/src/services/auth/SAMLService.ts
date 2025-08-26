import { Strategy as SAMLStrategy, Profile as SAMLProfile } from 'passport-saml';
import passport from 'passport';
import { PrismaClient } from '@prisma/client';
import { JWTService } from './JWTService';
import { logger } from '../../utils/logger';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

export interface SAMLConfiguration {
  organizationId: string;
  entryPoint: string;
  issuer: string;
  cert: string;
  privateCert?: string;
  identifierFormat?: string;
  attributeMapping: {
    email: string;
    firstName: string;
    lastName: string;
    role?: string;
    department?: string;
    employeeId?: string;
  };
  authnContext?: string[];
  signatureAlgorithm?: string;
  digestAlgorithm?: string;
  nameIdFormat?: string;
}

export interface SAMLUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  organizationId: string;
  samlNameId: string;
  attributes: Record<string, any>;
  isNewUser: boolean;
}

export class SAMLService {
  private static configurations = new Map<string, SAMLConfiguration>();
  private static initialized = false;

  /**
   * Initialize SAML strategies for all organizations
   */
  static async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load SAML configurations from database
      const samlConfigs = await prisma.organization.findMany({
        where: {
          samlConfig: { not: null }
        },
        select: {
          id: true,
          samlConfig: true,
          domain: true
        }
      });

      // Initialize strategy for each organization
      for (const org of samlConfigs) {
        if (org.samlConfig) {
          await this.initializeSAMLStrategy(org.id, org.samlConfig as any);
        }
      }

      this.initialized = true;
      logger.info(`SAML Service initialized with ${samlConfigs.length} configurations`);
    } catch (error) {
      logger.error('Failed to initialize SAML Service:', error);
    }
  }

  /**
   * Initialize SAML strategy for a specific organization
   */
  static async initializeSAMLStrategy(organizationId: string, config: SAMLConfiguration): Promise<void> {
    const strategyName = `saml-${organizationId}`;
    
    const samlOptions = {
      entryPoint: config.entryPoint,
      issuer: config.issuer || `https://etrax.app/saml/metadata/${organizationId}`,
      cert: config.cert,
      privateCert: config.privateCert,
      identifierFormat: config.identifierFormat || 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
      callbackUrl: `https://etrax.app/api/auth/saml/${organizationId}/callback`,
      authnContext: config.authnContext || ['urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport'],
      signatureAlgorithm: config.signatureAlgorithm || 'sha256',
      digestAlgorithm: config.digestAlgorithm || 'sha256',
      acceptedClockSkewMs: 300000, // 5 minutes
      disableRequestedAuthnContext: false,
      forceAuthn: false,
      skipRequestCompression: false,
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: true
    };

    const strategy = new SAMLStrategy(samlOptions, async (profile: SAMLProfile, done) => {
      try {
        const samlUser = await this.handleSAMLLogin(organizationId, profile, config.attributeMapping);
        done(null, samlUser);
      } catch (error) {
        logger.error(`SAML authentication error for org ${organizationId}:`, error);
        done(error, null);
      }
    });

    // Use dynamic strategy name
    strategy.name = strategyName;
    passport.use(strategyName, strategy);

    this.configurations.set(organizationId, config);
    logger.info(`SAML strategy initialized for organization: ${organizationId}`);
  }

  /**
   * Handle SAML login/user creation
   */
  private static async handleSAMLLogin(
    organizationId: string,
    profile: SAMLProfile,
    attributeMapping: SAMLConfiguration['attributeMapping']
  ): Promise<SAMLUser> {
    const email = this.extractAttribute(profile, attributeMapping.email);
    const firstName = this.extractAttribute(profile, attributeMapping.firstName);
    const lastName = this.extractAttribute(profile, attributeMapping.lastName);
    const samlRole = this.extractAttribute(profile, attributeMapping.role);
    
    if (!email) {
      throw new Error('Email attribute is required for SAML authentication');
    }

    // Check if user exists
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { email, organizationId },
          { samlNameId: profile.nameID, organizationId }
        ]
      },
      include: { organization: true }
    });

    let isNewUser = false;
    const role = this.mapSAMLRoleToAppRole(samlRole) || 'USER';

    if (!user) {
      // Create new user (Just-in-Time provisioning)
      user = await prisma.user.create({
        data: {
          email,
          firstName: firstName || '',
          lastName: lastName || '',
          role,
          organizationId,
          authProvider: 'SAML',
          samlNameId: profile.nameID,
          isActive: true,
          emailVerified: true, // SAML users are pre-verified
          samlAttributes: this.extractAllAttributes(profile)
        },
        include: { organization: true }
      });

      isNewUser = true;
      logger.info(`New SAML user created: ${email} for organization: ${organizationId}`);
    } else {
      // Update existing user
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          firstName: firstName || user.firstName,
          lastName: lastName || user.lastName,
          role: samlRole ? this.mapSAMLRoleToAppRole(samlRole) : user.role,
          samlNameId: profile.nameID,
          samlAttributes: this.extractAllAttributes(profile),
          lastLoginAt: new Date()
        },
        include: { organization: true }
      });
    }

    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    // Log SAML login
    await this.logSAMLEvent('saml_login', user.id, {
      organizationId,
      nameId: profile.nameID,
      sessionIndex: profile.sessionIndex,
      isNewUser,
      attributes: this.extractAllAttributes(profile)
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      organizationId: user.organizationId!,
      samlNameId: profile.nameID,
      attributes: this.extractAllAttributes(profile),
      isNewUser
    };
  }

  /**
   * Generate tokens for SAML user
   */
  static async generateSAMLTokens(samlUser: SAMLUser, deviceInfo?: any) {
    const permissions = await this.getUserPermissions(samlUser.role, samlUser.organizationId);
    
    return await JWTService.generateTokenPair(
      samlUser.id,
      samlUser.email,
      samlUser.organizationId,
      samlUser.role,
      permissions,
      deviceInfo
    );
  }

  /**
   * Get SAML metadata for an organization
   */
  static async getSAMLMetadata(organizationId: string): Promise<string> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId }
    });

    if (!org?.samlConfig) {
      throw new Error('SAML not configured for this organization');
    }

    const config = org.samlConfig as any;
    const entityId = config.issuer || `https://etrax.app/saml/metadata/${organizationId}`;
    const acsUrl = `https://etrax.app/api/auth/saml/${organizationId}/callback`;
    const sloUrl = `https://etrax.app/api/auth/saml/${organizationId}/logout`;

    // Generate SP metadata XML
    const metadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
                     entityID="${entityId}">
  <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"
                      WantAssertionsSigned="true"
                      AuthnRequestsSigned="false">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:persistent</md:NameIDFormat>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:transient</md:NameIDFormat>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    
    <md:AssertionConsumerService index="0"
                                isDefault="true"
                                Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                                Location="${acsUrl}" />
    
    <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
                           Location="${sloUrl}" />
    
    <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                           Location="${sloUrl}" />
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;

    return metadata;
  }

  /**
   * Configure SAML for an organization
   */
  static async configureSAML(organizationId: string, config: SAMLConfiguration): Promise<void> {
    // Validate configuration
    this.validateSAMLConfig(config);

    // Save configuration to database
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        samlConfig: config as any
      }
    });

    // Initialize strategy
    await this.initializeSAMLStrategy(organizationId, config);

    logger.info(`SAML configured for organization: ${organizationId}`);
  }

  /**
   * Remove SAML configuration for an organization
   */
  static async removeSAMLConfig(organizationId: string): Promise<void> {
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        samlConfig: null
      }
    });

    // Remove strategy
    const strategyName = `saml-${organizationId}`;
    passport.unuse(strategyName);
    this.configurations.delete(organizationId);

    logger.info(`SAML configuration removed for organization: ${organizationId}`);
  }

  /**
   * Initiate SAML logout
   */
  static async initiateSAMLLogout(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true }
    });

    if (!user?.organizationId || !user.samlNameId) {
      return null;
    }

    const config = this.configurations.get(user.organizationId);
    if (!config) {
      return null;
    }

    // Create logout request
    const strategyName = `saml-${user.organizationId}`;
    const strategy = passport._strategy(strategyName) as SAMLStrategy;
    
    if (strategy) {
      return new Promise((resolve, reject) => {
        strategy.logout({
          nameID: user.samlNameId!,
          sessionIndex: user.samlSessionIndex
        }, (err, logoutUrl) => {
          if (err) {
            reject(err);
          } else {
            resolve(logoutUrl);
          }
        });
      });
    }

    return null;
  }

  /**
   * Test SAML configuration
   */
  static async testSAMLConfig(config: SAMLConfiguration): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      this.validateSAMLConfig(config);
    } catch (error) {
      errors.push(`Configuration validation failed: ${error}`);
    }

    // Test IdP endpoint connectivity
    try {
      const response = await fetch(config.entryPoint, { method: 'HEAD', timeout: 5000 });
      if (!response.ok) {
        errors.push(`IdP endpoint not accessible: ${response.status}`);
      }
    } catch (error) {
      errors.push(`IdP endpoint connectivity failed: ${error}`);
    }

    // Validate certificate format
    if (!config.cert.includes('BEGIN CERTIFICATE')) {
      errors.push('Invalid certificate format');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Private helper methods

  private static extractAttribute(profile: SAMLProfile, attributeName?: string): string | null {
    if (!attributeName) return null;

    // Try different common attribute formats
    const possiblePaths = [
      profile[attributeName],
      profile.attributes?.[attributeName],
      profile[`http://schemas.xmlsoap.org/ws/2005/05/identity/claims/${attributeName}`],
      profile[`http://schemas.microsoft.com/identity/claims/${attributeName}`]
    ];

    for (const value of possiblePaths) {
      if (value) {
        return Array.isArray(value) ? value[0] : value;
      }
    }

    return null;
  }

  private static extractAllAttributes(profile: SAMLProfile): Record<string, any> {
    const attributes: Record<string, any> = {};
    
    if (profile.attributes) {
      Object.keys(profile.attributes).forEach(key => {
        const value = profile.attributes![key];
        attributes[key] = Array.isArray(value) ? value[0] : value;
      });
    }

    return attributes;
  }

  private static mapSAMLRoleToAppRole(samlRole?: string): string {
    if (!samlRole) return 'USER';

    const roleMapping: Record<string, string> = {
      'admin': 'ADMIN',
      'administrator': 'ADMIN',
      'manager': 'MANAGER',
      'teacher': 'MANAGER',
      'staff': 'USER',
      'student': 'USER',
      'user': 'USER'
    };

    const normalizedRole = samlRole.toLowerCase();
    return roleMapping[normalizedRole] || 'USER';
  }

  private static validateSAMLConfig(config: SAMLConfiguration): void {
    if (!config.entryPoint) {
      throw new Error('Entry point is required');
    }

    if (!config.cert) {
      throw new Error('Certificate is required');
    }

    if (!config.attributeMapping?.email) {
      throw new Error('Email attribute mapping is required');
    }

    // Validate URL format
    try {
      new URL(config.entryPoint);
    } catch {
      throw new Error('Invalid entry point URL');
    }
  }

  private static async getUserPermissions(role: string, organizationId: string): Promise<string[]> {
    const rolePermissions: Record<string, string[]> = {
      'SUPER_ADMIN': ['*'],
      'ADMIN': ['users:*', 'equipment:*', 'reports:*', 'settings:*'],
      'MANAGER': ['equipment:*', 'reports:read', 'users:read'],
      'USER': ['equipment:read', 'equipment:checkout', 'reports:read'],
      'VIEWER': ['equipment:read']
    };

    return rolePermissions[role] || rolePermissions['USER'];
  }

  private static async logSAMLEvent(event: string, userId: string, metadata: any): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action: `saml.${event}`,
          resource: 'authentication',
          metadata
        }
      });
    } catch (error) {
      logger.error('Failed to log SAML event:', error);
    }
  }
}