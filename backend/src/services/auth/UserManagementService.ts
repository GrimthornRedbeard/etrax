import { PrismaClient } from '@prisma/client';
import { AuthService } from './AuthService';
import { JWTService } from './JWTService';
import { EmailService } from '../EmailService';
import { logger } from '../../utils/logger';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  organizationId: string;
  sendInvite?: boolean;
  temporaryPassword?: boolean;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  role?: string;
  isActive?: boolean;
  organizationId?: string;
}

export interface UserInviteRequest {
  email: string;
  role: string;
  organizationId: string;
  invitedBy: string;
  expiresInDays?: number;
}

export interface BulkUserImport {
  users: Array<{
    email: string;
    firstName: string;
    lastName: string;
    role?: string;
    department?: string;
    employeeId?: string;
  }>;
  organizationId: string;
  sendInvites?: boolean;
}

export class UserManagementService {
  private static readonly DEFAULT_ROLES = ['VIEWER', 'USER', 'MANAGER', 'ADMIN'];
  private static readonly INVITE_EXPIRY_DAYS = 7;

  /**
   * Create a new user account
   */
  static async createUser(request: CreateUserRequest, createdBy: string): Promise<any> {
    const { email, firstName, lastName, role, organizationId, sendInvite = true, temporaryPassword = false } = request;

    // Validate role
    if (!this.DEFAULT_ROLES.includes(role)) {
      throw new Error(`Invalid role. Must be one of: ${this.DEFAULT_ROLES.join(', ')}`);
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        email,
        organizationId
      }
    });

    if (existingUser) {
      throw new Error('User already exists in this organization');
    }

    // Verify organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId }
    });

    if (!organization) {
      throw new Error('Organization not found');
    }

    let passwordHash = null;
    let tempPassword = null;

    if (temporaryPassword) {
      // Generate temporary password
      tempPassword = this.generateTemporaryPassword();
      passwordHash = await AuthService['hashPassword'](tempPassword);
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        role,
        organizationId,
        passwordHash,
        isActive: true,
        emailVerified: false,
        authProvider: 'LOCAL',
        createdBy
      },
      include: {
        organization: true,
        createdByUser: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    // Send invite or temporary password email
    if (sendInvite) {
      if (temporaryPassword && tempPassword) {
        await this.sendTemporaryPasswordEmail(user, tempPassword);
      } else {
        await this.sendUserInvitation(user.id, email, role, organizationId, createdBy);
      }
    }

    // Log user creation
    await this.logUserEvent('user_created', user.id, createdBy, {
      email,
      role,
      organizationId,
      sendInvite,
      temporaryPassword
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      organizationId: user.organizationId,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      temporaryPassword: tempPassword // Only returned if generated
    };
  }

  /**
   * Update user information
   */
  static async updateUser(userId: string, updates: UpdateUserRequest, updatedBy: string): Promise<any> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Validate role if being updated
    if (updates.role && !this.DEFAULT_ROLES.includes(updates.role)) {
      throw new Error(`Invalid role. Must be one of: ${this.DEFAULT_ROLES.join(', ')}`);
    }

    // If changing organization, verify it exists
    if (updates.organizationId && updates.organizationId !== user.organizationId) {
      const organization = await prisma.organization.findUnique({
        where: { id: updates.organizationId }
      });
      if (!organization) {
        throw new Error('Organization not found');
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...updates,
        updatedAt: new Date()
      },
      include: {
        organization: true
      }
    });

    // If user was deactivated, revoke all tokens
    if (updates.isActive === false) {
      await JWTService.revokeAllUserTokens(userId);
    }

    await this.logUserEvent('user_updated', userId, updatedBy, updates);

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      role: updatedUser.role,
      organizationId: updatedUser.organizationId,
      isActive: updatedUser.isActive,
      emailVerified: updatedUser.emailVerified,
      updatedAt: updatedUser.updatedAt
    };
  }

  /**
   * Delete/deactivate user
   */
  static async deleteUser(userId: string, deletedBy: string, hardDelete: boolean = false): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (hardDelete) {
      // Hard delete - remove all user data
      await prisma.$transaction(async (tx) => {
        // Delete related records
        await tx.userSession.deleteMany({ where: { userId } });
        await tx.auditLog.updateMany(
          { where: { userId } },
          { data: { userId: null } } // Preserve logs but anonymize
        );
        
        // Delete user
        await tx.user.delete({ where: { id: userId } });
      });
    } else {
      // Soft delete - deactivate user
      await prisma.user.update({
        where: { id: userId },
        data: {
          isActive: false,
          deletedAt: new Date()
        }
      });

      // Revoke all tokens
      await JWTService.revokeAllUserTokens(userId);
    }

    await this.logUserEvent(hardDelete ? 'user_deleted' : 'user_deactivated', userId, deletedBy, { hardDelete });
  }

  /**
   * Send user invitation
   */
  static async sendUserInvitation(userId: string, email: string, role: string, organizationId: string, invitedBy: string): Promise<void> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.INVITE_EXPIRY_DAYS);

    // Create invitation record
    await prisma.userInvite.create({
      data: {
        email,
        token,
        role,
        organizationId,
        invitedBy,
        expiresAt
      }
    });

    // Get organization and inviter info
    const [organization, inviter] = await Promise.all([
      prisma.organization.findUnique({ where: { id: organizationId } }),
      prisma.user.findUnique({ where: { id: invitedBy } })
    ]);

    // Send invitation email
    await EmailService.sendUserInvitation(
      email,
      token,
      organization?.name || 'ETrax',
      `${inviter?.firstName} ${inviter?.lastName}` || 'Administrator',
      role
    );

    await this.logUserEvent('user_invited', userId, invitedBy, { email, role, organizationId });
  }

  /**
   * Resend user invitation
   */
  static async resendInvitation(email: string, organizationId: string, resendBy: string): Promise<void> {
    const invite = await prisma.userInvite.findFirst({
      where: {
        email,
        organizationId,
        acceptedAt: null,
        expiresAt: { gt: new Date() }
      }
    });

    if (!invite) {
      throw new Error('No active invitation found for this user');
    }

    // Generate new token and extend expiry
    const newToken = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.INVITE_EXPIRY_DAYS);

    await prisma.userInvite.update({
      where: { id: invite.id },
      data: {
        token: newToken,
        expiresAt,
        resentAt: new Date(),
        resentBy: resendBy
      }
    });

    // Get organization and sender info
    const [organization, sender] = await Promise.all([
      prisma.organization.findUnique({ where: { id: organizationId } }),
      prisma.user.findUnique({ where: { id: resendBy } })
    ]);

    // Send invitation email with new token
    await EmailService.sendUserInvitation(
      email,
      newToken,
      organization?.name || 'ETrax',
      `${sender?.firstName} ${sender?.lastName}` || 'Administrator',
      invite.role
    );

    await this.logUserEvent('invitation_resent', invite.id, resendBy, { email, organizationId });
  }

  /**
   * Bulk import users
   */
  static async bulkImportUsers(request: BulkUserImport, importedBy: string): Promise<{
    success: number;
    failed: number;
    errors: Array<{ email: string; error: string }>;
    users: any[];
  }> {
    const { users, organizationId, sendInvites = true } = request;
    const results = {
      success: 0,
      failed: 0,
      errors: [] as Array<{ email: string; error: string }>,
      users: [] as any[]
    };

    // Verify organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId }
    });

    if (!organization) {
      throw new Error('Organization not found');
    }

    // Process each user
    for (const userData of users) {
      try {
        const user = await this.createUser({
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role || 'USER',
          organizationId,
          sendInvite: sendInvites
        }, importedBy);

        results.users.push(user);
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          email: userData.email,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    await this.logUserEvent('bulk_import', null, importedBy, {
      organizationId,
      totalUsers: users.length,
      success: results.success,
      failed: results.failed
    });

    return results;
  }

  /**
   * Get users with filtering and pagination
   */
  static async getUsers(filters: {
    organizationId?: string;
    role?: string;
    isActive?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { organizationId, role, isActive, search, page = 1, limit = 50 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (organizationId) where.organizationId = organizationId;
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              domain: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.user.count({ where })
    ]);

    return {
      users: users.map(user => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        emailVerified: user.emailVerified,
        authProvider: user.authProvider,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        organization: user.organization
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get user by ID with full details
   */
  static async getUserById(userId: string): Promise<any> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: true,
        createdByUser: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        },
        sessions: {
          select: {
            id: true,
            deviceInfo: true,
            createdAt: true,
            expiresAt: true
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      authProvider: user.authProvider,
      externalId: user.externalId,
      avatarUrl: user.avatarUrl,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      organization: user.organization,
      createdBy: user.createdByUser,
      activeSessions: user.sessions
    };
  }

  /**
   * Update user role with validation
   */
  static async updateUserRole(userId: string, newRole: string, updatedBy: string): Promise<void> {
    if (!this.DEFAULT_ROLES.includes(newRole)) {
      throw new Error(`Invalid role. Must be one of: ${this.DEFAULT_ROLES.join(', ')}`);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const oldRole = user.role;

    await prisma.user.update({
      where: { id: userId },
      data: { role: newRole }
    });

    // Revoke existing tokens to force re-authentication with new permissions
    await JWTService.revokeAllUserTokens(userId);

    await this.logUserEvent('role_changed', userId, updatedBy, {
      oldRole,
      newRole
    });
  }

  // Private helper methods

  private static generateTemporaryPassword(): string {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    return password;
  }

  private static async sendTemporaryPasswordEmail(user: any, tempPassword: string): Promise<void> {
    await EmailService.sendTemporaryPassword(
      user.email,
      user.firstName,
      tempPassword,
      user.organization?.name || 'ETrax'
    );
  }

  private static async logUserEvent(event: string, userId: string | null, performedBy: string, metadata: any): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: performedBy,
          action: `user_management.${event}`,
          resource: 'user',
          resourceId: userId,
          metadata
        }
      });
    } catch (error) {
      logger.error('Failed to log user management event:', error);
    }
  }
}