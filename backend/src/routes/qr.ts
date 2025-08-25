import express from 'express';
import {
  QRCodeService,
  generateQRSchema,
  bulkGenerateQRSchema,
  qrLookupSchema
} from '@/services/qr';
import { authMiddleware } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { rateLimiter } from '@/middleware/rateLimiter';
import { ApiError } from '@/middleware/errorHandler';
import { prisma } from '@/index';
import { z } from 'zod';

const router = express.Router();

// Validation schemas for route-specific data
const equipmentIdSchema = z.object({
  equipmentId: z.string().uuid('Invalid equipment ID'),
});

// Apply authentication to all routes
router.use(authMiddleware);

/**
 * @route   POST /api/qr/generate
 * @desc    Generate QR code for single equipment
 * @access  Private (Admin/Manager/Staff only)
 */
router.post(
  '/generate',
  rateLimiter.api,
  validateRequest(generateQRSchema),
  async (req, res, next) => {
    try {
      const { role, schoolId, organizationId } = req.user!;
      
      // Check permissions for QR code generation
      if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
        throw new ApiError('Insufficient permissions to generate QR codes', 403);
      }

      const result = await QRCodeService.generateQRCode(
        req.body,
        schoolId!,
        organizationId!
      );

      if (!result.success) {
        throw new ApiError(result.error || 'Failed to generate QR code', 400);
      }

      res.json({
        message: 'QR code generated successfully',
        qrCodeUrl: result.qrCodeUrl,
        metadata: result.metadata,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/qr/generate/bulk
 * @desc    Generate QR codes for multiple equipment
 * @access  Private (Admin/Manager only)
 */
router.post(
  '/generate/bulk',
  rateLimiter.api,
  validateRequest(bulkGenerateQRSchema),
  async (req, res, next) => {
    try {
      const { role, schoolId, organizationId } = req.user!;
      
      // Check permissions for bulk QR code generation
      if (!['ADMIN', 'MANAGER'].includes(role)) {
        throw new ApiError('Insufficient permissions for bulk QR code generation', 403);
      }

      const result = await QRCodeService.bulkGenerateQRCodes(
        req.body,
        schoolId!,
        organizationId!
      );

      res.json({
        message: `Bulk QR code generation completed: ${result.totalGenerated} generated, ${result.totalFailed} failed`,
        totalGenerated: result.totalGenerated,
        totalFailed: result.totalFailed,
        results: result.results,
        zipFilePath: result.zipFilePath,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/qr/lookup
 * @desc    Look up equipment by QR code
 * @access  Private
 */
router.post(
  '/lookup',
  rateLimiter.api,
  validateRequest(qrLookupSchema),
  async (req, res, next) => {
    try {
      const { schoolId, organizationId } = req.user!;
      const { qrCode } = req.body;

      // Validate QR code format first
      const validation = QRCodeService.validateQRCode(qrCode);
      if (!validation.isValid) {
        throw new ApiError(validation.error || 'Invalid QR code format', 400);
      }

      const result = await QRCodeService.lookupEquipmentByQR(
        qrCode,
        schoolId!,
        organizationId!
      );

      if (!result.success) {
        throw new ApiError(result.error || 'Equipment not found', 404);
      }

      res.json({
        message: 'Equipment found successfully',
        equipment: result.equipment,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/qr/regenerate/:equipmentId
 * @desc    Regenerate QR code for equipment
 * @access  Private (Admin/Manager/Staff only)
 */
const regenerateSchema = z.object({
  reason: z.string().max(500, 'Reason too long').optional(),
});

router.post(
  '/regenerate/:equipmentId',
  rateLimiter.api,
  validateRequest(equipmentIdSchema, 'params'),
  validateRequest(regenerateSchema),
  async (req, res, next) => {
    try {
      const { role, schoolId, organizationId } = req.user!;
      const { equipmentId } = req.params;
      const { reason } = req.body;
      
      // Check permissions for QR code regeneration
      if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
        throw new ApiError('Insufficient permissions to regenerate QR codes', 403);
      }

      const result = await QRCodeService.regenerateQRCode(
        equipmentId,
        schoolId!,
        organizationId!,
        reason
      );

      if (!result.success) {
        throw new ApiError(result.error || 'Failed to regenerate QR code', 400);
      }

      res.json({
        message: 'QR code regenerated successfully',
        qrCodeUrl: result.qrCodeUrl,
        metadata: result.metadata,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/qr/stats
 * @desc    Get QR code statistics
 * @access  Private (Admin/Manager only)
 */
router.get('/stats', rateLimiter.api, async (req, res, next) => {
  try {
    const { role, schoolId, organizationId } = req.user!;
    
    // Check permissions for QR code statistics
    if (!['ADMIN', 'MANAGER'].includes(role)) {
      throw new ApiError('Insufficient permissions to view QR code statistics', 403);
    }

    const stats = await QRCodeService.getQRCodeStats(schoolId!, organizationId!);

    res.json({
      message: 'QR code statistics retrieved successfully',
      stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/qr/validate
 * @desc    Validate QR code format and structure
 * @access  Private
 */
router.post(
  '/validate',
  rateLimiter.api,
  validateRequest(qrLookupSchema),
  async (req, res, next) => {
    try {
      const { qrCode } = req.body;

      const validation = QRCodeService.validateQRCode(qrCode);

      res.json({
        isValid: validation.isValid,
        error: validation.error,
        data: validation.data,
        message: validation.isValid ? 'QR code is valid' : 'QR code is invalid',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/qr/equipment/:equipmentId
 * @desc    Get QR code information for specific equipment
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

      // Get equipment QR code information
      const equipment = await prisma.equipment.findFirst({
        where: {
          id: equipmentId,
          OR: [
            { schoolId },
            { organizationId, schoolId: null }
          ]
        },
        select: {
          id: true,
          name: true,
          code: true,
          qrCode: true,
          qrCodeUrl: true,
          qrCodeGenerated: true,
          qrCodeGeneratedAt: true
        }
      });

      if (!equipment) {
        throw new ApiError('Equipment not found or not accessible', 404);
      }

      res.json({
        message: 'Equipment QR code information retrieved successfully',
        equipment,
        hasQRCode: !!equipment.qrCodeGenerated,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/qr/cleanup
 * @desc    Clean up old QR code files
 * @access  Private (Admin only)
 */
const cleanupSchema = z.object({
  daysOld: z.number().min(1).max(365).optional().default(90),
});

router.delete(
  '/cleanup',
  rateLimiter.api,
  validateRequest(cleanupSchema),
  async (req, res, next) => {
    try {
      const { role } = req.user!;
      const { daysOld } = req.body;
      
      // Check permissions for QR code cleanup
      if (role !== 'ADMIN') {
        throw new ApiError('Insufficient permissions to clean up QR codes', 403);
      }

      const deletedCount = await QRCodeService.cleanupOldQRCodes(daysOld);

      res.json({
        message: `QR code cleanup completed: ${deletedCount} files deleted`,
        deletedCount,
        daysOld,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/qr/missing
 * @desc    Get equipment that don't have QR codes
 * @access  Private (Admin/Manager only)
 */
const paginationSchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
});

router.get(
  '/missing',
  rateLimiter.api,
  validateRequest(paginationSchema, 'query'),
  async (req, res, next) => {
    try {
      const { role, schoolId, organizationId } = req.user!;
      const { page, limit } = req.query;
      
      // Check permissions
      if (!['ADMIN', 'MANAGER'].includes(role)) {
        throw new ApiError('Insufficient permissions to view missing QR codes', 403);
      }

      const skip = (Number(page) - 1) * Number(limit);

      // Get equipment without QR codes
      const [equipmentWithoutQR, total] = await Promise.all([
        prisma.equipment.findMany({
          where: {
            OR: [{ schoolId }, { organizationId, schoolId: null }],
            isDeleted: false,
            qrCodeGenerated: { not: true }
          },
          select: {
            id: true,
            name: true,
            code: true,
            status: true,
            category: { select: { name: true } },
            location: { select: { name: true } },
            createdAt: true
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: Number(limit)
        }),
        
        prisma.equipment.count({
          where: {
            OR: [{ schoolId }, { organizationId, schoolId: null }],
            isDeleted: false,
            qrCodeGenerated: { not: true }
          }
        })
      ]);

      res.json({
        message: 'Equipment without QR codes retrieved successfully',
        equipment: equipmentWithoutQR,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: total || 0,
          pages: Math.ceil((total || 0) / Number(limit))
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;