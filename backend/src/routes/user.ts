import express from 'express';
import {
  createUser,
  getUserById,
  updateUser,
  deleteUser,
  getUsersList,
  getUserStats,
  changeUserPassword,
  resetUserPassword,
  createUserSchema,
  updateUserSchema,
  userFilterSchema,
  changePasswordSchema,
  resetUserPasswordSchema,
} from '@/services/user';
import { authMiddleware } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { rateLimiter } from '@/middleware/rateLimiter';
import { ApiError } from '@/middleware/errorHandler';
import { z } from 'zod';
import { prisma } from '@/index';

const router = express.Router();

// Validation schemas for route-specific data
const userIdSchema = z.object({
  id: z.string().uuid('Invalid user ID'),
});

const bulkActionSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1, 'At least one user ID is required'),
  action: z.enum(['activate', 'deactivate', 'delete']),
});

// Apply authentication to all routes
router.use(authMiddleware);

/**
 * @route   GET /api/users
 * @desc    Get users list with filtering and pagination
 * @access  Private (Role-based access)
 */
router.get('/', rateLimiter.api, async (req, res, next) => {
  try {
    const { userId, role, schoolId, organizationId } = req.user!;
    const filters = userFilterSchema.parse(req.query);

    const result = await getUsersList(
      filters,
      userId,
      role,
      schoolId,
      organizationId
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/stats
 * @desc    Get user statistics and analytics
 * @access  Private (Admin/Manager only)
 */
router.get('/stats', rateLimiter.api, async (req, res, next) => {
  try {
    const { role, schoolId, organizationId } = req.user!;

    // Check if user has permission to view stats
    if (!['ADMIN', 'MANAGER'].includes(role)) {
      throw new ApiError('Insufficient permissions to view user statistics', 403);
    }

    const stats = await getUserStats(role, schoolId, organizationId);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', rateLimiter.api, async (req, res, next) => {
  try {
    const { userId, role, schoolId, organizationId } = req.user!;

    const user = await getUserById(
      userId,
      userId,
      role,
      schoolId,
      organizationId
    );

    res.json({
      ...user,
      password: undefined, // Never return password hash
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/users
 * @desc    Create new user
 * @access  Private (Admin/Manager only)
 */
router.post(
  '/',
  rateLimiter.api,
  validateRequest(createUserSchema),
  async (req, res, next) => {
    try {
      const { userId, role, schoolId, organizationId } = req.user!;

      // Check if user has permission to create users
      if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
        throw new ApiError('Insufficient permissions to create users', 403);
      }

      const result = await createUser(
        req.body,
        userId,
        role,
        schoolId,
        organizationId
      );

      res.status(201).json({
        message: 'User created successfully',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private (Role-based access)
 */
router.get(
  '/:id',
  rateLimiter.api,
  validateRequest(userIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { userId, role, schoolId, organizationId } = req.user!;
      const { id } = req.params;

      const user = await getUserById(
        id,
        userId,
        role,
        schoolId,
        organizationId
      );

      res.json({
        ...user,
        password: undefined, // Never return password hash
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/users/:id
 * @desc    Update user
 * @access  Private (Role-based access)
 */
router.put(
  '/:id',
  rateLimiter.api,
  validateRequest(userIdSchema, 'params'),
  validateRequest(updateUserSchema),
  async (req, res, next) => {
    try {
      const { userId, role, schoolId, organizationId } = req.user!;
      const { id } = req.params;

      // Users can update themselves, others require higher permissions
      if (id !== userId && !['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
        throw new ApiError('Insufficient permissions to update this user', 403);
      }

      const user = await updateUser(
        id,
        req.body,
        userId,
        role,
        schoolId,
        organizationId
      );

      res.json({
        message: 'User updated successfully',
        user: {
          ...user,
          password: undefined, // Never return password hash
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user (soft delete)
 * @access  Private (Admin/Manager only)
 */
router.delete(
  '/:id',
  rateLimiter.api,
  validateRequest(userIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { userId, role, schoolId, organizationId } = req.user!;
      const { id } = req.params;

      // Check if user has permission to delete users
      if (!['ADMIN', 'MANAGER'].includes(role)) {
        throw new ApiError('Insufficient permissions to delete users', 403);
      }

      const result = await deleteUser(
        id,
        userId,
        role,
        schoolId,
        organizationId
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/users/change-password
 * @desc    Change current user's password
 * @access  Private
 */
router.post(
  '/change-password',
  rateLimiter.auth, // Use stricter rate limiting for password operations
  validateRequest(changePasswordSchema),
  async (req, res, next) => {
    try {
      const { userId } = req.user!;

      const result = await changeUserPassword(userId, req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/users/:id/reset-password
 * @desc    Reset user password (admin action)
 * @access  Private (Admin/Manager only)
 */
router.post(
  '/:id/reset-password',
  rateLimiter.auth, // Use stricter rate limiting for password operations
  validateRequest(userIdSchema, 'params'),
  validateRequest(resetUserPasswordSchema),
  async (req, res, next) => {
    try {
      const { userId, role } = req.user!;
      const { id } = req.params;

      // Check if user has permission to reset passwords
      if (!['ADMIN', 'MANAGER'].includes(role)) {
        throw new ApiError('Insufficient permissions to reset user passwords', 403);
      }

      const result = await resetUserPassword(id, req.body, userId, role);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/users/:id/activity
 * @desc    Get user activity history
 * @access  Private (Role-based access)
 */
router.get(
  '/:id/activity',
  rateLimiter.api,
  validateRequest(userIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { userId, role, schoolId, organizationId } = req.user!;
      const { id } = req.params;

      // Verify user exists and requester has access
      await getUserById(id, userId, role, schoolId, organizationId);

      // Get user activity from audit logs
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: id,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 50,
      });

      // Get user's equipment transactions
      const transactions = await prisma.transaction.findMany({
        where: {
          userId: id,
        },
        include: {
          equipment: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 20,
      });

      res.json({
        auditLogs,
        transactions,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/users/bulk-action
 * @desc    Perform bulk actions on users
 * @access  Private (Admin/Manager only)
 */
router.post(
  '/bulk-action',
  rateLimiter.api,
  validateRequest(bulkActionSchema),
  async (req, res, next) => {
    try {
      const { userId, role, schoolId, organizationId } = req.user!;

      // Check if user has permission for bulk actions
      if (!['ADMIN', 'MANAGER'].includes(role)) {
        throw new ApiError('Insufficient permissions for bulk user actions', 403);
      }

      const { userIds, action } = req.body;

      let result;
      let updateData: any = {};
      let auditAction: string = '';

      switch (action) {
        case 'activate':
          updateData = { isActive: true };
          auditAction = 'BULK_ACTIVATE_USERS';
          break;
        case 'deactivate':
          updateData = { isActive: false };
          auditAction = 'BULK_DEACTIVATE_USERS';
          break;
        case 'delete':
          updateData = { isActive: false, email: prisma.$raw`CONCAT('deleted_', EXTRACT(EPOCH FROM NOW()), '_', email)` };
          auditAction = 'BULK_DELETE_USERS';
          break;
        default:
          throw new ApiError('Invalid bulk action', 400);
      }

      // Update users
      const updatedUsers = await prisma.user.updateMany({
        where: {
          id: { in: userIds },
          // Add access restrictions based on role
          ...(role === 'MANAGER' ? {
            OR: [
              { schoolId },
              { organizationId, schoolId: null },
            ],
          } : {}),
        },
        data: {
          ...updateData,
          updatedById: userId,
          updatedAt: new Date(),
        },
      });

      // Log bulk action
      await prisma.auditLog.create({
        data: {
          action: auditAction,
          entityType: 'User',
          entityId: `bulk-${Date.now()}`,
          changes: {
            userIds,
            action,
            count: updatedUsers.count,
          },
          userId,
          schoolId,
          organizationId,
        },
      });

      res.json({
        message: `Bulk ${action} completed successfully`,
        affectedUsers: updatedUsers.count,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/users/roles
 * @desc    Get available user roles
 * @access  Private
 */
router.get('/roles', rateLimiter.api, async (req, res, next) => {
  try {
    const { role } = req.user!;

    // Define role hierarchy and permissions
    const roleDefinitions = [
      {
        value: 'USER',
        label: 'User',
        description: 'Standard user with basic equipment access',
        level: 1,
        canManage: [],
      },
      {
        value: 'STAFF',
        label: 'Staff',
        description: 'Staff member with equipment management permissions',
        level: 2,
        canManage: ['USER'],
      },
      {
        value: 'MANAGER',
        label: 'Manager',
        description: 'Manager with full school management permissions',
        level: 3,
        canManage: ['USER', 'STAFF'],
      },
      {
        value: 'ADMIN',
        label: 'Administrator',
        description: 'System administrator with full access',
        level: 4,
        canManage: ['USER', 'STAFF', 'MANAGER'],
      },
    ];

    // Filter roles based on user's permission to assign them
    const currentUserLevel = roleDefinitions.find(r => r.value === role)?.level || 0;
    const availableRoles = roleDefinitions.filter(r => r.level < currentUserLevel);

    res.json({
      currentUserRole: role,
      availableRoles,
      allRoles: roleDefinitions,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/users/search
 * @desc    Advanced user search
 * @access  Private (Role-based access)
 */
const searchSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  filters: userFilterSchema.partial().optional(),
});

router.post(
  '/search',
  rateLimiter.api,
  validateRequest(searchSchema),
  async (req, res, next) => {
    try {
      const { userId, role, schoolId, organizationId } = req.user!;
      const { query, filters = {} } = req.body;

      // Combine search query with existing filters
      const searchFilters = {
        ...filters,
        search: query,
      };

      const result = await getUsersList(
        searchFilters,
        userId,
        role,
        schoolId,
        organizationId
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/users/:id/impersonate
 * @desc    Impersonate user (admin only, for support purposes)
 * @access  Private (Admin only)
 */
router.post(
  '/:id/impersonate',
  rateLimiter.auth,
  validateRequest(userIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { userId, role } = req.user!;
      const { id } = req.params;

      // Only admins can impersonate
      if (role !== 'ADMIN') {
        throw new ApiError('Only administrators can impersonate users', 403);
      }

      // Get target user
      const targetUser = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          schoolId: true,
          organizationId: true,
          isActive: true,
        },
      });

      if (!targetUser) {
        throw new ApiError('User not found', 404);
      }

      if (!targetUser.isActive) {
        throw new ApiError('Cannot impersonate inactive user', 400);
      }

      // Cannot impersonate other admins
      if (targetUser.role === 'ADMIN') {
        throw new ApiError('Cannot impersonate other administrators', 403);
      }

      // Generate impersonation token
      const jwt = await import('jsonwebtoken');
      const config = await import('@/config/environment');
      
      const impersonationPayload = {
        userId: targetUser.id,
        email: targetUser.email,
        role: targetUser.role,
        schoolId: targetUser.schoolId,
        organizationId: targetUser.organizationId,
        impersonator: userId,
        isImpersonation: true,
      };

      const impersonationToken = jwt.sign(impersonationPayload, config.config.jwt.secret, {
        expiresIn: '1h', // Short expiration for security
        issuer: 'etrax',
        audience: 'etrax-users',
        subject: targetUser.id,
      });

      // Log impersonation
      await prisma.auditLog.create({
        data: {
          action: 'IMPERSONATE_USER',
          entityType: 'User',
          entityId: targetUser.id,
          changes: {
            impersonatedBy: userId,
            targetUser: {
              id: targetUser.id,
              email: targetUser.email,
              role: targetUser.role,
            },
          },
          userId,
        },
      });

      res.json({
        message: 'Impersonation token generated',
        impersonationToken,
        targetUser: {
          id: targetUser.id,
          email: targetUser.email,
          firstName: targetUser.firstName,
          lastName: targetUser.lastName,
          role: targetUser.role,
        },
        expiresIn: 3600, // 1 hour
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;