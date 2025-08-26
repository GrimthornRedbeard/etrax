import { PrismaClient } from '@prisma/client';
import { AuthService } from './AuthService';
import { SAMLService } from './SAMLService';
import { OAuth2Service } from './OAuth2Service';
import { UserManagementService } from './UserManagementService';
import { logger } from '../../utils/logger';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

export interface OrganizationConfig {
  name: string;
  domain: string;
  allowedDomains?: string[];
  subscriptionPlan: string;
  maxUsers?: number;
  features?: string[];
  settings?: any;
  branding?: {
    logo?: string;
    primaryColor?: string;
    customCss?: string;
  };
}

export interface TenantSetupRequest {
  organizationConfig: OrganizationConfig;
  adminUser: {
    email: string;
    firstName: string;
    lastName: string;
    password?: string;
    sendInvite?: boolean;
  };
  authProviders?: {
    saml?: any;
    oauth2?: {
      google?: boolean;
      microsoft?: boolean;
      github?: boolean;
    };
  };
}

export interface DomainRouting {
  domain: string;
  organizationId: string;
  isActive: boolean;
}

export class MultiTenantService {
  private static readonly DEFAULT_FEATURES = [
    'equipment_management',
    'qr_codes',
    'basic_reporting'
  ];

  private static readonly SUBSCRIPTION_LIMITS = {
    'free': { maxUsers: 10, features: ['equipment_management', 'qr_codes'] },
    'basic': { maxUsers: 50, features: ['equipment_management', 'qr_codes', 'basic_reporting'] },
    'professional': { maxUsers: 200, features: ['equipment_management', 'qr_codes', 'advanced_reporting', 'voice_commands'] },
    'enterprise': { maxUsers: -1, features: ['*'] }
  };

  /**
   * Create a new tenant organization with admin user
   */
  static async createTenant(request: TenantSetupRequest): Promise<{
    organization: any;
    adminUser: any;
    tokens?: any;
  }> {
    const { organizationConfig, adminUser, authProviders } = request;

    // Validate domain availability
    await this.validateDomainAvailability(organizationConfig.domain);

    // Validate subscription limits
    this.validateSubscriptionLimits(organizationConfig.subscriptionPlan);

    return await prisma.$transaction(async (tx) => {
      // Create organization
      const organization = await tx.organization.create({
        data: {
          name: organizationConfig.name,
          domain: organizationConfig.domain,
          allowedDomains: organizationConfig.allowedDomains || [],
          subscriptionPlan: organizationConfig.subscriptionPlan,
          maxUsers: organizationConfig.maxUsers || this.SUBSCRIPTION_LIMITS[organizationConfig.subscriptionPlan as keyof typeof this.SUBSCRIPTION_LIMITS]?.maxUsers || 10,
          features: organizationConfig.features || this.DEFAULT_FEATURES,
          settings: {
            ...organizationConfig.settings,
            createdAt: new Date().toISOString(),
            setupCompleted: false
          },
          branding: organizationConfig.branding || {},
          isActive: true
        }
      });

      // Create admin user
      let user;
      let tokens;
      
      if (adminUser.password && !adminUser.sendInvite) {
        // Create user with password directly
        const registrationResult = await AuthService.register({
          email: adminUser.email,
          password: adminUser.password,
          firstName: adminUser.firstName,
          lastName: adminUser.lastName,
          organizationId: organization.id,
          role: 'ADMIN'
        });
        
        user = registrationResult.user;
        tokens = registrationResult.tokens;
      } else {
        // Create user and send invitation
        user = await UserManagementService.createUser({
          email: adminUser.email,
          firstName: adminUser.firstName,
          lastName: adminUser.lastName,
          role: 'ADMIN',
          organizationId: organization.id,
          sendInvite: adminUser.sendInvite !== false,
          temporaryPassword: !adminUser.sendInvite
        }, 'system');
      }

      // Setup authentication providers
      if (authProviders?.saml) {
        await SAMLService.configureSAML(organization.id, authProviders.saml);
      }

      // Log tenant creation
      await this.logTenantEvent('tenant_created', organization.id, {
        organizationName: organization.name,
        domain: organization.domain,
        subscriptionPlan: organization.subscriptionPlan,
        adminEmail: adminUser.email,
        authProviders: Object.keys(authProviders || {})
      });

      return {
        organization: {
          id: organization.id,
          name: organization.name,
          domain: organization.domain,
          subscriptionPlan: organization.subscriptionPlan,
          features: organization.features,
          settings: organization.settings
        },
        adminUser: user,
        tokens
      };
    });
  }

  /**
   * Update organization configuration
   */
  static async updateOrganization(
    organizationId: string,
    updates: Partial<OrganizationConfig>,
    updatedBy: string
  ): Promise<any> {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId }
    });

    if (!organization) {
      throw new Error('Organization not found');
    }

    // Validate domain change
    if (updates.domain && updates.domain !== organization.domain) {
      await this.validateDomainAvailability(updates.domain);
    }

    // Validate subscription plan change
    if (updates.subscriptionPlan) {
      this.validateSubscriptionLimits(updates.subscriptionPlan);
      
      // Check if downgrading would exceed user limits
      if (updates.subscriptionPlan !== organization.subscriptionPlan) {
        await this.validateSubscriptionDowngrade(organizationId, updates.subscriptionPlan);
      }
    }

    const updatedOrg = await prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...updates,
        settings: updates.settings ? {
          ...organization.settings,
          ...updates.settings,
          lastUpdated: new Date().toISOString()
        } : organization.settings
      }
    });

    await this.logTenantEvent('organization_updated', organizationId, {
      updates,
      updatedBy
    });

    return updatedOrg;
  }

  /**
   * Get organization by domain for routing
   */
  static async getOrganizationByDomain(domain: string): Promise<any> {
    const organization = await prisma.organization.findFirst({
      where: {
        OR: [
          { domain },
          { allowedDomains: { has: domain } }
        ],
        isActive: true
      },
      include: {
        _count: {
          select: { users: true }
        }
      }
    });

    if (!organization) {
      return null;
    }

    return {
      id: organization.id,
      name: organization.name,
      domain: organization.domain,
      subscriptionPlan: organization.subscriptionPlan,
      features: organization.features,
      settings: organization.settings,
      branding: organization.branding,
      userCount: organization._count.users,
      maxUsers: organization.maxUsers
    };
  }

  /**
   * Get organization settings for tenant
   */
  static async getOrganizationSettings(organizationId: string): Promise<any> {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: {
          select: { users: true }
        }
      }
    });

    if (!organization) {
      throw new Error('Organization not found');
    }

    return {
      id: organization.id,
      name: organization.name,
      domain: organization.domain,
      allowedDomains: organization.allowedDomains,
      subscriptionPlan: organization.subscriptionPlan,
      maxUsers: organization.maxUsers,
      currentUsers: organization._count.users,
      features: organization.features,
      settings: organization.settings,
      branding: organization.branding,
      isActive: organization.isActive,
      createdAt: organization.createdAt
    };
  }

  /**
   * Check if feature is enabled for organization
   */
  static async hasFeature(organizationId: string, feature: string): Promise<boolean> {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { features: true, subscriptionPlan: true }
    });

    if (!organization) {
      return false;
    }

    // Enterprise has all features
    if (organization.subscriptionPlan === 'enterprise') {
      return true;
    }

    return organization.features.includes(feature) || organization.features.includes('*');
  }

  /**
   * Check if organization can add more users
   */
  static async canAddUsers(organizationId: string, count: number = 1): Promise<boolean> {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: {
          select: { users: true }
        }
      }
    });

    if (!organization) {
      return false;
    }

    // Unlimited users
    if (organization.maxUsers === -1) {
      return true;
    }

    return (organization._count.users + count) <= organization.maxUsers;
  }

  /**
   * Setup SAML for organization
   */
  static async setupSAML(organizationId: string, samlConfig: any, setupBy: string): Promise<void> {
    await SAMLService.configureSAML(organizationId, samlConfig);
    
    await this.logTenantEvent('saml_configured', organizationId, {
      entryPoint: samlConfig.entryPoint,
      issuer: samlConfig.issuer,
      setupBy
    });
  }

  /**
   * Remove SAML configuration
   */
  static async removeSAML(organizationId: string, removedBy: string): Promise<void> {
    await SAMLService.removeSAMLConfig(organizationId);
    
    await this.logTenantEvent('saml_removed', organizationId, {
      removedBy
    });
  }

  /**
   * Test SAML configuration
   */
  static async testSAML(organizationId: string, samlConfig: any): Promise<{ isValid: boolean; errors: string[] }> {
    return await SAMLService.testSAMLConfig(samlConfig);
  }

  /**
   * Get tenant statistics
   */
  static async getTenantStats(organizationId: string): Promise<any> {
    const [
      userCount,
      activeUsers,
      equipmentCount,
      transactionCount
    ] = await Promise.all([
      prisma.user.count({ where: { organizationId } }),
      prisma.user.count({ 
        where: { 
          organizationId,
          isActive: true,
          lastLoginAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days
          }
        }
      }),
      prisma.equipment.count({ where: { organizationId } }),
      prisma.transaction.count({ 
        where: { equipment: { organizationId } },
        orderBy: { createdAt: 'desc' },
        take: 1000 // Limit for performance
      })
    ]);

    return {
      users: {
        total: userCount,
        active: activeUsers,
        inactive: userCount - activeUsers
      },
      equipment: {
        total: equipmentCount
      },
      transactions: {
        total: transactionCount
      },
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Deactivate organization (soft delete)
   */
  static async deactivateOrganization(organizationId: string, deactivatedBy: string, reason?: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Deactivate organization
      await tx.organization.update({
        where: { id: organizationId },
        data: { 
          isActive: false,
          deactivatedAt: new Date()
        }
      });

      // Deactivate all users
      await tx.user.updateMany({
        where: { organizationId },
        data: { isActive: false }
      });

      // Revoke all sessions
      await tx.userSession.deleteMany({
        where: { user: { organizationId } }
      });
    });

    await this.logTenantEvent('organization_deactivated', organizationId, {
      deactivatedBy,
      reason
    });
  }

  /**
   * Reactivate organization
   */
  static async reactivateOrganization(organizationId: string, reactivatedBy: string): Promise<void> {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { 
        isActive: true,
        deactivatedAt: null
      }
    });

    await this.logTenantEvent('organization_reactivated', organizationId, {
      reactivatedBy
    });
  }

  // Private helper methods

  private static async validateDomainAvailability(domain: string): Promise<void> {
    const existing = await prisma.organization.findFirst({
      where: {
        OR: [
          { domain },
          { allowedDomains: { has: domain } }
        ]
      }
    });

    if (existing) {
      throw new Error(`Domain ${domain} is already in use`);
    }
  }

  private static validateSubscriptionLimits(subscriptionPlan: string): void {
    if (!this.SUBSCRIPTION_LIMITS[subscriptionPlan as keyof typeof this.SUBSCRIPTION_LIMITS]) {
      throw new Error(`Invalid subscription plan: ${subscriptionPlan}`);
    }
  }

  private static async validateSubscriptionDowngrade(organizationId: string, newPlan: string): Promise<void> {
    const limits = this.SUBSCRIPTION_LIMITS[newPlan as keyof typeof this.SUBSCRIPTION_LIMITS];
    
    if (!limits) {
      throw new Error(`Invalid subscription plan: ${newPlan}`);
    }

    const userCount = await prisma.user.count({
      where: { organizationId, isActive: true }
    });

    if (limits.maxUsers !== -1 && userCount > limits.maxUsers) {
      throw new Error(`Cannot downgrade: Organization has ${userCount} users, but ${newPlan} plan allows only ${limits.maxUsers}`);
    }
  }

  private static async logTenantEvent(event: string, organizationId: string, metadata: any): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: null, // System event
          action: `tenant.${event}`,
          resource: 'organization',
          resourceId: organizationId,
          metadata
        }
      });
    } catch (error) {
      logger.error('Failed to log tenant event:', error);
    }
  }

  /**
   * Bulk operations for managing multiple tenants
   */
  static async bulkCreateTenants(requests: TenantSetupRequest[]): Promise<{
    success: number;
    failed: number;
    results: Array<{
      success: boolean;
      organization?: any;
      error?: string;
    }>;
  }> {
    const results = [];
    let success = 0;
    let failed = 0;

    for (const request of requests) {
      try {
        const result = await this.createTenant(request);
        results.push({
          success: true,
          organization: result.organization
        });
        success++;
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        failed++;
      }
    }

    return { success, failed, results };
  }

  /**
   * Get all organizations with pagination
   */
  static async getOrganizations(filters: {
    search?: string;
    subscriptionPlan?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { search, subscriptionPlan, isActive, page = 1, limit = 50 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { domain: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (subscriptionPlan) where.subscriptionPlan = subscriptionPlan;
    if (isActive !== undefined) where.isActive = isActive;

    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        include: {
          _count: {
            select: { users: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.organization.count({ where })
    ]);

    return {
      organizations: organizations.map(org => ({
        id: org.id,
        name: org.name,
        domain: org.domain,
        subscriptionPlan: org.subscriptionPlan,
        userCount: org._count.users,
        maxUsers: org.maxUsers,
        isActive: org.isActive,
        createdAt: org.createdAt
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}