import express from 'express';
import {
  createLocation,
  getLocationById,
  updateLocation,
  deleteLocation,
  getLocationsList,
  getLocationTree,
  getLocationStats,
  getAvailableLocations,
  createLocationSchema,
  updateLocationSchema,
  locationFilterSchema,
} from '@/services/location';
import { authMiddleware } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { rateLimiter } from '@/middleware/rateLimiter';
import { ApiError } from '@/middleware/errorHandler';
import { z } from 'zod';
import { prisma } from '@/index';

const router = express.Router();

// Validation schemas for route-specific data
const locationIdSchema = z.object({
  id: z.string().uuid('Invalid location ID'),
});

const equipmentIdSchema = z.object({
  equipmentId: z.string().uuid('Invalid equipment ID').optional(),
});

// Apply authentication to all routes
router.use(authMiddleware);

/**
 * @route   GET /api/locations
 * @desc    Get locations list with filtering and pagination
 * @access  Private
 */
router.get('/', rateLimiter.api, async (req, res, next) => {
  try {
    const { schoolId, organizationId } = req.user!;
    const filters = locationFilterSchema.parse(req.query);

    const result = await getLocationsList(filters, schoolId, organizationId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/locations/tree
 * @desc    Get locations in tree structure
 * @access  Private
 */
router.get('/tree', rateLimiter.api, async (req, res, next) => {
  try {
    const { schoolId, organizationId } = req.user!;
    const tree = await getLocationTree(schoolId, organizationId);
    res.json({ tree });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/locations/stats
 * @desc    Get location statistics and analytics
 * @access  Private
 */
router.get('/stats', rateLimiter.api, async (req, res, next) => {
  try {
    const { schoolId, organizationId } = req.user!;
    const stats = await getLocationStats(schoolId, organizationId);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/locations/available
 * @desc    Get available locations for equipment placement
 * @access  Private
 */
router.get(
  '/available',
  rateLimiter.api,
  validateRequest(equipmentIdSchema, 'query'),
  async (req, res, next) => {
    try {
      const { schoolId, organizationId } = req.user!;
      const { equipmentId } = req.query as any;

      const locations = await getAvailableLocations(
        equipmentId,
        schoolId,
        organizationId
      );
      res.json({ locations });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/locations
 * @desc    Create new location
 * @access  Private
 */
router.post(
  '/',
  rateLimiter.api,
  validateRequest(createLocationSchema),
  async (req, res, next) => {
    try {
      const { userId, schoolId, organizationId, role } = req.user!;

      // Check if user has permission to create locations
      if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
        throw new ApiError('Insufficient permissions to create locations', 403);
      }

      const location = await createLocation(
        req.body,
        userId,
        schoolId,
        organizationId
      );

      res.status(201).json({
        message: 'Location created successfully',
        location,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/locations/:id
 * @desc    Get location by ID
 * @access  Private
 */
router.get(
  '/:id',
  rateLimiter.api,
  validateRequest(locationIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { schoolId, organizationId } = req.user!;
      const { id } = req.params;

      const location = await getLocationById(id, schoolId, organizationId);
      res.json(location);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/locations/:id
 * @desc    Update location
 * @access  Private
 */
router.put(
  '/:id',
  rateLimiter.api,
  validateRequest(locationIdSchema, 'params'),
  validateRequest(updateLocationSchema),
  async (req, res, next) => {
    try {
      const { userId, schoolId, organizationId, role } = req.user!;
      const { id } = req.params;

      // Check if user has permission to update locations
      if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
        throw new ApiError('Insufficient permissions to update locations', 403);
      }

      const location = await updateLocation(
        id,
        req.body,
        userId,
        schoolId,
        organizationId
      );

      res.json({
        message: 'Location updated successfully',
        location,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/locations/:id
 * @desc    Delete location (soft delete)
 * @access  Private
 */
router.delete(
  '/:id',
  rateLimiter.api,
  validateRequest(locationIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { userId, schoolId, organizationId, role } = req.user!;
      const { id } = req.params;

      // Check if user has permission to delete locations
      if (!['ADMIN', 'MANAGER'].includes(role)) {
        throw new ApiError('Insufficient permissions to delete locations', 403);
      }

      const result = await deleteLocation(id, userId, schoolId, organizationId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/locations/:id/children
 * @desc    Get child locations of a specific location
 * @access  Private
 */
router.get(
  '/:id/children',
  rateLimiter.api,
  validateRequest(locationIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { schoolId, organizationId } = req.user!;
      const { id } = req.params;

      // Verify parent location exists and user has access
      await getLocationById(id, schoolId, organizationId);

      // Get child locations
      const filters = { parentId: id, includeInactive: false };
      const result = await getLocationsList(filters, schoolId, organizationId);

      res.json({
        parentId: id,
        children: result.locations,
        total: result.pagination.total,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/locations/:id/equipment
 * @desc    Get equipment in a specific location
 * @access  Private
 */
router.get(
  '/:id/equipment',
  rateLimiter.api,
  validateRequest(locationIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { schoolId, organizationId } = req.user!;
      const { id } = req.params;

      // Verify location exists and user has access
      const location = await getLocationById(id, schoolId, organizationId);

      // Get equipment in this location
      const equipment = await prisma.equipment.findMany({
        where: {
          locationId: id,
          isDeleted: false,
          OR: [
            { schoolId },
            { organizationId, schoolId: null },
          ],
        },
        include: {
          category: {
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
        location: {
          id: location.id,
          name: location.name,
          code: location.code,
          type: location.type,
          capacity: location.capacity,
          currentOccupancy: equipment.length,
          availableSpace: location.capacity ? location.capacity - equipment.length : null,
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
 * @route   POST /api/locations/search
 * @desc    Advanced location search
 * @access  Private
 */
const searchSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  filters: locationFilterSchema.partial().optional(),
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

      const result = await getLocationsList(searchFilters, schoolId, organizationId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/locations/:id/path
 * @desc    Get location path (breadcrumb) from root to this location
 * @access  Private
 */
router.get(
  '/:id/path',
  rateLimiter.api,
  validateRequest(locationIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { schoolId, organizationId } = req.user!;
      const { id } = req.params;

      const path = await getLocationPath(id, schoolId, organizationId);
      res.json({ path });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/locations/:id/occupancy
 * @desc    Get detailed occupancy information for a location
 * @access  Private
 */
router.get(
  '/:id/occupancy',
  rateLimiter.api,
  validateRequest(locationIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { schoolId, organizationId } = req.user!;
      const { id } = req.params;

      const location = await getLocationById(id, schoolId, organizationId);

      // Get equipment count by status
      const equipmentByStatus = await prisma.equipment.groupBy({
        by: ['status'],
        where: {
          locationId: id,
          isDeleted: false,
          OR: [
            { schoolId },
            { organizationId, schoolId: null },
          ],
        },
        _count: {
          id: true,
        },
      });

      // Get equipment count by condition
      const equipmentByCondition = await prisma.equipment.groupBy({
        by: ['condition'],
        where: {
          locationId: id,
          isDeleted: false,
          OR: [
            { schoolId },
            { organizationId, schoolId: null },
          ],
        },
        _count: {
          id: true,
        },
      });

      // Get equipment count by category
      const equipmentByCategory = await prisma.equipment.groupBy({
        by: ['categoryId'],
        where: {
          locationId: id,
          isDeleted: false,
          OR: [
            { schoolId },
            { organizationId, schoolId: null },
          ],
        },
        _count: {
          id: true,
        },
        take: 10,
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
      });

      const totalEquipment = equipmentByStatus.reduce((sum, status) => sum + status._count.id, 0);

      res.json({
        location: {
          id: location.id,
          name: location.name,
          code: location.code,
          type: location.type,
          capacity: location.capacity,
        },
        occupancy: {
          totalEquipment,
          capacity: location.capacity,
          utilizationRate: location.capacity ? (totalEquipment / location.capacity) * 100 : null,
          availableSpace: location.capacity ? location.capacity - totalEquipment : null,
          isAtCapacity: location.capacity ? totalEquipment >= location.capacity : false,
        },
        equipmentBreakdown: {
          byStatus: equipmentByStatus.map(status => ({
            status: status.status,
            count: status._count.id,
            percentage: totalEquipment > 0 ? (status._count.id / totalEquipment) * 100 : 0,
          })),
          byCondition: equipmentByCondition.map(condition => ({
            condition: condition.condition,
            count: condition._count.id,
            percentage: totalEquipment > 0 ? (condition._count.id / totalEquipment) * 100 : 0,
          })),
          byCategory: equipmentByCategory.map(category => ({
            categoryId: category.categoryId,
            count: category._count.id,
            percentage: totalEquipment > 0 ? (category._count.id / totalEquipment) * 100 : 0,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/locations/types
 * @desc    Get available location types
 * @access  Private
 */
router.get('/types', rateLimiter.api, async (req, res, next) => {
  try {
    const types = [
      { value: 'BUILDING', label: 'Building', description: 'Main building structure' },
      { value: 'ROOM', label: 'Room', description: 'Individual room or classroom' },
      { value: 'STORAGE', label: 'Storage', description: 'Storage area or closet' },
      { value: 'OUTDOOR', label: 'Outdoor', description: 'Outdoor area or field' },
      { value: 'VEHICLE', label: 'Vehicle', description: 'Bus, van, or other vehicle' },
      { value: 'OTHER', label: 'Other', description: 'Other type of location' },
    ];

    res.json({ types });
  } catch (error) {
    next(error);
  }
});

// Helper function to get location path
const getLocationPath = async (
  locationId: string,
  schoolId?: string,
  organizationId?: string
): Promise<Array<{ id: string; name: string; code: string; type: string }>> => {
  const location = await getLocationById(locationId, schoolId, organizationId);
  
  if (!location.parentId) {
    return [{
      id: location.id,
      name: location.name,
      code: location.code,
      type: location.type,
    }];
  }

  const parentPath = await getLocationPath(location.parentId, schoolId, organizationId);
  return [
    ...parentPath,
    {
      id: location.id,
      name: location.name,
      code: location.code,
      type: location.type,
    },
  ];
};

export default router;