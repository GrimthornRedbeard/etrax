import express from 'express';
import {
  createEquipment,
  getEquipmentById,
  updateEquipment,
  deleteEquipment,
  getEquipmentList,
  getEquipmentStats,
  bulkUpdateEquipmentStatus,
  createEquipmentSchema,
  updateEquipmentSchema,
  equipmentFilterSchema,
} from '@/services/equipment';
import { authMiddleware } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { rateLimiter } from '@/middleware/rateLimiter';
import { ApiError } from '@/middleware/errorHandler';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { prisma } from '@/index';

const router = express.Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'equipment');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 5, // Maximum 5 files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP) are allowed'));
    }
  },
});

// Validation schemas for route-specific data
const bulkUpdateSchema = z.object({
  equipmentIds: z.array(z.string().uuid()).min(1, 'At least one equipment ID is required'),
  status: z.enum(['AVAILABLE', 'CHECKED_OUT', 'MAINTENANCE', 'RETIRED', 'LOST', 'DAMAGED']),
});

const equipmentIdSchema = z.object({
  id: z.string().uuid('Invalid equipment ID'),
});

// Apply authentication to all routes
router.use(authMiddleware);

/**
 * @route   GET /api/equipment
 * @desc    Get equipment list with filtering and pagination
 * @access  Private
 */
router.get('/', rateLimiter.equipment, async (req, res, next) => {
  try {
    const { schoolId, organizationId } = req.user!;
    const filters = equipmentFilterSchema.parse(req.query);

    const result = await getEquipmentList(filters, schoolId!, organizationId!);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/equipment/stats
 * @desc    Get equipment statistics and analytics
 * @access  Private
 */
router.get('/stats', rateLimiter.equipment, async (req, res, next) => {
  try {
    const { schoolId, organizationId } = req.user!;
    const stats = await getEquipmentStats(schoolId!, organizationId!);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/equipment
 * @desc    Create new equipment
 * @access  Private
 */
router.post(
  '/',
  rateLimiter.equipment,
  upload.array('images', 5),
  validateRequest(createEquipmentSchema),
  async (req, res, next) => {
    try {
      const { userId, schoolId, organizationId } = req.user!;
      
      // Process uploaded images
      const imageUrls: string[] = [];
      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files) {
          // In production, you would upload to cloud storage (S3, CloudFlare, etc.)
          // For now, we'll store the local path
          const imageUrl = `/uploads/equipment/${file.filename}`;
          imageUrls.push(imageUrl);
        }
      }

      // Add image URLs to equipment data
      const equipmentData = {
        ...req.body,
        imageUrls,
      };

      const equipment = await createEquipment(
        equipmentData,
        userId,
        schoolId!,
        organizationId!
      );

      res.status(201).json({
        message: 'Equipment created successfully',
        equipment,
      });
    } catch (error) {
      // Clean up uploaded files on error
      if (req.files && Array.isArray(req.files)) {
        req.files.forEach(file => {
          fs.unlink(file.path, (unlinkError) => {
            if (unlinkError) {
              console.error('Failed to delete uploaded file:', unlinkError);
            }
          });
        });
      }
      next(error);
    }
  }
);

/**
 * @route   GET /api/equipment/:id
 * @desc    Get equipment by ID
 * @access  Private
 */
router.get(
  '/:id',
  rateLimiter.equipment,
  validateRequest(equipmentIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { schoolId, organizationId } = req.user!;
      const { id } = req.params;

      const equipment = await getEquipmentById(id, schoolId!, organizationId!);
      res.json(equipment);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/equipment/:id
 * @desc    Update equipment
 * @access  Private
 */
router.put(
  '/:id',
  rateLimiter.equipment,
  upload.array('images', 5),
  validateRequest(equipmentIdSchema, 'params'),
  validateRequest(updateEquipmentSchema),
  async (req, res, next) => {
    try {
      const { userId, schoolId, organizationId } = req.user!;
      const { id } = req.params;

      // Process uploaded images
      const imageUrls: string[] = [];
      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files) {
          const imageUrl = `/uploads/equipment/${file.filename}`;
          imageUrls.push(imageUrl);
        }
      }

      // If new images were uploaded, add them to existing images
      let updateData = { ...req.body };
      if (imageUrls.length > 0) {
        // In a real application, you might want to replace or append to existing images
        updateData.imageUrls = imageUrls;
      }

      const equipment = await updateEquipment(
        id,
        updateData,
        userId,
        schoolId!,
        organizationId!
      );

      res.json({
        message: 'Equipment updated successfully',
        equipment,
      });
    } catch (error) {
      // Clean up uploaded files on error
      if (req.files && Array.isArray(req.files)) {
        req.files.forEach(file => {
          fs.unlink(file.path, (unlinkError) => {
            if (unlinkError) {
              console.error('Failed to delete uploaded file:', unlinkError);
            }
          });
        });
      }
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/equipment/:id
 * @desc    Delete equipment (soft delete)
 * @access  Private
 */
router.delete(
  '/:id',
  rateLimiter.equipment,
  validateRequest(equipmentIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { userId, schoolId, organizationId } = req.user!;
      const { id } = req.params;

      const result = await deleteEquipment(id, userId, schoolId!, organizationId!);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/equipment/bulk-update
 * @desc    Bulk update equipment status
 * @access  Private (Admin/Manager only)
 */
router.post(
  '/bulk-update',
  rateLimiter.equipment,
  validateRequest(bulkUpdateSchema),
  async (req, res, next) => {
    try {
      const { userId, schoolId, organizationId, role } = req.user!;

      // Check if user has permission for bulk updates
      if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
        throw new ApiError('Insufficient permissions for bulk operations', 403);
      }

      const { equipmentIds, status } = req.body;

      const result = await bulkUpdateEquipmentStatus(
        equipmentIds,
        status,
        userId,
        schoolId!,
        organizationId!
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/equipment/:id/qr-code
 * @desc    Get QR code for specific equipment
 * @access  Private
 */
router.get(
  '/:id/qr-code',
  rateLimiter.equipment,
  validateRequest(equipmentIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { schoolId, organizationId } = req.user!;
      const { id } = req.params;

      const equipment = await getEquipmentById(id, schoolId!, organizationId!);
      
      if (!equipment.qrCodeUrl) {
        throw new ApiError('QR code not available for this equipment', 404);
      }

      res.json({
        equipmentId: equipment.id,
        equipmentName: equipment.name,
        equipmentCode: equipment.code,
        qrCodeUrl: equipment.qrCodeUrl,
        school: equipment.school,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/equipment/:id/history
 * @desc    Get equipment transaction history
 * @access  Private
 */
router.get(
  '/:id/history',
  rateLimiter.equipment,
  validateRequest(equipmentIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { schoolId, organizationId } = req.user!;
      const { id } = req.params;

      // Verify equipment exists and user has access
      await getEquipmentById(id, schoolId!, organizationId!);

      // Get transaction history
      const transactions = await prisma.transaction.findMany({
        where: {
          equipmentId: id,
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
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Get audit logs for this equipment
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          entityType: 'Equipment',
          entityId: id,
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
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 50,
      });

      res.json({
        transactions,
        auditLogs,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/equipment/search
 * @desc    Advanced equipment search with full-text search
 * @access  Private
 */
const searchSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  filters: equipmentFilterSchema.partial().optional(),
});

router.post(
  '/search',
  rateLimiter.equipment,
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

      const result = await getEquipmentList(searchFilters, schoolId!, organizationId!);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/equipment/:id/similar
 * @desc    Get similar equipment based on category, manufacturer, or model
 * @access  Private
 */
router.get(
  '/:id/similar',
  rateLimiter.equipment,
  validateRequest(equipmentIdSchema, 'params'),
  async (req, res, next) => {
    try {
      const { schoolId, organizationId } = req.user!;
      const { id } = req.params;

      const equipment = await getEquipmentById(id, schoolId!, organizationId!);

      // Find similar equipment based on category, manufacturer, or model
      const similarEquipment = await prisma.equipment.findMany({
        where: {
          id: { not: id },
          isDeleted: false,
          OR: [
            { schoolId },
            { organizationId, schoolId: null },
          ],
          AND: {
            OR: [
              { categoryId: equipment.categoryId },
              { manufacturer: equipment.manufacturer },
              { modelNumber: equipment.modelNumber },
            ],
          },
        },
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
        take: 10,
        orderBy: {
          createdAt: 'desc',
        },
      });

      res.json({
        originalEquipment: {
          id: equipment.id,
          name: equipment.name,
          category: equipment.category?.name,
          manufacturer: equipment.manufacturer,
          modelNumber: equipment.modelNumber,
        },
        similarEquipment,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;