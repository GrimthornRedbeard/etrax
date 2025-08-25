import { prisma } from '@/index';
import { ApiError } from '@/middleware/errorHandler';
import { z } from 'zod';
import { logger } from '@/utils/logger';
import { addDays, addHours, isBefore, isAfter } from 'date-fns';

// Validation schemas
export const checkOutEquipmentSchema = z.object({
  equipmentId: z.string().uuid('Invalid equipment ID'),
  userId: z.string().uuid('Invalid user ID').optional(), // Optional for staff checking out to users
  dueDate: z.string().datetime().optional(),
  notes: z.string().max(500, 'Notes too long').optional(),
  expectedReturnDate: z.string().datetime().optional(),
  checkoutLocation: z.string().max(100, 'Location name too long').optional(),
});

export const checkInEquipmentSchema = z.object({
  transactionId: z.string().uuid('Invalid transaction ID'),
  condition: z.enum(['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED', 'NEEDS_REPAIR']).optional(),
  actualReturnLocation: z.string().max(100, 'Location name too long').optional(),
  notes: z.string().max(500, 'Notes too long').optional(),
  maintenanceRequired: z.boolean().default(false),
  damageReport: z.object({
    severity: z.enum(['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL']),
    description: z.string().min(1, 'Damage description required'),
    photos: z.array(z.string()).optional(),
    estimatedRepairCost: z.number().positive().optional(),
    repairRequired: z.boolean().default(true),
  }).optional(),
});

export const bulkCheckOutSchema = z.object({
  equipmentIds: z.array(z.string().uuid()).min(1, 'At least one equipment ID required').max(50, 'Maximum 50 items per bulk operation'),
  userId: z.string().uuid('Invalid user ID').optional(),
  dueDate: z.string().datetime().optional(),
  notes: z.string().max(500, 'Notes too long').optional(),
  expectedReturnDate: z.string().datetime().optional(),
  checkoutLocation: z.string().max(100, 'Location name too long').optional(),
});

export const bulkCheckInSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1, 'At least one transaction ID required').max(50, 'Maximum 50 items per bulk operation'),
  condition: z.enum(['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED', 'NEEDS_REPAIR']).optional(),
  actualReturnLocation: z.string().max(100, 'Location name too long').optional(),
  notes: z.string().max(500, 'Notes too long').optional(),
});

export const transactionFilterSchema = z.object({
  status: z.enum(['CHECKED_OUT', 'CHECKED_IN', 'OVERDUE', 'LOST', 'DAMAGED']).optional(),
  userId: z.string().uuid().optional(),
  equipmentId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  checkedOutBy: z.string().uuid().optional(),
  dueDateFrom: z.string().datetime().optional(),
  dueDateTo: z.string().datetime().optional(),
  checkedOutFrom: z.string().datetime().optional(),
  checkedOutTo: z.string().datetime().optional(),
  isOverdue: z.boolean().optional(),
  needsMaintenance: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['checkedOutAt', 'dueDate', 'checkedInAt', 'equipmentName', 'userName']).default('checkedOutAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Transaction status workflow
export const TRANSACTION_STATUS_FLOW = {
  CHECKED_OUT: ['CHECKED_IN', 'OVERDUE', 'LOST', 'DAMAGED'],
  CHECKED_IN: [], // Final state
  OVERDUE: ['CHECKED_IN', 'LOST', 'DAMAGED'],
  LOST: ['CHECKED_IN'], // Can be found
  DAMAGED: ['CHECKED_IN'], // After repair
};

// Default due date calculation (7 days from checkout)
const getDefaultDueDate = (): Date => {
  return addDays(new Date(), 7);
};

// Check if transaction is overdue
const isTransactionOverdue = (dueDate: Date): boolean => {
  return isBefore(dueDate, new Date());
};

// Check out equipment
export const checkOutEquipment = async (
  data: z.infer<typeof checkOutEquipmentSchema>,
  checkedOutById: string,
  schoolId: string,
  organizationId: string
) => {
  const validatedData = checkOutEquipmentSchema.parse(data);

  // Get equipment and verify availability
  const equipment = await prisma.equipment.findFirst({
    where: {
      id: validatedData.equipmentId,
      isDeleted: false,
      OR: [
        { schoolId },
        { organizationId, schoolId: null },
      ],
    },
    include: {
      category: true,
      location: true,
      transactions: {
        where: {
          status: {
            in: ['CHECKED_OUT', 'OVERDUE'],
          },
        },
      },
    },
  });

  if (!equipment) {
    throw new ApiError('Equipment not found or not accessible', 404);
  }

  if (equipment.status !== 'AVAILABLE') {
    throw new ApiError(`Equipment is not available (current status: ${equipment.status})`, 400);
  }

  if (equipment.transactions.length > 0) {
    throw new ApiError('Equipment is already checked out', 400);
  }

  // If userId is provided, verify user exists and has access
  let targetUser = null;
  if (validatedData.userId) {
    targetUser = await prisma.user.findFirst({
      where: {
        id: validatedData.userId,
        isActive: true,
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    });

    if (!targetUser) {
      throw new ApiError('Target user not found or not accessible', 404);
    }
  }

  // Calculate due date
  const dueDate = validatedData.dueDate 
    ? new Date(validatedData.dueDate)
    : validatedData.expectedReturnDate
    ? new Date(validatedData.expectedReturnDate)
    : getDefaultDueDate();

  // Create transaction
  const transaction = await prisma.transaction.create({
    data: {
      equipmentId: validatedData.equipmentId,
      userId: validatedData.userId || checkedOutById, // If no target user, assign to checker
      checkedOutById,
      status: 'CHECKED_OUT',
      checkedOutAt: new Date(),
      dueDate,
      expectedReturnDate: validatedData.expectedReturnDate ? new Date(validatedData.expectedReturnDate) : dueDate,
      checkoutLocation: validatedData.checkoutLocation,
      notes: validatedData.notes,
      schoolId,
      organizationId,
      metadata: {},
    },
    include: {
      equipment: {
        include: {
          category: true,
          location: true,
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
  });

  // Update equipment status
  await prisma.equipment.update({
    where: { id: validatedData.equipmentId },
    data: {
      status: 'CHECKED_OUT',
      updatedAt: new Date(),
    },
  });

  // Log transaction in audit log
  await prisma.auditLog.create({
    data: {
      action: 'CHECK_OUT_EQUIPMENT',
      entityType: 'Transaction',
      entityId: transaction.id,
      changes: {
        equipmentId: validatedData.equipmentId,
        equipmentName: equipment.name,
        userId: validatedData.userId || checkedOutById,
        targetUserName: targetUser ? `${targetUser.firstName} ${targetUser.lastName}` : null,
        dueDate: dueDate.toISOString(),
        checkoutLocation: validatedData.checkoutLocation,
      },
      userId: checkedOutById,
      schoolId,
      organizationId,
    },
  });

  logger.info('Equipment checked out successfully', {
    transactionId: transaction.id,
    equipmentId: validatedData.equipmentId,
    equipmentName: equipment.name,
    userId: validatedData.userId,
    checkedOutById,
    dueDate,
  });

  return transaction;
};

// Check in equipment
export const checkInEquipment = async (
  data: z.infer<typeof checkInEquipmentSchema>,
  checkedInById: string,
  schoolId: string,
  organizationId: string
) => {
  const validatedData = checkInEquipmentSchema.parse(data);

  // Get transaction and verify it's active
  const transaction = await prisma.transaction.findFirst({
    where: {
      id: validatedData.transactionId,
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
          category: true,
          location: true,
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
  });

  if (!transaction) {
    throw new ApiError('Transaction not found or equipment not checked out', 404);
  }

  const wasOverdue = isTransactionOverdue(transaction.dueDate);
  const checkedInAt = new Date();
  let equipmentStatus: string = 'AVAILABLE';

  // Determine equipment status after check-in
  if (validatedData.condition) {
    if (['DAMAGED', 'NEEDS_REPAIR'].includes(validatedData.condition) || validatedData.maintenanceRequired) {
      equipmentStatus = 'MAINTENANCE';
    } else if (validatedData.condition === 'POOR') {
      equipmentStatus = 'MAINTENANCE';
    }
  }

  // Update transaction
  const updatedTransaction = await prisma.transaction.update({
    where: { id: validatedData.transactionId },
    data: {
      status: 'CHECKED_IN',
      checkedInAt,
      checkedInById,
      actualReturnLocation: validatedData.actualReturnLocation,
      returnNotes: validatedData.notes,
      returnCondition: validatedData.condition,
      wasOverdue,
      maintenanceRequired: validatedData.maintenanceRequired,
      damageReport: validatedData.damageReport || {},
      metadata: {
        ...transaction.metadata,
        checkInProcessedAt: checkedInAt.toISOString(),
        checkInProcessedBy: checkedInById,
      },
    },
    include: {
      equipment: {
        include: {
          category: true,
          location: true,
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
      checkedInBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  // Update equipment status and condition
  const equipmentUpdateData: any = {
    status: equipmentStatus,
    updatedAt: checkedInAt,
  };

  if (validatedData.condition) {
    equipmentUpdateData.condition = validatedData.condition;
  }

  await prisma.equipment.update({
    where: { id: transaction.equipmentId },
    data: equipmentUpdateData,
  });

  // Create maintenance request if needed
  if (equipmentStatus === 'MAINTENANCE') {
    await createMaintenanceRequest(
      transaction.equipmentId,
      validatedData.damageReport?.description || 'Equipment requires maintenance after return',
      validatedData.damageReport?.severity || 'MODERATE',
      checkedInById,
      schoolId,
      organizationId
    );
  }

  // Log transaction in audit log
  await prisma.auditLog.create({
    data: {
      action: 'CHECK_IN_EQUIPMENT',
      entityType: 'Transaction',
      entityId: updatedTransaction.id,
      changes: {
        equipmentId: transaction.equipmentId,
        equipmentName: transaction.equipment.name,
        userId: transaction.userId,
        checkedInAt: checkedInAt.toISOString(),
        wasOverdue,
        returnCondition: validatedData.condition,
        equipmentNewStatus: equipmentStatus,
        maintenanceRequired: validatedData.maintenanceRequired,
        damageReport: validatedData.damageReport,
      },
      userId: checkedInById,
      schoolId,
      organizationId,
    },
  });

  logger.info('Equipment checked in successfully', {
    transactionId: updatedTransaction.id,
    equipmentId: transaction.equipmentId,
    equipmentName: transaction.equipment.name,
    userId: transaction.userId,
    checkedInById,
    wasOverdue,
    equipmentStatus,
  });

  return updatedTransaction;
};

// Helper function to create maintenance request
const createMaintenanceRequest = async (
  equipmentId: string,
  description: string,
  severity: string,
  requestedById: string,
  schoolId: string,
  organizationId: string
) => {
  // This would create a maintenance request in the system
  // For now, we'll log it in the audit trail
  await prisma.auditLog.create({
    data: {
      action: 'CREATE_MAINTENANCE_REQUEST',
      entityType: 'Equipment',
      entityId: equipmentId,
      changes: {
        maintenanceRequest: {
          description,
          severity,
          requestedAt: new Date().toISOString(),
          status: 'PENDING',
        },
      },
      userId: requestedById,
      schoolId,
      organizationId,
    },
  });
};

// Bulk check out equipment
export const bulkCheckOutEquipment = async (
  data: z.infer<typeof bulkCheckOutSchema>,
  checkedOutById: string,
  schoolId: string,
  organizationId: string
) => {
  const validatedData = bulkCheckOutSchema.parse(data);

  // Verify all equipment is available
  const equipment = await prisma.equipment.findMany({
    where: {
      id: { in: validatedData.equipmentIds },
      isDeleted: false,
      status: 'AVAILABLE',
      OR: [
        { schoolId },
        { organizationId, schoolId: null },
      ],
    },
    include: {
      transactions: {
        where: {
          status: { in: ['CHECKED_OUT', 'OVERDUE'] },
        },
      },
    },
  });

  if (equipment.length !== validatedData.equipmentIds.length) {
    throw new ApiError('Some equipment is not available or not accessible', 400);
  }

  const unavailableEquipment = equipment.filter(eq => eq.transactions.length > 0);
  if (unavailableEquipment.length > 0) {
    throw new ApiError(`Equipment already checked out: ${unavailableEquipment.map(eq => eq.name).join(', ')}`, 400);
  }

  // If userId is provided, verify user exists
  if (validatedData.userId) {
    const targetUser = await prisma.user.findFirst({
      where: {
        id: validatedData.userId,
        isActive: true,
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    });

    if (!targetUser) {
      throw new ApiError('Target user not found or not accessible', 404);
    }
  }

  const dueDate = validatedData.dueDate 
    ? new Date(validatedData.dueDate)
    : validatedData.expectedReturnDate
    ? new Date(validatedData.expectedReturnDate)
    : getDefaultDueDate();

  // Create transactions in a database transaction
  const transactions = await prisma.$transaction(async (tx) => {
    const createdTransactions = [];

    for (const equipmentItem of equipment) {
      // Create transaction
      const transaction = await tx.transaction.create({
        data: {
          equipmentId: equipmentItem.id,
          userId: validatedData.userId || checkedOutById,
          checkedOutById,
          status: 'CHECKED_OUT',
          checkedOutAt: new Date(),
          dueDate,
          expectedReturnDate: validatedData.expectedReturnDate ? new Date(validatedData.expectedReturnDate) : dueDate,
          checkoutLocation: validatedData.checkoutLocation,
          notes: validatedData.notes,
          schoolId,
          organizationId,
          metadata: { bulkOperation: true },
        },
        include: {
          equipment: {
            include: {
              category: true,
              location: true,
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
        },
      });

      // Update equipment status
      await tx.equipment.update({
        where: { id: equipmentItem.id },
        data: {
          status: 'CHECKED_OUT',
          updatedAt: new Date(),
        },
      });

      createdTransactions.push(transaction);
    }

    return createdTransactions;
  });

  // Log bulk checkout
  await prisma.auditLog.create({
    data: {
      action: 'BULK_CHECK_OUT_EQUIPMENT',
      entityType: 'Transaction',
      entityId: `bulk-${Date.now()}`,
      changes: {
        equipmentIds: validatedData.equipmentIds,
        equipmentCount: validatedData.equipmentIds.length,
        userId: validatedData.userId || checkedOutById,
        dueDate: dueDate.toISOString(),
        checkoutLocation: validatedData.checkoutLocation,
      },
      userId: checkedOutById,
      schoolId,
      organizationId,
    },
  });

  logger.info('Bulk equipment checkout completed', {
    equipmentCount: transactions.length,
    checkedOutById,
    userId: validatedData.userId,
    dueDate,
  });

  return {
    message: `Successfully checked out ${transactions.length} items`,
    transactions,
    summary: {
      totalItems: transactions.length,
      dueDate,
      assignedTo: validatedData.userId ? transactions[0].user : null,
    },
  };
};

// Get transaction by ID
export const getTransactionById = async (
  transactionId: string,
  schoolId: string,
  organizationId: string
) => {
  const transaction = await prisma.transaction.findFirst({
    where: {
      id: transactionId,
      OR: [
        { schoolId },
        { organizationId, schoolId: null },
      ],
    },
    include: {
      equipment: {
        include: {
          category: true,
          location: true,
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
      checkedInBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  if (!transaction) {
    throw new ApiError('Transaction not found', 404);
  }

  // Add computed fields
  return {
    ...transaction,
    isOverdue: transaction.status === 'CHECKED_OUT' && isTransactionOverdue(transaction.dueDate),
    daysOverdue: transaction.status === 'CHECKED_OUT' 
      ? Math.max(0, Math.ceil((Date.now() - transaction.dueDate.getTime()) / (1000 * 60 * 60 * 24)))
      : 0,
  };
};

// Get transactions list with filtering
export const getTransactionsList = async (
  filters: z.infer<typeof transactionFilterSchema>,
  schoolId: string,
  organizationId: string
) => {
  const validatedFilters = transactionFilterSchema.parse(filters);

  // Build where clause
  const where: any = {
    OR: [
      { schoolId },
      { organizationId, schoolId: null },
    ],
  };

  if (validatedFilters.status) {
    where.status = validatedFilters.status;
  }

  if (validatedFilters.userId) {
    where.userId = validatedFilters.userId;
  }

  if (validatedFilters.equipmentId) {
    where.equipmentId = validatedFilters.equipmentId;
  }

  if (validatedFilters.checkedOutBy) {
    where.checkedOutById = validatedFilters.checkedOutBy;
  }

  if (validatedFilters.dueDateFrom || validatedFilters.dueDateTo) {
    where.dueDate = {};
    if (validatedFilters.dueDateFrom) {
      where.dueDate.gte = new Date(validatedFilters.dueDateFrom);
    }
    if (validatedFilters.dueDateTo) {
      where.dueDate.lte = new Date(validatedFilters.dueDateTo);
    }
  }

  if (validatedFilters.checkedOutFrom || validatedFilters.checkedOutTo) {
    where.checkedOutAt = {};
    if (validatedFilters.checkedOutFrom) {
      where.checkedOutAt.gte = new Date(validatedFilters.checkedOutFrom);
    }
    if (validatedFilters.checkedOutTo) {
      where.checkedOutAt.lte = new Date(validatedFilters.checkedOutTo);
    }
  }

  if (validatedFilters.isOverdue) {
    where.status = 'CHECKED_OUT';
    where.dueDate = { lt: new Date() };
  }

  if (validatedFilters.categoryId) {
    where.equipment = {
      categoryId: validatedFilters.categoryId,
    };
  }

  if (validatedFilters.locationId) {
    where.equipment = {
      ...where.equipment,
      locationId: validatedFilters.locationId,
    };
  }

  // Calculate pagination
  const skip = (validatedFilters.page - 1) * validatedFilters.limit;

  // Build order by
  const orderBy: any = {};
  orderBy[validatedFilters.sortBy] = validatedFilters.sortOrder;

  // Execute query
  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        equipment: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            location: {
              select: {
                id: true,
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
        checkedInBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy,
      skip,
      take: validatedFilters.limit,
    }),
    prisma.transaction.count({ where }),
  ]);

  const totalPages = Math.ceil(total / validatedFilters.limit);

  // Add computed fields to transactions
  const enrichedTransactions = transactions.map(transaction => ({
    ...transaction,
    isOverdue: transaction.status === 'CHECKED_OUT' && isTransactionOverdue(transaction.dueDate),
    daysOverdue: transaction.status === 'CHECKED_OUT'
      ? Math.max(0, Math.ceil((Date.now() - transaction.dueDate.getTime()) / (1000 * 60 * 60 * 24)))
      : 0,
  }));

  return {
    transactions: enrichedTransactions,
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

// Get transaction statistics
export const getTransactionStats = async (
  schoolId: string,
  organizationId: string
) => {
  const [
    totalTransactions,
    activeTransactions,
    overdueTransactions,
    todayTransactions,
    transactionsByStatus,
    equipmentUtilization,
    overdueByDays,
  ] = await Promise.all([
    // Total transactions
    prisma.transaction.count({
      where: {
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    }),
    // Active (checked out) transactions
    prisma.transaction.count({
      where: {
        status: 'CHECKED_OUT',
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    }),
    // Overdue transactions
    prisma.transaction.count({
      where: {
        status: 'CHECKED_OUT',
        dueDate: { lt: new Date() },
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    }),
    // Today's transactions
    prisma.transaction.count({
      where: {
        checkedOutAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    }),
    // Transactions by status
    prisma.transaction.groupBy({
      by: ['status'],
      where: {
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
      _count: {
        id: true,
      },
    }),
    // Equipment utilization (percentage of equipment currently checked out)
    Promise.all([
      prisma.equipment.count({
        where: {
          status: 'CHECKED_OUT',
          isDeleted: false,
          OR: [
            { schoolId },
            { organizationId, schoolId: null },
          ],
        },
      }),
      prisma.equipment.count({
        where: {
          isDeleted: false,
          OR: [
            { schoolId },
            { organizationId, schoolId: null },
          ],
        },
      }),
    ]),
    // Overdue breakdown by days
    prisma.transaction.findMany({
      where: {
        status: 'CHECKED_OUT',
        dueDate: { lt: new Date() },
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
      select: {
        id: true,
        dueDate: true,
      },
    }),
  ]);

  const [checkedOutEquipment, totalEquipment] = equipmentUtilization;
  const utilizationRate = totalEquipment > 0 ? (checkedOutEquipment / totalEquipment) * 100 : 0;

  // Calculate overdue breakdown
  const now = new Date();
  const overdueBuckets = {
    '1-3 days': 0,
    '4-7 days': 0,
    '8-14 days': 0,
    '15-30 days': 0,
    '30+ days': 0,
  };

  overdueByDays.forEach(transaction => {
    const daysOverdue = Math.ceil((now.getTime() - transaction.dueDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysOverdue <= 3) {
      overdueBuckets['1-3 days']++;
    } else if (daysOverdue <= 7) {
      overdueBuckets['4-7 days']++;
    } else if (daysOverdue <= 14) {
      overdueBuckets['8-14 days']++;
    } else if (daysOverdue <= 30) {
      overdueBuckets['15-30 days']++;
    } else {
      overdueBuckets['30+ days']++;
    }
  });

  return {
    overview: {
      totalTransactions,
      activeTransactions,
      overdueTransactions,
      todayTransactions,
      utilizationRate: Math.round(utilizationRate * 100) / 100,
      overdueRate: activeTransactions > 0 ? Math.round((overdueTransactions / activeTransactions) * 100 * 100) / 100 : 0,
    },
    statusBreakdown: transactionsByStatus.map(status => ({
      status: status.status,
      count: status._count.id,
    })),
    overdueBreakdown: overdueBuckets,
    utilization: {
      checkedOutEquipment,
      totalEquipment,
      availableEquipment: totalEquipment - checkedOutEquipment,
      utilizationRate,
    },
  };
};

// Update transaction status (for manual status changes)
export const updateTransactionStatus = async (
  transactionId: string,
  newStatus: string,
  userId: string,
  notes: string | undefined,
  schoolId: string,
  organizationId: string
) => {
  // Validate status transition
  if (!Object.keys(TRANSACTION_STATUS_FLOW).includes(newStatus)) {
    throw new ApiError('Invalid transaction status', 400);
  }

  const transaction = await prisma.transaction.findFirst({
    where: {
      id: transactionId,
      OR: [
        { schoolId },
        { organizationId, schoolId: null },
      ],
    },
    include: {
      equipment: true,
    },
  });

  if (!transaction) {
    throw new ApiError('Transaction not found', 404);
  }

  // Check if status transition is allowed
  const allowedTransitions = TRANSACTION_STATUS_FLOW[transaction.status as keyof typeof TRANSACTION_STATUS_FLOW];
  if (!allowedTransitions.includes(newStatus)) {
    throw new ApiError(`Cannot transition from ${transaction.status} to ${newStatus}`, 400);
  }

  // Update transaction
  const updatedTransaction = await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      status: newStatus as any,
      statusNotes: notes,
      statusUpdatedAt: new Date(),
      statusUpdatedById: userId,
    },
    include: {
      equipment: {
        include: {
          category: true,
          location: true,
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
    },
  });

  // Update equipment status if needed
  let equipmentStatus = transaction.equipment.status;
  if (newStatus === 'LOST' || newStatus === 'DAMAGED') {
    equipmentStatus = newStatus;
  } else if (newStatus === 'CHECKED_IN') {
    equipmentStatus = 'AVAILABLE';
  }

  if (equipmentStatus !== transaction.equipment.status) {
    await prisma.equipment.update({
      where: { id: transaction.equipmentId },
      data: { status: equipmentStatus },
    });
  }

  // Log status change
  await prisma.auditLog.create({
    data: {
      action: 'UPDATE_TRANSACTION_STATUS',
      entityType: 'Transaction',
      entityId: transactionId,
      changes: {
        oldStatus: transaction.status,
        newStatus,
        equipmentId: transaction.equipmentId,
        equipmentName: transaction.equipment.name,
        notes,
      },
      userId,
      schoolId,
      organizationId,
    },
  });

  logger.info('Transaction status updated', {
    transactionId,
    oldStatus: transaction.status,
    newStatus,
    equipmentId: transaction.equipmentId,
    userId,
  });

  return updatedTransaction;
};

// Auto-update overdue transactions
export const updateOverdueTransactions = async () => {
  const overdueTransactions = await prisma.transaction.findMany({
    where: {
      status: 'CHECKED_OUT',
      dueDate: { lt: new Date() },
    },
  });

  if (overdueTransactions.length === 0) {
    return { updated: 0 };
  }

  const transactionIds = overdueTransactions.map(t => t.id);
  
  const updatedCount = await prisma.transaction.updateMany({
    where: {
      id: { in: transactionIds },
    },
    data: {
      status: 'OVERDUE',
      statusUpdatedAt: new Date(),
    },
  });

  logger.info('Updated overdue transactions', {
    count: updatedCount.count,
    transactionIds,
  });

  return { updated: updatedCount.count };
};