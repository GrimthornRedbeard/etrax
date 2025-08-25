import { prisma } from '@/index';
import { ApiError } from '@/middleware/errorHandler';
import { z } from 'zod';
import QRCode from 'qrcode';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

// Validation schemas
export const createEquipmentSchema = z.object({
  name: z.string().min(1, 'Equipment name is required'),
  description: z.string().optional(),
  serialNumber: z.string().optional(),
  modelNumber: z.string().optional(),
  manufacturer: z.string().optional(),
  purchaseDate: z.string().datetime().optional(),
  purchasePrice: z.number().positive().optional(),
  currentValue: z.number().positive().optional(),
  condition: z.enum(['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED', 'NEEDS_REPAIR']),
  status: z.enum(['AVAILABLE', 'CHECKED_OUT', 'MAINTENANCE', 'RETIRED', 'LOST', 'DAMAGED']).default('AVAILABLE'),
  categoryId: z.string().uuid('Invalid category ID'),
  locationId: z.string().uuid('Invalid location ID'),
  tags: z.array(z.string()).optional(),
  specifications: z.record(z.string(), z.any()).optional(),
  warrantyCoverage: z.string().optional(),
  warrantyExpiry: z.string().datetime().optional(),
  maintenanceSchedule: z.string().optional(),
  notes: z.string().optional(),
  imageUrls: z.array(z.string()).optional(),
});

export const updateEquipmentSchema = createEquipmentSchema.partial();

export const equipmentFilterSchema = z.object({
  search: z.string().optional(),
  status: z.enum(['AVAILABLE', 'CHECKED_OUT', 'MAINTENANCE', 'RETIRED', 'LOST', 'DAMAGED']).optional(),
  condition: z.enum(['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED', 'NEEDS_REPAIR']).optional(),
  categoryId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  minValue: z.number().positive().optional(),
  maxValue: z.number().positive().optional(),
  purchaseDateFrom: z.string().datetime().optional(),
  purchaseDateTo: z.string().datetime().optional(),
  needsMaintenance: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'createdAt', 'purchaseDate', 'currentValue', 'lastUpdated']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// Generate QR code for equipment
export const generateEquipmentQRCode = async (
  equipmentId: string,
  schoolCode: string
): Promise<string> => {
  try {
    const qrData = {
      type: 'equipment',
      id: equipmentId,
      school: schoolCode,
      url: `${config.frontend.url}/equipment/${equipmentId}`,
      timestamp: new Date().toISOString(),
    };

    const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 256,
    });

    return qrCodeDataURL;
  } catch (error) {
    logger.error('Failed to generate QR code for equipment', { equipmentId, error });
    throw new ApiError('Failed to generate QR code', 500);
  }
};

// Create equipment
export const createEquipment = async (
  data: z.infer<typeof createEquipmentSchema>,
  userId: string,
  schoolId: string,
  organizationId: string
) => {
  const validatedData = createEquipmentSchema.parse(data);

  // Verify category and location belong to the same school/organization
  const [category, location] = await Promise.all([
    prisma.category.findFirst({
      where: {
        id: validatedData.categoryId,
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    }),
    prisma.location.findFirst({
      where: {
        id: validatedData.locationId,
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    }),
  ]);

  if (!category) {
    throw new ApiError('Category not found or not accessible', 404);
  }

  if (!location) {
    throw new ApiError('Location not found or not accessible', 404);
  }

  // Generate unique equipment code
  const equipmentCode = `${category.code}-${Date.now().toString().slice(-6)}`;

  // Create equipment
  const equipment = await prisma.equipment.create({
    data: {
      ...validatedData,
      code: equipmentCode,
      schoolId,
      organizationId,
      createdById: userId,
      updatedById: userId,
      tags: validatedData.tags || [],
      specifications: validatedData.specifications || {},
    },
    include: {
      category: true,
      location: true,
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  });

  // Generate QR code
  try {
    const qrCodeUrl = await generateEquipmentQRCode(equipment.id, equipment.school!.code);
    
    // Update equipment with QR code URL
    const updatedEquipment = await prisma.equipment.update({
      where: { id: equipment.id },
      data: { qrCodeUrl },
      include: {
        category: true,
        location: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        school: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    // Log equipment creation
    await prisma.auditLog.create({
      data: {
        action: 'CREATE_EQUIPMENT',
        entityType: 'Equipment',
        entityId: equipment.id,
        changes: {
          created: {
            name: equipment.name,
            code: equipment.code,
            categoryId: equipment.categoryId,
            locationId: equipment.locationId,
          },
        },
        userId,
        schoolId,
        organizationId,
      },
    });

    logger.info('Equipment created successfully', {
      equipmentId: equipment.id,
      equipmentCode: equipment.code,
      userId,
      schoolId,
    });

    return updatedEquipment;
  } catch (qrError) {
    logger.error('Failed to generate QR code after equipment creation', {
      equipmentId: equipment.id,
      error: qrError,
    });
    // Return equipment even if QR code generation fails
    return equipment;
  }
};

// Get equipment by ID
export const getEquipmentById = async (
  equipmentId: string,
  schoolId: string,
  organizationId: string
) => {
  const equipment = await prisma.equipment.findFirst({
    where: {
      id: equipmentId,
      OR: [
        { schoolId },
        { organizationId, schoolId: null },
      ],
    },
    include: {
      category: true,
      location: true,
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
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      transactions: {
        orderBy: {
          createdAt: 'desc',
        },
        take: 10,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!equipment) {
    throw new ApiError('Equipment not found', 404);
  }

  return equipment;
};

// Update equipment
export const updateEquipment = async (
  equipmentId: string,
  data: z.infer<typeof updateEquipmentSchema>,
  userId: string,
  schoolId: string,
  organizationId: string
) => {
  const validatedData = updateEquipmentSchema.parse(data);

  // Check if equipment exists and user has access
  const existingEquipment = await getEquipmentById(equipmentId, schoolId, organizationId);

  // If categoryId or locationId is being updated, verify they exist and are accessible
  if (validatedData.categoryId) {
    const category = await prisma.category.findFirst({
      where: {
        id: validatedData.categoryId,
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    });

    if (!category) {
      throw new ApiError('Category not found or not accessible', 404);
    }
  }

  if (validatedData.locationId) {
    const location = await prisma.location.findFirst({
      where: {
        id: validatedData.locationId,
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    });

    if (!location) {
      throw new ApiError('Location not found or not accessible', 404);
    }
  }

  // Track changes for audit log
  const changes: Record<string, any> = {};
  Object.keys(validatedData).forEach(key => {
    const oldValue = (existingEquipment as any)[key];
    const newValue = (validatedData as any)[key];
    if (oldValue !== newValue) {
      changes[key] = { from: oldValue, to: newValue };
    }
  });

  // Update equipment
  const updatedEquipment = await prisma.equipment.update({
    where: { id: equipmentId },
    data: {
      ...validatedData,
      updatedById: userId,
      updatedAt: new Date(),
    },
    include: {
      category: true,
      location: true,
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
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  });

  // Log equipment update if there were changes
  if (Object.keys(changes).length > 0) {
    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_EQUIPMENT',
        entityType: 'Equipment',
        entityId: equipmentId,
        changes,
        userId,
        schoolId,
        organizationId,
      },
    });

    logger.info('Equipment updated successfully', {
      equipmentId,
      changes: Object.keys(changes),
      userId,
      schoolId,
    });
  }

  return updatedEquipment;
};

// Delete equipment
export const deleteEquipment = async (
  equipmentId: string,
  userId: string,
  schoolId: string,
  organizationId: string
) => {
  // Check if equipment exists and user has access
  const equipment = await getEquipmentById(equipmentId, schoolId, organizationId);

  // Check if equipment has any active transactions
  const activeTransactions = await prisma.transaction.count({
    where: {
      equipmentId,
      status: {
        in: ['CHECKED_OUT', 'OVERDUE'],
      },
    },
  });

  if (activeTransactions > 0) {
    throw new ApiError('Cannot delete equipment with active transactions', 400);
  }

  // Soft delete the equipment
  const deletedEquipment = await prisma.equipment.update({
    where: { id: equipmentId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      updatedById: userId,
    },
  });

  // Log equipment deletion
  await prisma.auditLog.create({
    data: {
      action: 'DELETE_EQUIPMENT',
      entityType: 'Equipment',
      entityId: equipmentId,
      changes: {
        deleted: {
          name: equipment.name,
          code: equipment.code,
          reason: 'User deleted',
        },
      },
      userId,
      schoolId,
      organizationId,
    },
  });

  logger.info('Equipment deleted successfully', {
    equipmentId,
    equipmentCode: equipment.code,
    userId,
    schoolId,
  });

  return { message: 'Equipment deleted successfully' };
};

// Get equipment list with filtering and pagination
export const getEquipmentList = async (
  filters: z.infer<typeof equipmentFilterSchema>,
  schoolId: string,
  organizationId: string
) => {
  const validatedFilters = equipmentFilterSchema.parse(filters);

  // Build where clause
  const where: any = {
    isDeleted: false,
    OR: [
      { schoolId },
      { organizationId, schoolId: null },
    ],
  };

  // Apply filters
  if (validatedFilters.search) {
    where.OR = [
      { name: { contains: validatedFilters.search, mode: 'insensitive' } },
      { description: { contains: validatedFilters.search, mode: 'insensitive' } },
      { code: { contains: validatedFilters.search, mode: 'insensitive' } },
      { serialNumber: { contains: validatedFilters.search, mode: 'insensitive' } },
      { modelNumber: { contains: validatedFilters.search, mode: 'insensitive' } },
      { manufacturer: { contains: validatedFilters.search, mode: 'insensitive' } },
    ];
  }

  if (validatedFilters.status) {
    where.status = validatedFilters.status;
  }

  if (validatedFilters.condition) {
    where.condition = validatedFilters.condition;
  }

  if (validatedFilters.categoryId) {
    where.categoryId = validatedFilters.categoryId;
  }

  if (validatedFilters.locationId) {
    where.locationId = validatedFilters.locationId;
  }

  if (validatedFilters.tags && validatedFilters.tags.length > 0) {
    where.tags = {
      hasEvery: validatedFilters.tags,
    };
  }

  if (validatedFilters.minValue || validatedFilters.maxValue) {
    where.currentValue = {};
    if (validatedFilters.minValue) {
      where.currentValue.gte = validatedFilters.minValue;
    }
    if (validatedFilters.maxValue) {
      where.currentValue.lte = validatedFilters.maxValue;
    }
  }

  if (validatedFilters.purchaseDateFrom || validatedFilters.purchaseDateTo) {
    where.purchaseDate = {};
    if (validatedFilters.purchaseDateFrom) {
      where.purchaseDate.gte = new Date(validatedFilters.purchaseDateFrom);
    }
    if (validatedFilters.purchaseDateTo) {
      where.purchaseDate.lte = new Date(validatedFilters.purchaseDateTo);
    }
  }

  if (validatedFilters.needsMaintenance) {
    where.condition = {
      in: ['NEEDS_REPAIR', 'POOR'],
    };
  }

  // Calculate pagination
  const skip = (validatedFilters.page - 1) * validatedFilters.limit;

  // Build order by
  const orderBy: any = {};
  orderBy[validatedFilters.sortBy] = validatedFilters.sortOrder;

  // Execute query
  const [equipment, total] = await Promise.all([
    prisma.equipment.findMany({
      where,
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
        school: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy,
      skip,
      take: validatedFilters.limit,
    }),
    prisma.equipment.count({ where }),
  ]);

  const totalPages = Math.ceil(total / validatedFilters.limit);

  return {
    equipment,
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

// Get equipment statistics
export const getEquipmentStats = async (
  schoolId: string,
  organizationId: string
) => {
  const [
    totalEquipment,
    availableEquipment,
    checkedOutEquipment,
    maintenanceEquipment,
    totalValue,
    categoryStats,
    conditionStats,
    recentActivity,
  ] = await Promise.all([
    // Total equipment count
    prisma.equipment.count({
      where: {
        isDeleted: false,
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    }),
    // Available equipment count
    prisma.equipment.count({
      where: {
        isDeleted: false,
        status: 'AVAILABLE',
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    }),
    // Checked out equipment count
    prisma.equipment.count({
      where: {
        isDeleted: false,
        status: 'CHECKED_OUT',
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    }),
    // Equipment in maintenance
    prisma.equipment.count({
      where: {
        isDeleted: false,
        status: 'MAINTENANCE',
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    }),
    // Total value of equipment
    prisma.equipment.aggregate({
      where: {
        isDeleted: false,
        currentValue: { not: null },
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
      _sum: {
        currentValue: true,
      },
    }),
    // Equipment count by category
    prisma.equipment.groupBy({
      by: ['categoryId'],
      where: {
        isDeleted: false,
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
      _count: {
        id: true,
      },
    }),
    // Equipment count by condition
    prisma.equipment.groupBy({
      by: ['condition'],
      where: {
        isDeleted: false,
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
      _count: {
        id: true,
      },
    }),
    // Recent equipment activity
    prisma.equipment.findMany({
      where: {
        isDeleted: false,
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
      include: {
        category: {
          select: {
            name: true,
          },
        },
        updatedBy: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 10,
    }),
  ]);

  return {
    overview: {
      totalEquipment,
      availableEquipment,
      checkedOutEquipment,
      maintenanceEquipment,
      totalValue: totalValue._sum.currentValue || 0,
      utilizationRate: totalEquipment > 0 ? (checkedOutEquipment / totalEquipment) * 100 : 0,
    },
    categoryBreakdown: categoryStats.map(stat => ({
      categoryId: stat.categoryId,
      count: stat._count.id,
    })),
    conditionBreakdown: conditionStats.map(stat => ({
      condition: stat.condition,
      count: stat._count.id,
    })),
    recentActivity,
  };
};

// Bulk update equipment status
export const bulkUpdateEquipmentStatus = async (
  equipmentIds: string[],
  newStatus: string,
  userId: string,
  schoolId: string,
  organizationId: string
) => {
  // Validate status
  if (!['AVAILABLE', 'CHECKED_OUT', 'MAINTENANCE', 'RETIRED', 'LOST', 'DAMAGED'].includes(newStatus)) {
    throw new ApiError('Invalid equipment status', 400);
  }

  // Verify all equipment exists and user has access
  const equipment = await prisma.equipment.findMany({
    where: {
      id: { in: equipmentIds },
      isDeleted: false,
      OR: [
        { schoolId },
        { organizationId, schoolId: null },
      ],
    },
  });

  if (equipment.length !== equipmentIds.length) {
    throw new ApiError('Some equipment not found or not accessible', 404);
  }

  // Update equipment status
  const updatedEquipment = await prisma.equipment.updateMany({
    where: {
      id: { in: equipmentIds },
    },
    data: {
      status: newStatus as any,
      updatedById: userId,
      updatedAt: new Date(),
    },
  });

  // Log bulk update
  await prisma.auditLog.create({
    data: {
      action: 'BULK_UPDATE_EQUIPMENT',
      entityType: 'Equipment',
      entityId: `bulk-${Date.now()}`,
      changes: {
        equipmentIds,
        newStatus,
        count: updatedEquipment.count,
      },
      userId,
      schoolId,
      organizationId,
    },
  });

  logger.info('Bulk equipment status update completed', {
    equipmentCount: updatedEquipment.count,
    newStatus,
    userId,
    schoolId,
  });

  return {
    message: `Successfully updated ${updatedEquipment.count} equipment items`,
    updatedCount: updatedEquipment.count,
  };
};