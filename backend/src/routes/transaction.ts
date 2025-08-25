import express from 'express';
import {
  checkOutEquipment,
  checkInEquipment,
  bulkCheckOutEquipment,
  getTransactionById,
  getTransactionsList,
  getTransactionStats,
  updateTransactionStatus,
  updateOverdueTransactions,
  checkOutEquipmentSchema,
  checkInEquipmentSchema,
  bulkCheckOutSchema,
  bulkCheckInSchema,
  transactionFilterSchema,
} from '@/services/transaction';
import {
  executeStatusTransition,
  processAutomaticTransitions,
  getEquipmentWorkflowHistory,
  validateWorkflowRules,
  ALLOWED_TRANSITIONS
} from '@/services/workflow';
import { authMiddleware } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { rateLimiter } from '@/middleware/rateLimiter';
import { ApiError } from '@/middleware/errorHandler';
import { z } from 'zod';
import { prisma } from '@/index';

const router = express.Router();

// Validation schemas for route-specific data
const transactionIdSchema = z.object({
  id: z.string().uuid('Invalid transaction ID'),
});

const updateStatusSchema = z.object({
  status: z.enum(['CHECKED_IN', 'OVERDUE', 'LOST', 'DAMAGED']),
  notes: z.string().max(500, 'Notes too long').optional(),
});

const equipmentIdSchema = z.object({
  equipmentId: z.string().uuid('Invalid equipment ID'),
});

const userIdSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
});

// Apply authentication to all routes
router.use(authMiddleware);

/**
 * @route   GET /api/transactions
 * @desc    Get transactions list with filtering and pagination
 * @access  Private
 */
router.get('/', rateLimiter.api, async (req, res, next) => {
  try {
    const { schoolId, organizationId } = req.user!;
    const filters = transactionFilterSchema.parse(req.query);

    const result = await getTransactionsList(filters, schoolId!, organizationId!);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/transactions/stats
 * @desc    Get transaction statistics and analytics
 * @access  Private (Admin/Manager/Staff only)
 */
router.get('/stats', rateLimiter.api, async (req, res, next) => {
  try {
    const { role, schoolId, organizationId } = req.user!;

    // Check permissions for stats
    if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
      throw new ApiError('Insufficient permissions to view transaction statistics', 403);
    }

    const stats = await getTransactionStats(schoolId!, organizationId!);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/transactions/overdue
 * @desc    Get overdue transactions
 * @access  Private (Admin/Manager/Staff only)
 */
router.get('/overdue', rateLimiter.api, async (req, res, next) => {
  try {
    const { role, schoolId, organizationId } = req.user!;

    if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
      throw new ApiError('Insufficient permissions to view overdue transactions', 403);
    }

    const filters = { status: 'OVERDUE' as const, page: 1, limit: 100 };
    const result = await getTransactionsList(filters, schoolId!, organizationId!);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/transactions/checkout
 * @desc    Check out equipment to a user
 * @access  Private (Admin/Manager/Staff only)
 */
router.post(
  '/checkout',
  rateLimiter.api,
  validateRequest(checkOutEquipmentSchema),
  async (req, res, next) => {
    try {
      const { userId, role, schoolId, organizationId } = req.user!;

      // Check permissions for checkout
      if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
        throw new ApiError('Insufficient permissions to check out equipment', 403);
      }

      const transaction = await checkOutEquipment(
        req.body,
        userId,
        schoolId!,
        organizationId!
      );

      res.status(201).json({
        message: 'Equipment checked out successfully',
        transaction,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/transactions/checkin
 * @desc    Check in equipment from a user
 * @access  Private (Admin/Manager/Staff only)
 */
router.post(
  '/checkin',
  rateLimiter.api,
  validateRequest(checkInEquipmentSchema),
  async (req, res, next) => {
    try {
      const { userId, role, schoolId, organizationId } = req.user!;

      // Check permissions for checkin
      if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
        throw new ApiError('Insufficient permissions to check in equipment', 403);
      }

      const transaction = await checkInEquipment(
        req.body,
        userId,
        schoolId!,
        organizationId!
      );

      res.json({
        message: 'Equipment checked in successfully',
        transaction,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/transactions/bulk-checkout
 * @desc    Bulk check out multiple equipment items
 * @access  Private (Admin/Manager/Staff only)
 */
router.post(
  '/bulk-checkout',
  rateLimiter.api,
  validateRequest(bulkCheckOutSchema),
  async (req, res, next) => {
    try {
      const { userId, role, schoolId, organizationId } = req.user!;

      // Check permissions for bulk checkout
      if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
        throw new ApiError('Insufficient permissions for bulk checkout', 403);
      }

      const result = await bulkCheckOutEquipment(
        req.body,
        userId,
        schoolId!,
        organizationId!
      );

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/transactions/bulk-checkin
 * @desc    Bulk check in multiple equipment items
 * @access  Private (Admin/Manager/Staff only)
 */
router.post(
  '/bulk-checkin',
  rateLimiter.api,
  validateRequest(bulkCheckInSchema),
  async (req, res, next) => {
    try {
      const { userId, role, schoolId, organizationId } = req.user!;

      // Check permissions for bulk checkin
      if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
        throw new ApiError('Insufficient permissions for bulk checkin', 403);
      }

      const { transactionIds, condition, actualReturnLocation, notes } = req.body;

      // Process each transaction individually to maintain data integrity
      const results = [];
      const errors = [];

      for (const transactionId of transactionIds) {
        try {
          const transaction = await checkInEquipment(
            {
              transactionId,
              condition,
              actualReturnLocation,
              notes,
            },
            userId,
            schoolId!,
            organizationId!
          );
          results.push(transaction);
        } catch (error: any) {
          errors.push({
            transactionId,
            error: error.message,
          });
        }
      }

      res.json({
        message: `Processed ${results.length} items successfully, ${errors.length} errors`,
        successful: results,
        errors,
        summary: {
          totalProcessed: transactionIds.length,
          successful: results.length,
          failed: errors.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/transactions/:id
 * @desc    Get transaction by ID
 * @access  Private
 */
router.get(
  '/:id',
  rateLimiter.api,
  validateRequest(transactionIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { schoolId, organizationId } = req.user!;
      const { id } = req.params;

      const transaction = await getTransactionById(id, schoolId!, organizationId!);
      res.json(transaction);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/transactions/:id/status
 * @desc    Update transaction status
 * @access  Private (Admin/Manager/Staff only)
 */
router.put(
  '/:id/status',
  rateLimiter.api,
  validateRequest(transactionIdSchema, 'params'),
  validateRequest(updateStatusSchema),
  async (req, res, next) => {
    try {
      const { userId, role, schoolId, organizationId } = req.user!;
      const { id } = req.params;
      const { status, notes } = req.body;

      // Check permissions for status updates
      if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
        throw new ApiError('Insufficient permissions to update transaction status', 403);
      }

      const transaction = await updateTransactionStatus(
        id,
        status,
        userId,
        notes,
        schoolId!,
        organizationId!
      );

      res.json({
        message: 'Transaction status updated successfully',
        transaction,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/transactions/equipment/:equipmentId
 * @desc    Get transaction history for specific equipment
 * @access  Private
 */
router.get(
  '/equipment/:equipmentId',
  rateLimiter.api,
  validateRequest(equipmentIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { schoolId, organizationId } = req.user!;
      const { equipmentId } = req.params;

      // Verify equipment exists and user has access
      const equipment = await prisma.equipment.findFirst({
        where: {
          id: equipmentId,
          OR: [
            { schoolId },
            { organizationId, schoolId: null },
          ],
        },
      });

      if (!equipment) {
        throw new ApiError('Equipment not found or not accessible', 404);
      }

      // Get transaction history
      const transactions = await prisma.transaction.findMany({
        where: {
          equipmentId,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          checkedOutBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          checkedInBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: {
          checkedOutAt: 'desc',
        },
      });

      res.json({
        equipment: {
          id: equipment.id,
          name: equipment.name,
          code: equipment.code,
          currentStatus: equipment.status,
        },
        transactions,
        totalTransactions: transactions.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/transactions/user/:userId
 * @desc    Get transaction history for specific user
 * @access  Private (Admin/Manager/Staff or self)
 */
router.get(
  '/user/:userId',
  rateLimiter.api,
  validateRequest(userIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { userId: requesterId, role, schoolId, organizationId } = req.user!;
      const { userId } = req.params;

      // Check if user can view this user's transactions
      const canView = userId === requesterId || ['ADMIN', 'MANAGER', 'STAFF'].includes(role);
      if (!canView) {
        throw new ApiError('Insufficient permissions to view user transactions', 403);
      }

      // Get user transactions
      const transactions = await prisma.transaction.findMany({
        where: {
          userId,
          OR: [
            { schoolId },
            { organizationId, schoolId: null },
          ],
        },
        include: {
          equipment: {
            select: {
              id: true,
              name: true,
              code: true,
              category: {
                select: {
                  name: true,
                  code: true,
                },
              },
            },
          },
          checkedOutBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          checkedInBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: {
          checkedOutAt: 'desc',
        },
      });

      // Get user info
      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          OR: [
            { schoolId },
            { organizationId, schoolId: null },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      });

      if (!user) {
        throw new ApiError('User not found or not accessible', 404);
      }

      // Calculate user statistics
      const stats = {
        totalTransactions: transactions.length,
        currentlyCheckedOut: transactions.filter(t => t.status === 'CHECKED_OUT').length,
        overdue: transactions.filter(t => t.status === 'OVERDUE').length,
        totalDamageReports: transactions.filter(t => t.damageReport && Object.keys(t.damageReport).length > 0).length,
      };

      res.json({
        user,
        transactions,
        stats,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/transactions/update-overdue
 * @desc    Manually trigger overdue transaction update
 * @access  Private (Admin/Manager only)
 */
router.post('/update-overdue', rateLimiter.api, async (req, res, next) => {
  try {
    const { role } = req.user!;

    // Check permissions for overdue updates
    if (!['ADMIN', 'MANAGER'].includes(role)) {
      throw new ApiError('Insufficient permissions to update overdue transactions', 403);
    }

    const result = await updateOverdueTransactions();
    res.json({
      message: `Updated ${result.updated} overdue transactions`,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/transactions/my/current
 * @desc    Get current user's active transactions
 * @access  Private
 */
router.get('/my/current', rateLimiter.api, async (req, res, next) => {
  try {
    const { userId, schoolId, organizationId } = req.user!;

    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        status: {
          in: ['CHECKED_OUT', 'OVERDUE'],
        },
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
      include: {
        equipment: {
          include: {
            category: {
              select: {
                name: true,
                code: true,
              },
            },
            location: {
              select: {
                name: true,
                code: true,
              },
            },
          },
        },
        checkedOutBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: {
        dueDate: 'asc',
      },
    });

    // Add computed fields
    const enrichedTransactions = transactions.map(transaction => ({
      ...transaction,
      isOverdue: transaction.status === 'OVERDUE' || new Date() > transaction.dueDate,
      daysOverdue: Math.max(0, Math.ceil((Date.now() - transaction.dueDate.getTime()) / (1000 * 60 * 60 * 24))),
    }));

    res.json({
      transactions: enrichedTransactions,
      summary: {
        totalActive: transactions.length,
        overdue: enrichedTransactions.filter(t => t.isOverdue).length,
        dueSoon: enrichedTransactions.filter(t => !t.isOverdue && 
          Math.ceil((t.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) <= 3
        ).length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/transactions/search
 * @desc    Advanced transaction search
 * @access  Private
 */
const searchSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  filters: transactionFilterSchema.partial().optional(),
});

router.post(
  '/search',
  rateLimiter.api,
  validateRequest(searchSchema),
  async (req, res, next) => {
    try {
      const { schoolId, organizationId } = req.user!;
      const { query, filters = {} } = req.body;

      // Extended search across equipment name, user name, notes
      const searchTransactions = await prisma.transaction.findMany({
        where: {
          ...filters,
          OR: [
            { notes: { contains: query, mode: 'insensitive' } },
            { returnNotes: { contains: query, mode: 'insensitive' } },
            { checkoutLocation: { contains: query, mode: 'insensitive' } },
            { actualReturnLocation: { contains: query, mode: 'insensitive' } },
            { equipment: { name: { contains: query, mode: 'insensitive' } } },
            { equipment: { code: { contains: query, mode: 'insensitive' } } },
            { user: { firstName: { contains: query, mode: 'insensitive' } } },
            { user: { lastName: { contains: query, mode: 'insensitive' } } },
            { user: { email: { contains: query, mode: 'insensitive' } } },
          ],
          AND: {
            OR: [
              { schoolId },
              { organizationId, schoolId: null },
            ],
          },
        },
        include: {
          equipment: {
            include: {
              category: {
                select: {
                  name: true,
                  code: true,
                },
              },
              location: {
                select: {
                  name: true,
                  code: true,
                },
              },
            },
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          checkedOutBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: {
          checkedOutAt: 'desc',
        },
        take: 50,
      });

      res.json({
        query,
        transactions: searchTransactions,
        total: searchTransactions.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Workflow management routes

const statusTransitionSchema = z.object({
  newStatus: z.enum(['AVAILABLE', 'CHECKED_OUT', 'MAINTENANCE', 'DAMAGED', 'LOST', 'RETIRED', 'RESERVED', 'OVERDUE']),
  reason: z.string().max(500, 'Reason too long').optional(),
  metadata: z.record(z.any()).optional(),
});

/**
 * @route   POST /api/transactions/workflow/status/:equipmentId
 * @desc    Execute status transition using workflow engine
 * @access  Private (Admin/Manager/Staff only)
 */
router.post(
  '/workflow/status/:equipmentId',
  rateLimiter.api,
  validateRequest(equipmentIdSchema, 'params'),
  validateRequest(statusTransitionSchema),
  async (req, res, next) => {
    try {
      const { userId, role, schoolId, organizationId } = req.user!;
      const { equipmentId } = req.params;
      const { newStatus, reason, metadata } = req.body;

      // Check permissions for status changes
      if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
        throw new ApiError('Insufficient permissions to change equipment status', 403);
      }

      const result = await executeStatusTransition(equipmentId, newStatus, {
        equipmentId,
        userId,
        schoolId: schoolId!,
        organizationId: organizationId!,
        reason,
        metadata,
      });

      if (!result.success) {
        throw new ApiError(result.message, 400);
      }

      res.json({
        message: result.message,
        newStatus: result.newStatus,
        requiresApproval: result.requiresApproval,
        notifications: result.notifications,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/transactions/workflow/transitions
 * @desc    Get allowed status transitions
 * @access  Private
 */
router.get('/workflow/transitions', rateLimiter.api, async (req, res, next) => {
  try {
    res.json({
      allowedTransitions: ALLOWED_TRANSITIONS,
      rules: {
        overdueThresholdHours: 72,
        maintenanceDueDays: 30,
        lostThresholdDays: 14,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/transactions/workflow/history/:equipmentId
 * @desc    Get workflow history for equipment
 * @access  Private
 */
router.get(
  '/workflow/history/:equipmentId',
  rateLimiter.api,
  validateRequest(equipmentIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { schoolId, organizationId } = req.user!;
      const { equipmentId } = req.params;

      const history = await getEquipmentWorkflowHistory(equipmentId, schoolId!, organizationId!);

      res.json({
        equipmentId,
        workflowHistory: history,
        total: history.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/transactions/workflow/auto-process
 * @desc    Manually trigger automatic workflow processing
 * @access  Private (Admin/Manager only)
 */
router.post('/workflow/auto-process', rateLimiter.api, async (req, res, next) => {
  try {
    const { role, schoolId, organizationId } = req.user!;

    // Check permissions for workflow automation
    if (!['ADMIN', 'MANAGER'].includes(role)) {
      throw new ApiError('Insufficient permissions to trigger automatic workflows', 403);
    }

    const result = await processAutomaticTransitions(schoolId!, organizationId!);

    res.json({
      message: 'Automatic workflow processing completed',
      result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/transactions/workflow/validate
 * @desc    Validate workflow rules configuration
 * @access  Private (Admin only)
 */
router.get('/workflow/validate', rateLimiter.api, async (req, res, next) => {
  try {
    const { role } = req.user!;

    // Check permissions for workflow validation
    if (role !== 'ADMIN') {
      throw new ApiError('Insufficient permissions to validate workflow rules', 403);
    }

    const validation = validateWorkflowRules();

    res.json({
      isValid: validation.isValid,
      errors: validation.errors,
      totalTransitions: Object.values(ALLOWED_TRANSITIONS).flat().length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;