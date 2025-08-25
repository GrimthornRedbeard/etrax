import { prisma } from '@/index';
import { ApiError } from '@/middleware/errorHandler';
import { z } from 'zod';
import { hashPassword } from '@/services/auth';
import { logger } from '@/utils/logger';

// Validation schemas
export const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  firstName: z.string().min(1, 'First name is required').max(50, 'First name too long'),
  lastName: z.string().min(1, 'Last name is required').max(50, 'Last name too long'),
  phone: z.string().optional(),
  role: z.enum(['USER', 'STAFF', 'MANAGER', 'ADMIN']).default('USER'),
  schoolId: z.string().uuid('Invalid school ID').optional(),
  organizationId: z.string().uuid('Invalid organization ID').optional(),
  isActive: z.boolean().default(true),
  sendInvite: z.boolean().default(true),
  permissions: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50, 'First name too long').optional(),
  lastName: z.string().min(1, 'Last name is required').max(50, 'Last name too long').optional(),
  phone: z.string().optional(),
  role: z.enum(['USER', 'STAFF', 'MANAGER', 'ADMIN']).optional(),
  isActive: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  permissions: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const userFilterSchema = z.object({
  search: z.string().optional(),
  role: z.enum(['USER', 'STAFF', 'MANAGER', 'ADMIN']).optional(),
  isActive: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  schoolId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  lastLoginFrom: z.string().datetime().optional(),
  lastLoginTo: z.string().datetime().optional(),
  includeInactive: z.boolean().default(false),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['firstName', 'lastName', 'email', 'createdAt', 'lastLoginAt', 'role']).default('lastName'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
           'Password must contain uppercase, lowercase, number, and special character'),
});

export const resetUserPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
           'Password must contain uppercase, lowercase, number, and special character'),
  sendNotification: z.boolean().default(true),
});

// Role hierarchy for permission checking
const ROLE_HIERARCHY = {
  'ADMIN': 4,
  'MANAGER': 3,
  'STAFF': 2,
  'USER': 1,
};

// Create user
export const createUser = async (
  data: z.infer<typeof createUserSchema>,
  creatorId: string,
  creatorRole: string,
  creatorSchoolId?: string,
  creatorOrganizationId?: string
) => {
  const validatedData = createUserSchema.parse(data);

  // Check if creator has permission to create users with this role
  if (!canManageRole(creatorRole, validatedData.role)) {
    throw new ApiError('Insufficient permissions to create user with this role', 403);
  }

  // Check if email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: validatedData.email.toLowerCase() },
  });

  if (existingUser) {
    throw new ApiError('User with this email already exists', 409);
  }

  // Validate school/organization access
  if (validatedData.schoolId) {
    const school = await prisma.school.findFirst({
      where: {
        id: validatedData.schoolId,
        OR: [
          { id: creatorSchoolId },
          { organizationId: creatorOrganizationId },
        ],
      },
    });

    if (!school) {
      throw new ApiError('School not found or not accessible', 404);
    }

    // Set organization from school if not provided
    if (!validatedData.organizationId) {
      validatedData.organizationId = school.organizationId;
    }
  }

  // Generate temporary password
  const tempPassword = generateTempPassword();
  const hashedPassword = await hashPassword(tempPassword);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: validatedData.email.toLowerCase(),
      password: hashedPassword,
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
      phone: validatedData.phone,
      role: validatedData.role,
      schoolId: validatedData.schoolId,
      organizationId: validatedData.organizationId,
      isActive: validatedData.isActive,
      emailVerified: false,
      permissions: validatedData.permissions || [],
      metadata: validatedData.metadata || {},
      createdById: creatorId,
      updatedById: creatorId,
    },
    include: {
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  // Send invitation email if requested
  if (validatedData.sendInvite) {
    try {
      await sendUserInvitation(user, tempPassword);
    } catch (error) {
      logger.error('Failed to send user invitation email', {
        userId: user.id,
        email: user.email,
        error,
      });
      // Don't fail user creation if email fails
    }
  }

  // Log user creation
  await prisma.auditLog.create({
    data: {
      action: 'CREATE_USER',
      entityType: 'User',
      entityId: user.id,
      changes: {
        created: {
          email: user.email,
          role: user.role,
          schoolId: user.schoolId,
          organizationId: user.organizationId,
        },
      },
      userId: creatorId,
      schoolId: creatorSchoolId,
      organizationId: creatorOrganizationId,
    },
  });

  logger.info('User created successfully', {
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    creatorId,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      schoolId: user.schoolId,
      organizationId: user.organizationId,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      school: user.school,
      organization: user.organization,
      createdBy: user.createdBy,
    },
    tempPassword: validatedData.sendInvite ? undefined : tempPassword, // Only return if not sending invite
  };
};

// Get user by ID
export const getUserById = async (
  userId: string,
  requesterId: string,
  requesterRole: string,
  requesterSchoolId?: string,
  requesterOrganizationId?: string
) => {
  // Build access conditions based on requester's role and scope
  const accessConditions = buildUserAccessConditions(
    requesterRole,
    requesterId,
    requesterSchoolId,
    requesterOrganizationId
  );

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      ...accessConditions,
    },
    include: {
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      updatedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      _count: {
        select: {
          createdEquipment: true,
          transactions: true,
        },
      },
    },
  });

  if (!user) {
    throw new ApiError('User not found or not accessible', 404);
  }

  return user;
};

// Update user
export const updateUser = async (
  userId: string,
  data: z.infer<typeof updateUserSchema>,
  updaterId: string,
  updaterRole: string,
  updaterSchoolId?: string,
  updaterOrganizationId?: string
) => {
  const validatedData = updateUserSchema.parse(data);

  // Get existing user to check permissions
  const existingUser = await getUserById(
    userId,
    updaterId,
    updaterRole,
    updaterSchoolId,
    updaterOrganizationId
  );

  // Check if updater has permission to update this user's role
  if (validatedData.role && validatedData.role !== existingUser.role) {
    if (!canManageRole(updaterRole, validatedData.role) || !canManageRole(updaterRole, existingUser.role)) {
      throw new ApiError('Insufficient permissions to change user role', 403);
    }
  }

  // Track changes for audit log
  const changes: Record<string, any> = {};
  Object.keys(validatedData).forEach(key => {
    const oldValue = (existingUser as any)[key];
    const newValue = (validatedData as any)[key];
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes[key] = { from: oldValue, to: newValue };
    }
  });

  // Update user
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...validatedData,
      updatedById: updaterId,
      updatedAt: new Date(),
    },
    include: {
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
      updatedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  // Log user update if there were changes
  if (Object.keys(changes).length > 0) {
    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_USER',
        entityType: 'User',
        entityId: userId,
        changes,
        userId: updaterId,
        schoolId: updaterSchoolId,
        organizationId: updaterOrganizationId,
      },
    });

    logger.info('User updated successfully', {
      userId,
      changes: Object.keys(changes),
      updaterId,
    });
  }

  return updatedUser;
};

// Delete user (soft delete)
export const deleteUser = async (
  userId: string,
  deleterId: string,
  deleterRole: string,
  deleterSchoolId?: string,
  deleterOrganizationId?: string
) => {
  // Get user to check permissions and ensure they exist
  const user = await getUserById(
    userId,
    deleterId,
    deleterRole,
    deleterSchoolId,
    deleterOrganizationId
  );

  // Check if deleter has permission to delete this user
  if (!canManageRole(deleterRole, user.role)) {
    throw new ApiError('Insufficient permissions to delete this user', 403);
  }

  // Prevent self-deletion
  if (userId === deleterId) {
    throw new ApiError('Cannot delete your own account', 400);
  }

  // Check if user has any active transactions
  const activeTransactions = await prisma.transaction.count({
    where: {
      userId,
      status: {
        in: ['CHECKED_OUT', 'OVERDUE'],
      },
    },
  });

  if (activeTransactions > 0) {
    throw new ApiError('Cannot delete user with active equipment transactions', 400);
  }

  // Soft delete user
  const deletedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      isActive: false,
      email: `deleted_${Date.now()}_${user.email}`, // Prevent email conflicts
      updatedById: deleterId,
      updatedAt: new Date(),
    },
  });

  // Log user deletion
  await prisma.auditLog.create({
    data: {
      action: 'DELETE_USER',
      entityType: 'User',
      entityId: userId,
      changes: {
        deleted: {
          email: user.email,
          role: user.role,
          reason: 'User deleted by administrator',
        },
      },
      userId: deleterId,
      schoolId: deleterSchoolId,
      organizationId: deleterOrganizationId,
    },
  });

  logger.info('User deleted successfully', {
    userId,
    userEmail: user.email,
    deleterId,
  });

  return { message: 'User deleted successfully' };
};

// Get users list with filtering and pagination
export const getUsersList = async (
  filters: z.infer<typeof userFilterSchema>,
  requesterId: string,
  requesterRole: string,
  requesterSchoolId?: string,
  requesterOrganizationId?: string
) => {
  const validatedFilters = userFilterSchema.parse(filters);

  // Build base access conditions
  const baseConditions = buildUserAccessConditions(
    requesterRole,
    requesterId,
    requesterSchoolId,
    requesterOrganizationId
  );

  // Build where clause with filters
  const where: any = {
    ...baseConditions,
  };

  if (!validatedFilters.includeInactive) {
    where.isActive = true;
  }

  if (validatedFilters.isActive !== undefined) {
    where.isActive = validatedFilters.isActive;
  }

  if (validatedFilters.emailVerified !== undefined) {
    where.emailVerified = validatedFilters.emailVerified;
  }

  if (validatedFilters.role) {
    where.role = validatedFilters.role;
  }

  if (validatedFilters.schoolId) {
    where.schoolId = validatedFilters.schoolId;
  }

  if (validatedFilters.organizationId) {
    where.organizationId = validatedFilters.organizationId;
  }

  if (validatedFilters.search) {
    where.OR = [
      { firstName: { contains: validatedFilters.search, mode: 'insensitive' } },
      { lastName: { contains: validatedFilters.search, mode: 'insensitive' } },
      { email: { contains: validatedFilters.search, mode: 'insensitive' } },
      { phone: { contains: validatedFilters.search, mode: 'insensitive' } },
    ];
  }

  if (validatedFilters.createdFrom || validatedFilters.createdTo) {
    where.createdAt = {};
    if (validatedFilters.createdFrom) {
      where.createdAt.gte = new Date(validatedFilters.createdFrom);
    }
    if (validatedFilters.createdTo) {
      where.createdAt.lte = new Date(validatedFilters.createdTo);
    }
  }

  if (validatedFilters.lastLoginFrom || validatedFilters.lastLoginTo) {
    where.lastLoginAt = {};
    if (validatedFilters.lastLoginFrom) {
      where.lastLoginAt.gte = new Date(validatedFilters.lastLoginFrom);
    }
    if (validatedFilters.lastLoginTo) {
      where.lastLoginAt.lte = new Date(validatedFilters.lastLoginTo);
    }
  }

  // Calculate pagination
  const skip = (validatedFilters.page - 1) * validatedFilters.limit;

  // Build order by
  const orderBy: any = {};
  orderBy[validatedFilters.sortBy] = validatedFilters.sortOrder;

  // Execute query
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        school: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            createdEquipment: true,
            transactions: true,
          },
        },
      },
      orderBy,
      skip,
      take: validatedFilters.limit,
    }),
    prisma.user.count({ where }),
  ]);

  const totalPages = Math.ceil(total / validatedFilters.limit);

  return {
    users: users.map(user => ({
      ...user,
      password: undefined, // Never return password hash
    })),
    pagination: {
      page: validatedFilters.page,
      limit: validatedFilters.limit,
      total,
      totalPages,
      hasNext: validatedFilters.page < totalPages,
      hasPrev: validatedFilters.page > 1,
    },
    filters: validatedFilters,
  };
};

// Get user statistics
export const getUserStats = async (
  requesterRole: string,
  requesterSchoolId?: string,
  requesterOrganizationId?: string
) => {
  // Build access conditions
  const accessConditions = buildUserAccessConditions(
    requesterRole,
    'stats', // dummy ID for stats
    requesterSchoolId,
    requesterOrganizationId
  );

  const [
    totalUsers,
    activeUsers,
    usersByRole,
    recentUsers,
    loginStats,
  ] = await Promise.all([
    // Total users count
    prisma.user.count({
      where: accessConditions,
    }),
    // Active users count
    prisma.user.count({
      where: {
        ...accessConditions,
        isActive: true,
      },
    }),
    // Users by role
    prisma.user.groupBy({
      by: ['role'],
      where: {
        ...accessConditions,
        isActive: true,
      },
      _count: {
        id: true,
      },
    }),
    // Recent users
    prisma.user.findMany({
      where: {
        ...accessConditions,
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    }),
    // Login statistics
    prisma.user.aggregate({
      where: {
        ...accessConditions,
        isActive: true,
        lastLoginAt: { not: null },
      },
      _count: {
        lastLoginAt: true,
      },
    }),
  ]);

  return {
    overview: {
      totalUsers,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
      usersWithRecentLogin: loginStats._count.lastLoginAt,
    },
    roleBreakdown: usersByRole.map(role => ({
      role: role.role,
      count: role._count.id,
    })),
    recentUsers,
  };
};

// Change user password (self-service)
export const changeUserPassword = async (
  userId: string,
  data: z.infer<typeof changePasswordSchema>
) => {
  const validatedData = changePasswordSchema.parse(data);

  // Get user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true, email: true, firstName: true },
  });

  if (!user) {
    throw new ApiError('User not found', 404);
  }

  // Verify current password
  const bcrypt = await import('bcryptjs');
  const isCurrentPasswordValid = await bcrypt.compare(validatedData.currentPassword, user.password);

  if (!isCurrentPasswordValid) {
    throw new ApiError('Current password is incorrect', 400);
  }

  // Hash new password
  const hashedNewPassword = await hashPassword(validatedData.newPassword);

  // Update password
  await prisma.user.update({
    where: { id: userId },
    data: {
      password: hashedNewPassword,
      updatedAt: new Date(),
    },
  });

  // Log password change
  await prisma.auditLog.create({
    data: {
      action: 'CHANGE_PASSWORD',
      entityType: 'User',
      entityId: userId,
      changes: {
        passwordChanged: true,
        timestamp: new Date().toISOString(),
      },
      userId,
    },
  });

  logger.info('User password changed successfully', {
    userId,
    userEmail: user.email,
  });

  return { message: 'Password changed successfully' };
};

// Reset user password (admin action)
export const resetUserPassword = async (
  userId: string,
  data: z.infer<typeof resetUserPasswordSchema>,
  adminId: string,
  adminRole: string
) => {
  const validatedData = resetUserPasswordSchema.parse(data);

  // Get user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, role: true },
  });

  if (!user) {
    throw new ApiError('User not found', 404);
  }

  // Check if admin has permission to reset this user's password
  if (!canManageRole(adminRole, user.role)) {
    throw new ApiError('Insufficient permissions to reset this user\'s password', 403);
  }

  // Hash new password
  const hashedNewPassword = await hashPassword(validatedData.newPassword);

  // Update password
  await prisma.user.update({
    where: { id: userId },
    data: {
      password: hashedNewPassword,
      updatedAt: new Date(),
    },
  });

  // Send notification if requested
  if (validatedData.sendNotification) {
    try {
      await sendPasswordResetNotification(user, validatedData.newPassword);
    } catch (error) {
      logger.error('Failed to send password reset notification', {
        userId,
        error,
      });
      // Don't fail the operation if email fails
    }
  }

  // Log password reset
  await prisma.auditLog.create({
    data: {
      action: 'RESET_USER_PASSWORD',
      entityType: 'User',
      entityId: userId,
      changes: {
        passwordReset: true,
        resetBy: adminId,
        timestamp: new Date().toISOString(),
      },
      userId: adminId,
    },
  });

  logger.info('User password reset by admin', {
    userId,
    userEmail: user.email,
    adminId,
  });

  return { 
    message: 'Password reset successfully',
    newPassword: validatedData.sendNotification ? undefined : validatedData.newPassword,
  };
};

// Helper functions
const canManageRole = (managerRole: string, targetRole: string): boolean => {
  const managerLevel = ROLE_HIERARCHY[managerRole as keyof typeof ROLE_HIERARCHY] || 0;
  const targetLevel = ROLE_HIERARCHY[targetRole as keyof typeof ROLE_HIERARCHY] || 0;
  
  return managerLevel > targetLevel;
};

const buildUserAccessConditions = (
  requesterRole: string,
  requesterId: string,
  requesterSchoolId?: string,
  requesterOrganizationId?: string
) => {
  // Admins can see all users in their organization
  if (requesterRole === 'ADMIN') {
    return requesterOrganizationId ? {
      organizationId: requesterOrganizationId,
    } : {};
  }

  // Managers can see users in their school and organization
  if (requesterRole === 'MANAGER') {
    return {
      OR: [
        { schoolId: requesterSchoolId },
        { organizationId: requesterOrganizationId, schoolId: null },
      ],
    };
  }

  // Staff can see users in their school
  if (requesterRole === 'STAFF') {
    return {
      schoolId: requesterSchoolId,
    };
  }

  // Regular users can only see themselves
  return {
    id: requesterId,
  };
};

const generateTempPassword = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@$!%*?&';
  const length = 12;
  let password = '';
  
  // Ensure password meets complexity requirements
  password += 'A'; // Uppercase
  password += 'a'; // Lowercase
  password += '1'; // Number
  password += '@'; // Special character
  
  // Fill remaining length with random chars
  for (let i = 4; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

const sendUserInvitation = async (user: any, tempPassword: string) => {
  // This would integrate with your email service
  // For now, just log that invitation should be sent
  logger.info('User invitation should be sent', {
    userId: user.id,
    email: user.email,
    tempPassword: '***hidden***',
  });
  
  // TODO: Implement actual email sending
  return Promise.resolve();
};

const sendPasswordResetNotification = async (user: any, newPassword: string) => {
  // This would integrate with your email service
  // For now, just log that notification should be sent
  logger.info('Password reset notification should be sent', {
    userId: user.id,
    email: user.email,
    newPassword: '***hidden***',
  });
  
  // TODO: Implement actual email sending
  return Promise.resolve();
};