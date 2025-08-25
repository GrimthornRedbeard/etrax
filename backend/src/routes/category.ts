import express from 'express';
import {
  createCategory,
  getCategoryById,
  updateCategory,
  deleteCategory,
  getCategoriesList,
  getCategoryTree,
  getCategoryStats,
  reorderCategories,
  createCategorySchema,
  updateCategorySchema,
  categoryFilterSchema,
} from '@/services/category';
import { authMiddleware } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { rateLimiter } from '@/middleware/rateLimiter';
import { ApiError } from '@/middleware/errorHandler';
import { z } from 'zod';
import { prisma } from '@/index';

const router = express.Router();

// Validation schemas for route-specific data
const categoryIdSchema = z.object({
  id: z.string().uuid('Invalid category ID'),
});

const reorderCategoriesSchema = z.object({
  categories: z.array(z.object({
    id: z.string().uuid('Invalid category ID'),
    sortOrder: z.number().int().min(0, 'Sort order must be non-negative'),
  })).min(1, 'At least one category is required'),
});

// Apply authentication to all routes
router.use(authMiddleware);

/**
 * @route   GET /api/categories
 * @desc    Get categories list with filtering and pagination
 * @access  Private
 */
router.get('/', rateLimiter.api, async (req, res, next) => {
  try {
    const { schoolId, organizationId } = req.user!;
    const filters = categoryFilterSchema.parse(req.query);

    const result = await getCategoriesList(filters, schoolId, organizationId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/categories/tree
 * @desc    Get categories in tree structure
 * @access  Private
 */
router.get('/tree', rateLimiter.api, async (req, res, next) => {
  try {
    const { schoolId, organizationId } = req.user!;
    const tree = await getCategoryTree(schoolId, organizationId);
    res.json({ tree });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/categories/stats
 * @desc    Get category statistics and analytics
 * @access  Private
 */
router.get('/stats', rateLimiter.api, async (req, res, next) => {
  try {
    const { schoolId, organizationId } = req.user!;
    const stats = await getCategoryStats(schoolId, organizationId);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/categories
 * @desc    Create new category
 * @access  Private
 */
router.post(
  '/',
  rateLimiter.api,
  validateRequest(createCategorySchema),
  async (req, res, next) => {
    try {
      const { userId, schoolId, organizationId, role } = req.user!;

      // Check if user has permission to create categories
      if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
        throw new ApiError('Insufficient permissions to create categories', 403);
      }

      const category = await createCategory(
        req.body,
        userId,
        schoolId,
        organizationId
      );

      res.status(201).json({
        message: 'Category created successfully',
        category,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/categories/:id
 * @desc    Get category by ID
 * @access  Private
 */
router.get(
  '/:id',
  rateLimiter.api,
  validateRequest(categoryIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { schoolId, organizationId } = req.user!;
      const { id } = req.params;

      const category = await getCategoryById(id, schoolId, organizationId);
      res.json(category);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/categories/:id
 * @desc    Update category
 * @access  Private
 */
router.put(
  '/:id',
  rateLimiter.api,
  validateRequest(categoryIdSchema, 'params'),
  validateRequest(updateCategorySchema),
  async (req, res, next) => {
    try {
      const { userId, schoolId, organizationId, role } = req.user!;
      const { id } = req.params;

      // Check if user has permission to update categories
      if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
        throw new ApiError('Insufficient permissions to update categories', 403);
      }

      const category = await updateCategory(
        id,
        req.body,
        userId,
        schoolId,
        organizationId
      );

      res.json({
        message: 'Category updated successfully',
        category,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/categories/:id
 * @desc    Delete category (soft delete)
 * @access  Private
 */
router.delete(
  '/:id',
  rateLimiter.api,
  validateRequest(categoryIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { userId, schoolId, organizationId, role } = req.user!;
      const { id } = req.params;

      // Check if user has permission to delete categories
      if (!['ADMIN', 'MANAGER'].includes(role)) {
        throw new ApiError('Insufficient permissions to delete categories', 403);
      }

      const result = await deleteCategory(id, userId, schoolId, organizationId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/categories/reorder
 * @desc    Reorder categories
 * @access  Private (Admin/Manager only)
 */
router.post(
  '/reorder',
  rateLimiter.api,
  validateRequest(reorderCategoriesSchema),
  async (req, res, next) => {
    try {
      const { userId, schoolId, organizationId, role } = req.user!;

      // Check if user has permission to reorder categories
      if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
        throw new ApiError('Insufficient permissions to reorder categories', 403);
      }

      const { categories } = req.body;

      const result = await reorderCategories(
        categories,
        userId,
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
 * @route   GET /api/categories/:id/children
 * @desc    Get child categories of a specific category
 * @access  Private
 */
router.get(
  '/:id/children',
  rateLimiter.api,
  validateRequest(categoryIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { schoolId, organizationId } = req.user!;
      const { id } = req.params;

      // Verify parent category exists and user has access
      await getCategoryById(id, schoolId, organizationId);

      // Get child categories
      const filters = { parentId: id, includeInactive: false };
      const result = await getCategoriesList(filters, schoolId, organizationId);

      res.json({
        parentId: id,
        children: result.categories,
        total: result.pagination.total,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/categories/:id/equipment
 * @desc    Get equipment in a specific category
 * @access  Private
 */
router.get(
  '/:id/equipment',
  rateLimiter.api,
  validateRequest(categoryIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { schoolId, organizationId } = req.user!;
      const { id } = req.params;

      // Verify category exists and user has access
      const category = await getCategoryById(id, schoolId, organizationId);

      // Get equipment in this category
      const equipment = await prisma.equipment.findMany({
        where: {
          categoryId: id,
          isDeleted: false,
          OR: [
            { schoolId },
            { organizationId, schoolId: null },
          ],
        },
        include: {
          location: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
        orderBy: {
          name: 'asc',
        },
      });

      res.json({
        category: {
          id: category.id,
          name: category.name,
          code: category.code,
        },
        equipment,
        total: equipment.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/categories/search
 * @desc    Advanced category search
 * @access  Private
 */
const searchSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  filters: categoryFilterSchema.partial().optional(),
});

router.post(
  '/search',
  rateLimiter.api,
  validateRequest(searchSchema),
  async (req, res, next) => {
    try {
      const { schoolId, organizationId } = req.user!;
      const { query, filters = {} } = req.body;

      // Combine search query with existing filters
      const searchFilters = {
        ...filters,
        search: query,
      };

      const result = await getCategoriesList(searchFilters, schoolId, organizationId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/categories/:id/path
 * @desc    Get category path (breadcrumb) from root to this category
 * @access  Private
 */
router.get(
  '/:id/path',
  rateLimiter.api,
  validateRequest(categoryIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { schoolId, organizationId } = req.user!;
      const { id } = req.params;

      const path = await getCategoryPath(id, schoolId, organizationId);
      res.json({ path });
    } catch (error) {
      next(error);
    }
  }
);

// Helper function to get category path
const getCategoryPath = async (
  categoryId: string,
  schoolId?: string,
  organizationId?: string
): Promise<Array<{ id: string; name: string; code: string }>> => {
  const category = await getCategoryById(categoryId, schoolId, organizationId);
  
  if (!category.parentId) {
    return [{
      id: category.id,
      name: category.name,
      code: category.code,
    }];
  }

  const parentPath = await getCategoryPath(category.parentId, schoolId, organizationId);
  return [
    ...parentPath,
    {
      id: category.id,
      name: category.name,
      code: category.code,
    },
  ];
};

export default router;