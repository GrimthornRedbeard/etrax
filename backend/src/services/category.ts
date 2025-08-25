import { prisma } from '@/index';
import { ApiError } from '@/middleware/errorHandler';
import { z } from 'zod';
import { logger } from '@/utils/logger';

// Validation schemas
export const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(100, 'Category name too long'),
  code: z.string().min(1, 'Category code is required').max(10, 'Category code too long')
    .regex(/^[A-Z0-9_]+$/, 'Category code must contain only uppercase letters, numbers, and underscores'),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color').optional(),
  icon: z.string().optional(),
  isActive: z.boolean().default(true),
  parentId: z.string().uuid('Invalid parent category ID').optional(),
  sortOrder: z.number().int().min(0).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const categoryFilterSchema = z.object({
  search: z.string().optional(),
  isActive: z.boolean().optional(),
  parentId: z.string().uuid().optional(),
  includeInactive: z.boolean().default(false),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(50),
  sortBy: z.enum(['name', 'code', 'createdAt', 'sortOrder']).default('sortOrder'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// Create category
export const createCategory = async (
  data: z.infer<typeof createCategorySchema>,
  userId: string,
  schoolId?: string,
  organizationId?: string
) => {
  const validatedData = createCategorySchema.parse(data);

  // Check if category code already exists in the same scope
  const existingCategory = await prisma.category.findFirst({
    where: {
      code: validatedData.code,
      OR: [
        { schoolId },
        { organizationId, schoolId: null },
      ],
    },
  });

  if (existingCategory) {
    throw new ApiError('Category code already exists', 409);
  }

  // If parentId is provided, verify parent category exists and is accessible
  if (validatedData.parentId) {
    const parentCategory = await prisma.category.findFirst({
      where: {
        id: validatedData.parentId,
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    });

    if (!parentCategory) {
      throw new ApiError('Parent category not found or not accessible', 404);
    }

    // Prevent creating circular references
    if (await hasCircularReference(validatedData.parentId, validatedData.parentId)) {
      throw new ApiError('Cannot create circular category reference', 400);
    }
  }

  // Set sort order if not provided
  if (!validatedData.sortOrder) {
    const maxSortOrder = await prisma.category.aggregate({
      where: {
        parentId: validatedData.parentId || null,
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
      _max: {
        sortOrder: true,
      },
    });

    validatedData.sortOrder = (maxSortOrder._max.sortOrder || 0) + 1;
  }

  // Create category
  const category = await prisma.category.create({
    data: {
      ...validatedData,
      schoolId,
      organizationId,
      createdById: userId,
      updatedById: userId,
      metadata: validatedData.metadata || {},
    },
    include: {
      parent: true,
      children: true,
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      _count: {
        select: {
          equipment: true,
        },
      },
    },
  });

  // Log category creation
  await prisma.auditLog.create({
    data: {
      action: 'CREATE_CATEGORY',
      entityType: 'Category',
      entityId: category.id,
      changes: {
        created: {
          name: category.name,
          code: category.code,
          parentId: category.parentId,
        },
      },
      userId,
      schoolId,
      organizationId,
    },
  });

  logger.info('Category created successfully', {
    categoryId: category.id,
    categoryCode: category.code,
    userId,
    schoolId,
  });

  return category;
};

// Get category by ID
export const getCategoryById = async (
  categoryId: string,
  schoolId?: string,
  organizationId?: string
) => {
  const category = await prisma.category.findFirst({
    where: {
      id: categoryId,
      OR: [
        { schoolId },
        { organizationId, schoolId: null },
      ],
    },
    include: {
      parent: true,
      children: {
        where: {
          isActive: true,
        },
        orderBy: {
          sortOrder: 'asc',
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
          equipment: true,
          children: true,
        },
      },
    },
  });

  if (!category) {
    throw new ApiError('Category not found', 404);
  }

  return category;
};

// Update category
export const updateCategory = async (
  categoryId: string,
  data: z.infer<typeof updateCategorySchema>,
  userId: string,
  schoolId?: string,
  organizationId?: string
) => {
  const validatedData = updateCategorySchema.parse(data);

  // Check if category exists and user has access
  const existingCategory = await getCategoryById(categoryId, schoolId, organizationId);

  // If code is being updated, check for uniqueness
  if (validatedData.code && validatedData.code !== existingCategory.code) {
    const codeExists = await prisma.category.findFirst({
      where: {
        code: validatedData.code,
        id: { not: categoryId },
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    });

    if (codeExists) {
      throw new ApiError('Category code already exists', 409);
    }
  }

  // If parentId is being updated, verify it exists and doesn't create circular reference
  if (validatedData.parentId !== undefined) {
    if (validatedData.parentId) {
      const parentCategory = await prisma.category.findFirst({
        where: {
          id: validatedData.parentId,
          OR: [
            { schoolId },
            { organizationId, schoolId: null },
          ],
        },
      });

      if (!parentCategory) {
        throw new ApiError('Parent category not found or not accessible', 404);
      }

      // Check for circular reference
      if (await hasCircularReference(categoryId, validatedData.parentId)) {
        throw new ApiError('Cannot create circular category reference', 400);
      }
    }
  }

  // Track changes for audit log
  const changes: Record<string, any> = {};
  Object.keys(validatedData).forEach(key => {
    const oldValue = (existingCategory as any)[key];
    const newValue = (validatedData as any)[key];
    if (oldValue !== newValue) {
      changes[key] = { from: oldValue, to: newValue };
    }
  });

  // Update category
  const updatedCategory = await prisma.category.update({
    where: { id: categoryId },
    data: {
      ...validatedData,
      updatedById: userId,
      updatedAt: new Date(),
    },
    include: {
      parent: true,
      children: {
        where: {
          isActive: true,
        },
        orderBy: {
          sortOrder: 'asc',
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
          equipment: true,
          children: true,
        },
      },
    },
  });

  // Log category update if there were changes
  if (Object.keys(changes).length > 0) {
    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_CATEGORY',
        entityType: 'Category',
        entityId: categoryId,
        changes,
        userId,
        schoolId,
        organizationId,
      },
    });

    logger.info('Category updated successfully', {
      categoryId,
      changes: Object.keys(changes),
      userId,
      schoolId,
    });
  }

  return updatedCategory;
};

// Delete category
export const deleteCategory = async (
  categoryId: string,
  userId: string,
  schoolId?: string,
  organizationId?: string
) => {
  // Check if category exists and user has access
  const category = await getCategoryById(categoryId, schoolId, organizationId);

  // Check if category has any equipment
  const equipmentCount = await prisma.equipment.count({
    where: {
      categoryId,
      isDeleted: false,
    },
  });

  if (equipmentCount > 0) {
    throw new ApiError('Cannot delete category with existing equipment. Please move or delete equipment first.', 400);
  }

  // Check if category has any children
  const childrenCount = await prisma.category.count({
    where: {
      parentId: categoryId,
      isActive: true,
    },
  });

  if (childrenCount > 0) {
    throw new ApiError('Cannot delete category with child categories. Please move or delete child categories first.', 400);
  }

  // Soft delete the category
  const deletedCategory = await prisma.category.update({
    where: { id: categoryId },
    data: {
      isActive: false,
      updatedById: userId,
      updatedAt: new Date(),
    },
  });

  // Log category deletion
  await prisma.auditLog.create({
    data: {
      action: 'DELETE_CATEGORY',
      entityType: 'Category',
      entityId: categoryId,
      changes: {
        deleted: {
          name: category.name,
          code: category.code,
          reason: 'User deleted',
        },
      },
      userId,
      schoolId,
      organizationId,
    },
  });

  logger.info('Category deleted successfully', {
    categoryId,
    categoryCode: category.code,
    userId,
    schoolId,
  });

  return { message: 'Category deleted successfully' };
};

// Get categories list with filtering and pagination
export const getCategoriesList = async (
  filters: z.infer<typeof categoryFilterSchema>,
  schoolId?: string,
  organizationId?: string
) => {
  const validatedFilters = categoryFilterSchema.parse(filters);

  // Build where clause
  const where: any = {
    OR: [
      { schoolId },
      { organizationId, schoolId: null },
    ],
  };

  if (!validatedFilters.includeInactive) {
    where.isActive = true;
  }

  if (validatedFilters.isActive !== undefined) {
    where.isActive = validatedFilters.isActive;
  }

  if (validatedFilters.search) {
    where.OR = [
      { name: { contains: validatedFilters.search, mode: 'insensitive' } },
      { description: { contains: validatedFilters.search, mode: 'insensitive' } },
      { code: { contains: validatedFilters.search, mode: 'insensitive' } },
    ];
  }

  if (validatedFilters.parentId !== undefined) {
    where.parentId = validatedFilters.parentId;
  }

  // Calculate pagination
  const skip = (validatedFilters.page - 1) * validatedFilters.limit;

  // Build order by
  const orderBy: any = {};
  orderBy[validatedFilters.sortBy] = validatedFilters.sortOrder;

  // Execute query
  const [categories, total] = await Promise.all([
    prisma.category.findMany({
      where,
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        children: {
          where: {
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            code: true,
            sortOrder: true,
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
        _count: {
          select: {
            equipment: true,
            children: true,
          },
        },
      },
      orderBy,
      skip,
      take: validatedFilters.limit,
    }),
    prisma.category.count({ where }),
  ]);

  const totalPages = Math.ceil(total / validatedFilters.limit);

  return {
    categories,
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

// Get category tree structure
export const getCategoryTree = async (
  schoolId?: string,
  organizationId?: string
) => {
  const categories = await prisma.category.findMany({
    where: {
      isActive: true,
      OR: [
        { schoolId },
        { organizationId, schoolId: null },
      ],
    },
    include: {
      _count: {
        select: {
          equipment: true,
        },
      },
    },
    orderBy: [
      { sortOrder: 'asc' },
      { name: 'asc' },
    ],
  });

  // Build tree structure
  const categoryMap = new Map();
  const rootCategories: any[] = [];

  // First pass: create map of all categories
  categories.forEach(category => {
    categoryMap.set(category.id, {
      ...category,
      children: [],
    });
  });

  // Second pass: build tree structure
  categories.forEach(category => {
    const categoryNode = categoryMap.get(category.id);
    
    if (category.parentId && categoryMap.has(category.parentId)) {
      const parent = categoryMap.get(category.parentId);
      parent.children.push(categoryNode);
    } else {
      rootCategories.push(categoryNode);
    }
  });

  return rootCategories;
};

// Get category statistics
export const getCategoryStats = async (
  schoolId?: string,
  organizationId?: string
) => {
  const [
    totalCategories,
    activeCategories,
    rootCategories,
    equipmentByCategory,
    topCategories,
  ] = await Promise.all([
    // Total categories count
    prisma.category.count({
      where: {
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    }),
    // Active categories count
    prisma.category.count({
      where: {
        isActive: true,
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    }),
    // Root categories (no parent)
    prisma.category.count({
      where: {
        parentId: null,
        isActive: true,
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    }),
    // Equipment count by category
    prisma.category.findMany({
      where: {
        isActive: true,
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
      include: {
        _count: {
          select: {
            equipment: {
              where: {
                isDeleted: false,
              },
            },
          },
        },
      },
      take: 10,
      orderBy: {
        equipment: {
          _count: 'desc',
        },
      },
    }),
    // Top categories by equipment count
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
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: 5,
    }),
  ]);

  return {
    overview: {
      totalCategories,
      activeCategories,
      rootCategories,
      inactiveCategories: totalCategories - activeCategories,
    },
    equipmentDistribution: equipmentByCategory.map(category => ({
      categoryId: category.id,
      categoryName: category.name,
      categoryCode: category.code,
      equipmentCount: category._count.equipment,
    })),
    topCategories: topCategories.map(stat => ({
      categoryId: stat.categoryId,
      equipmentCount: stat._count.id,
    })),
  };
};

// Reorder categories
export const reorderCategories = async (
  categoryOrders: Array<{ id: string; sortOrder: number }>,
  userId: string,
  schoolId?: string,
  organizationId?: string
) => {
  // Validate that all categories exist and user has access
  const categoryIds = categoryOrders.map(c => c.id);
  const existingCategories = await prisma.category.findMany({
    where: {
      id: { in: categoryIds },
      OR: [
        { schoolId },
        { organizationId, schoolId: null },
      ],
    },
  });

  if (existingCategories.length !== categoryIds.length) {
    throw new ApiError('Some categories not found or not accessible', 404);
  }

  // Update sort orders in a transaction
  await prisma.$transaction(async (tx) => {
    for (const order of categoryOrders) {
      await tx.category.update({
        where: { id: order.id },
        data: {
          sortOrder: order.sortOrder,
          updatedById: userId,
          updatedAt: new Date(),
        },
      });
    }
  });

  // Log reordering
  await prisma.auditLog.create({
    data: {
      action: 'REORDER_CATEGORIES',
      entityType: 'Category',
      entityId: `reorder-${Date.now()}`,
      changes: {
        reordered: categoryOrders,
      },
      userId,
      schoolId,
      organizationId,
    },
  });

  logger.info('Categories reordered successfully', {
    categoryCount: categoryOrders.length,
    userId,
    schoolId,
  });

  return { message: 'Categories reordered successfully' };
};

// Helper function to check for circular references
const hasCircularReference = async (categoryId: string, potentialParentId: string): Promise<boolean> => {
  if (categoryId === potentialParentId) {
    return true;
  }

  const parent = await prisma.category.findUnique({
    where: { id: potentialParentId },
    select: { parentId: true },
  });

  if (!parent || !parent.parentId) {
    return false;
  }

  return hasCircularReference(categoryId, parent.parentId);
};