import express from 'express';
import {
  ReportsService,
  dateRangeSchema,
  equipmentReportSchema,
  utilizationReportSchema,
  financialReportSchema,
  maintenanceReportSchema
} from '@/services/reports';
import { authMiddleware } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { rateLimiter } from '@/middleware/rateLimiter';
import { ApiError } from '@/middleware/errorHandler';
import { prisma } from '@/index';
import { z } from 'zod';

const router = express.Router();

// Validation schemas for route-specific data
const customReportSchema = z.object({
  reportType: z.enum(['equipment_usage', 'financial_overview', 'maintenance_summary', 'equipment_inventory']),
  filters: z.record(z.any()).optional().default({}),
  groupBy: z.string().optional(),
  metrics: z.array(z.string()).optional(),
  chartType: z.enum(['bar', 'line', 'pie', 'table']).optional().default('table'),
  format: z.enum(['json', 'csv', 'pdf']).optional().default('json')
});

const scheduleReportSchema = z.object({
  name: z.string().min(1, 'Report name is required'),
  reportType: z.enum(['equipment_usage', 'financial_overview', 'maintenance_summary', 'equipment_inventory']),
  filters: z.record(z.any()).optional().default({}),
  schedule: z.object({
    frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly']),
    dayOfWeek: z.number().min(0).max(6).optional(), // For weekly reports
    dayOfMonth: z.number().min(1).max(31).optional(), // For monthly reports
    hour: z.number().min(0).max(23).optional().default(9)
  }),
  recipients: z.array(z.string().email()).min(1, 'At least one recipient is required'),
  format: z.enum(['json', 'csv', 'pdf']).optional().default('pdf')
});

// Apply authentication to all routes
router.use(authMiddleware);

/**
 * @route   GET /api/reports/dashboard
 * @desc    Get dashboard summary statistics
 * @access  Private
 */
router.get('/dashboard', rateLimiter.api, async (req, res, next) => {
  try {
    const { schoolId, organizationId } = req.user!;

    const summary = await ReportsService.generateDashboardSummary(
      schoolId!,
      organizationId!
    );

    res.json({
      message: 'Dashboard summary generated successfully',
      data: summary
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/reports/equipment
 * @desc    Generate equipment inventory report
 * @access  Private (Admin/Manager only)
 */
router.post(
  '/equipment',
  rateLimiter.api,
  validateRequest(equipmentReportSchema),
  async (req, res, next) => {
    try {
      const { role, schoolId, organizationId } = req.user!;
      
      // Check permissions for detailed reports
      if (!['ADMIN', 'MANAGER'].includes(role)) {
        throw new ApiError('Insufficient permissions to generate equipment reports', 403);
      }

      const report = await ReportsService.generateEquipmentReport(
        req.body,
        schoolId!,
        organizationId!
      );

      res.json({
        message: 'Equipment report generated successfully',
        reportType: 'equipment_inventory',
        generatedAt: new Date().toISOString(),
        filters: req.body,
        data: report
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/reports/utilization
 * @desc    Generate equipment utilization report
 * @access  Private (Admin/Manager only)
 */
router.post(
  '/utilization',
  rateLimiter.api,
  validateRequest(utilizationReportSchema),
  async (req, res, next) => {
    try {
      const { role, schoolId, organizationId } = req.user!;
      
      // Check permissions for utilization reports
      if (!['ADMIN', 'MANAGER'].includes(role)) {
        throw new ApiError('Insufficient permissions to generate utilization reports', 403);
      }

      const report = await ReportsService.generateUtilizationReport(
        req.body,
        schoolId!,
        organizationId!
      );

      res.json({
        message: 'Utilization report generated successfully',
        reportType: 'equipment_usage',
        generatedAt: new Date().toISOString(),
        filters: req.body,
        data: report
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/reports/financial
 * @desc    Generate financial report
 * @access  Private (Admin/Manager only)
 */
router.post(
  '/financial',
  rateLimiter.api,
  validateRequest(financialReportSchema),
  async (req, res, next) => {
    try {
      const { role, schoolId, organizationId } = req.user!;
      
      // Check permissions for financial reports
      if (!['ADMIN', 'MANAGER'].includes(role)) {
        throw new ApiError('Insufficient permissions to generate financial reports', 403);
      }

      const report = await ReportsService.generateFinancialReport(
        req.body,
        schoolId!,
        organizationId!
      );

      res.json({
        message: 'Financial report generated successfully',
        reportType: 'financial_overview',
        generatedAt: new Date().toISOString(),
        filters: req.body,
        data: report
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/reports/maintenance
 * @desc    Generate maintenance report
 * @access  Private (Admin/Manager/Staff only)
 */
router.post(
  '/maintenance',
  rateLimiter.api,
  validateRequest(maintenanceReportSchema),
  async (req, res, next) => {
    try {
      const { role, schoolId, organizationId } = req.user!;
      
      // Check permissions for maintenance reports
      if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
        throw new ApiError('Insufficient permissions to generate maintenance reports', 403);
      }

      const report = await ReportsService.generateMaintenanceReport(
        req.body,
        schoolId!,
        organizationId!
      );

      res.json({
        message: 'Maintenance report generated successfully',
        reportType: 'maintenance_summary',
        generatedAt: new Date().toISOString(),
        filters: req.body,
        data: report
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/reports/custom
 * @desc    Generate custom report based on configuration
 * @access  Private (Admin/Manager only)
 */
router.post(
  '/custom',
  rateLimiter.api,
  validateRequest(customReportSchema),
  async (req, res, next) => {
    try {
      const { role, schoolId, organizationId } = req.user!;
      
      // Check permissions for custom reports
      if (!['ADMIN', 'MANAGER'].includes(role)) {
        throw new ApiError('Insufficient permissions to generate custom reports', 403);
      }

      const report = await ReportsService.generateCustomReport(
        req.body,
        schoolId!,
        organizationId!
      );

      res.json({
        message: 'Custom report generated successfully',
        reportType: req.body.reportType,
        generatedAt: new Date().toISOString(),
        configuration: req.body,
        data: report
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/reports/templates
 * @desc    Get available report templates
 * @access  Private (Admin/Manager only)
 */
router.get('/templates', rateLimiter.api, async (req, res, next) => {
  try {
    const { role } = req.user!;
    
    // Check permissions for report templates
    if (!['ADMIN', 'MANAGER'].includes(role)) {
      throw new ApiError('Insufficient permissions to view report templates', 403);
    }

    const templates = {
      equipment_inventory: {
        name: 'Equipment Inventory Report',
        description: 'Comprehensive overview of all equipment including status, location, and value',
        fields: [
          { name: 'categoryIds', type: 'array', description: 'Filter by equipment categories' },
          { name: 'locationIds', type: 'array', description: 'Filter by equipment locations' },
          { name: 'status', type: 'array', description: 'Filter by equipment status' },
          { name: 'includeDeleted', type: 'boolean', description: 'Include deleted equipment' }
        ],
        formats: ['json', 'csv', 'pdf'],
        permissions: ['ADMIN', 'MANAGER']
      },
      equipment_usage: {
        name: 'Equipment Utilization Report',
        description: 'Analysis of equipment usage patterns and utilization rates',
        fields: [
          { name: 'equipmentIds', type: 'array', description: 'Filter by specific equipment' },
          { name: 'categoryIds', type: 'array', description: 'Filter by equipment categories' },
          { name: 'groupBy', type: 'enum', options: ['equipment', 'category', 'location', 'user'] }
        ],
        formats: ['json', 'csv', 'pdf'],
        permissions: ['ADMIN', 'MANAGER']
      },
      financial_overview: {
        name: 'Financial Overview Report',
        description: 'Financial analysis including equipment value, depreciation, and acquisition trends',
        fields: [
          { name: 'includeDepreciation', type: 'boolean', description: 'Include depreciation calculations' },
          { name: 'groupBy', type: 'enum', options: ['category', 'location', 'month', 'quarter'] }
        ],
        formats: ['json', 'csv', 'pdf'],
        permissions: ['ADMIN', 'MANAGER']
      },
      maintenance_summary: {
        name: 'Maintenance Summary Report',
        description: 'Overview of maintenance requests, completion rates, and equipment health',
        fields: [
          { name: 'status', type: 'array', description: 'Filter by maintenance status' },
          { name: 'priority', type: 'array', description: 'Filter by maintenance priority' },
          { name: 'includePreventive', type: 'boolean', description: 'Include preventive maintenance' }
        ],
        formats: ['json', 'csv', 'pdf'],
        permissions: ['ADMIN', 'MANAGER', 'STAFF']
      }
    };

    res.json({
      message: 'Report templates retrieved successfully',
      templates
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/reports/filters
 * @desc    Get available filter options for reports
 * @access  Private (Admin/Manager only)
 */
router.get('/filters', rateLimiter.api, async (req, res, next) => {
  try {
    const { role, schoolId, organizationId } = req.user!;
    
    // Check permissions for filter options
    if (!['ADMIN', 'MANAGER'].includes(role)) {
      throw new ApiError('Insufficient permissions to view report filters', 403);
    }

    // Get available filter options from database
    const [categories, locations, users] = await Promise.all([
      // Equipment categories
      prisma.category.findMany({
        where: {
          OR: [{ schoolId }, { organizationId, schoolId: null }],
          isActive: true
        },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' }
      }) || [],

      // Equipment locations
      prisma.location.findMany({
        where: {
          OR: [{ schoolId }, { organizationId, schoolId: null }],
          isActive: true
        },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' }
      }) || [],

      // Users (for assignment filters)
      prisma.user.findMany({
        where: {
          OR: [{ schoolId }, { organizationId, schoolId: null }],
          isActive: true
        },
        select: { 
          id: true, 
          firstName: true, 
          lastName: true, 
          email: true, 
          role: true 
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }]
      }) || []
    ]);

    const filterOptions = {
      categories,
      locations,
      users: users.map(user => ({
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role
      })),
      statuses: [
        { value: 'AVAILABLE', label: 'Available' },
        { value: 'CHECKED_OUT', label: 'Checked Out' },
        { value: 'MAINTENANCE', label: 'Maintenance' },
        { value: 'DAMAGED', label: 'Damaged' },
        { value: 'LOST', label: 'Lost' },
        { value: 'RETIRED', label: 'Retired' },
        { value: 'RESERVED', label: 'Reserved' },
        { value: 'OVERDUE', label: 'Overdue' }
      ],
      maintenanceStatuses: [
        { value: 'PENDING', label: 'Pending' },
        { value: 'IN_PROGRESS', label: 'In Progress' },
        { value: 'COMPLETED', label: 'Completed' },
        { value: 'CANCELLED', label: 'Cancelled' }
      ],
      priorities: [
        { value: 'LOW', label: 'Low' },
        { value: 'MEDIUM', label: 'Medium' },
        { value: 'HIGH', label: 'High' },
        { value: 'URGENT', label: 'Urgent' }
      ],
      periods: [
        { value: 'day', label: 'Today' },
        { value: 'week', label: 'This Week' },
        { value: 'month', label: 'This Month' },
        { value: 'quarter', label: 'This Quarter' },
        { value: 'year', label: 'This Year' },
        { value: 'custom', label: 'Custom Range' }
      ],
      groupByOptions: {
        utilization: ['equipment', 'category', 'location', 'user'],
        financial: ['category', 'location', 'month', 'quarter']
      },
      formats: [
        { value: 'json', label: 'JSON' },
        { value: 'csv', label: 'CSV' },
        { value: 'pdf', label: 'PDF' }
      ]
    };

    res.json({
      message: 'Report filter options retrieved successfully',
      filterOptions
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/reports/schedule
 * @desc    Schedule recurring report generation
 * @access  Private (Admin only)
 */
router.post(
  '/schedule',
  rateLimiter.api,
  validateRequest(scheduleReportSchema),
  async (req, res, next) => {
    try {
      const { role, userId, schoolId, organizationId } = req.user!;
      
      // Check permissions for scheduling reports
      if (role !== 'ADMIN') {
        throw new ApiError('Insufficient permissions to schedule reports', 403);
      }

      const { name, reportType, filters, schedule, recipients, format } = req.body;

      // Create scheduled report entry
      const scheduledReport = await prisma.scheduledReport.create({
        data: {
          name,
          reportType,
          filters,
          schedule,
          recipients,
          format,
          isActive: true,
          createdById: userId,
          schoolId,
          organizationId
        }
      });

      res.json({
        message: 'Report scheduled successfully',
        scheduledReport: {
          id: scheduledReport?.id,
          name: scheduledReport?.name,
          reportType: scheduledReport?.reportType,
          schedule: scheduledReport?.schedule,
          recipients: scheduledReport?.recipients,
          format: scheduledReport?.format,
          isActive: scheduledReport?.isActive,
          createdAt: scheduledReport?.createdAt
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/reports/scheduled
 * @desc    Get scheduled reports
 * @access  Private (Admin only)
 */
router.get('/scheduled', rateLimiter.api, async (req, res, next) => {
  try {
    const { role, schoolId, organizationId } = req.user!;
    
    // Check permissions for viewing scheduled reports
    if (role !== 'ADMIN') {
      throw new ApiError('Insufficient permissions to view scheduled reports', 403);
    }

    const scheduledReports = await prisma.scheduledReport.findMany({
      where: {
        OR: [{ schoolId }, { organizationId, schoolId: null }]
      },
      include: {
        createdBy: {
          select: { firstName: true, lastName: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    }) || [];

    res.json({
      message: 'Scheduled reports retrieved successfully',
      scheduledReports: scheduledReports.map(report => ({
        id: report.id,
        name: report.name,
        reportType: report.reportType,
        schedule: report.schedule,
        recipients: report.recipients,
        format: report.format,
        isActive: report.isActive,
        lastRun: report.lastRun,
        nextRun: report.nextRun,
        createdBy: report.createdBy,
        createdAt: report.createdAt
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/reports/scheduled/:id
 * @desc    Update scheduled report
 * @access  Private (Admin only)
 */
const updateScheduledReportSchema = z.object({
  name: z.string().min(1).optional(),
  schedule: z.object({
    frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly']),
    dayOfWeek: z.number().min(0).max(6).optional(),
    dayOfMonth: z.number().min(1).max(31).optional(),
    hour: z.number().min(0).max(23).optional().default(9)
  }).optional(),
  recipients: z.array(z.string().email()).min(1).optional(),
  isActive: z.boolean().optional()
});

router.put(
  '/scheduled/:id',
  rateLimiter.api,
  validateRequest(updateScheduledReportSchema),
  async (req, res, next) => {
    try {
      const { role, schoolId, organizationId } = req.user!;
      const { id } = req.params;
      
      // Check permissions for updating scheduled reports
      if (role !== 'ADMIN') {
        throw new ApiError('Insufficient permissions to update scheduled reports', 403);
      }

      const updatedReport = await prisma.scheduledReport.update({
        where: {
          id,
          OR: [{ schoolId }, { organizationId, schoolId: null }]
        },
        data: {
          ...req.body,
          updatedAt: new Date()
        }
      });

      res.json({
        message: 'Scheduled report updated successfully',
        scheduledReport: updatedReport
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/reports/scheduled/:id
 * @desc    Delete scheduled report
 * @access  Private (Admin only)
 */
router.delete('/scheduled/:id', rateLimiter.api, async (req, res, next) => {
  try {
    const { role, schoolId, organizationId } = req.user!;
    const { id } = req.params;
    
    // Check permissions for deleting scheduled reports
    if (role !== 'ADMIN') {
      throw new ApiError('Insufficient permissions to delete scheduled reports', 403);
    }

    await prisma.scheduledReport.delete({
      where: {
        id,
        OR: [{ schoolId }, { organizationId, schoolId: null }]
      }
    });

    res.json({
      message: 'Scheduled report deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/reports/export/:id
 * @desc    Export report data in specified format
 * @access  Private (Admin/Manager only)
 */
router.get('/export/:id', rateLimiter.api, async (req, res, next) => {
  try {
    const { role, schoolId, organizationId } = req.user!;
    const { id } = req.params;
    const { format = 'json' } = req.query;
    
    // Check permissions for exporting reports
    if (!['ADMIN', 'MANAGER'].includes(role)) {
      throw new ApiError('Insufficient permissions to export reports', 403);
    }

    // For now, we'll just return a placeholder response
    // In a full implementation, this would retrieve cached report data
    // and format it according to the requested format
    
    res.json({
      message: 'Report export functionality not yet implemented',
      reportId: id,
      format,
      note: 'This endpoint would export report data in the requested format'
    });
  } catch (error) {
    next(error);
  }
});

export default router;