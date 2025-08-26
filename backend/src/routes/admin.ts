import express from 'express';
import { UserManagementService } from '../services/auth/UserManagementService';
import { MultiTenantService } from '../services/auth/MultiTenantService';
import { authenticate, authorize, requireRole, auditLog } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { logger } from '../utils/logger';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const createUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['VIEWER', 'USER', 'MANAGER', 'ADMIN']),
  organizationId: z.string().uuid(),
  sendInvite: z.boolean().optional(),
  temporaryPassword: z.boolean().optional()
});

const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(['VIEWER', 'USER', 'MANAGER', 'ADMIN']).optional(),
  isActive: z.boolean().optional(),
  organizationId: z.string().uuid().optional()
});

const bulkImportSchema = z.object({
  users: z.array(z.object({
    email: z.string().email(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    role: z.enum(['VIEWER', 'USER', 'MANAGER', 'ADMIN']).optional(),
    department: z.string().optional(),
    employeeId: z.string().optional()
  })),
  organizationId: z.string().uuid(),
  sendInvites: z.boolean().optional()
});

const createTenantSchema = z.object({
  organizationConfig: z.object({
    name: z.string().min(1),
    domain: z.string().min(1),
    allowedDomains: z.array(z.string()).optional(),
    subscriptionPlan: z.enum(['free', 'basic', 'professional', 'enterprise']),
    maxUsers: z.number().positive().optional(),
    features: z.array(z.string()).optional(),
    settings: z.any().optional(),
    branding: z.object({
      logo: z.string().optional(),
      primaryColor: z.string().optional(),
      customCss: z.string().optional()
    }).optional()
  }),
  adminUser: z.object({
    email: z.string().email(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    password: z.string().min(8).optional(),
    sendInvite: z.boolean().optional()
  }),
  authProviders: z.object({
    saml: z.any().optional(),
    oauth2: z.object({
      google: z.boolean().optional(),
      microsoft: z.boolean().optional(),
      github: z.boolean().optional()
    }).optional()
  }).optional()
});

// Apply authentication and admin role requirement to all routes
router.use(authenticate);
router.use(requireRole(['ADMIN', 'SUPER_ADMIN']));

// === USER MANAGEMENT ROUTES ===

/**
 * POST /admin/users - Create a new user
 */
router.post('/users',
  authorize(['users:write']),
  validateRequest(createUserSchema),
  auditLog('admin_create_user', 'user'),
  async (req, res) => {
    try {
      const user = await UserManagementService.createUser(req.body, req.user!.id);
      
      res.status(201).json({
        success: true,
        data: user
      });
    } catch (error) {
      logger.error('Admin create user error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create user'
      });
    }
  }
);

/**
 * GET /admin/users - Get users with filtering and pagination
 */
router.get('/users',
  authorize(['users:read']),
  async (req, res) => {
    try {
      const filters = {
        organizationId: req.query.organizationId as string,
        role: req.query.role as string,
        isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
        search: req.query.search as string,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50
      };

      const result = await UserManagementService.getUsers(filters);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Admin get users error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get users'
      });
    }
  }
);

/**
 * GET /admin/users/:id - Get user by ID
 */
router.get('/users/:id',
  authorize(['users:read']),
  async (req, res) => {
    try {
      const user = await UserManagementService.getUserById(req.params.id);
      
      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      logger.error('Admin get user error:', error);
      res.status(404).json({
        success: false,
        error: error instanceof Error ? error.message : 'User not found'
      });
    }
  }
);

/**
 * PUT /admin/users/:id - Update user
 */
router.put('/users/:id',
  authorize(['users:write']),
  validateRequest(updateUserSchema),
  auditLog('admin_update_user', 'user'),
  async (req, res) => {
    try {
      const user = await UserManagementService.updateUser(req.params.id, req.body, req.user!.id);
      
      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      logger.error('Admin update user error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update user'
      });
    }
  }
);

/**
 * DELETE /admin/users/:id - Delete/deactivate user
 */
router.delete('/users/:id',
  authorize(['users:delete']),
  auditLog('admin_delete_user', 'user'),
  async (req, res) => {
    try {
      const hardDelete = req.query.hard === 'true';
      await UserManagementService.deleteUser(req.params.id, req.user!.id, hardDelete);
      
      res.json({
        success: true,
        message: hardDelete ? 'User deleted permanently' : 'User deactivated'
      });
    } catch (error) {
      logger.error('Admin delete user error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete user'
      });
    }
  }
);

/**
 * POST /admin/users/:id/role - Update user role
 */
router.post('/users/:id/role',
  authorize(['users:write']),
  auditLog('admin_change_role', 'user'),
  async (req, res) => {
    try {
      const { role } = req.body;
      
      if (!role) {
        return res.status(400).json({
          success: false,
          error: 'Role is required'
        });
      }

      await UserManagementService.updateUserRole(req.params.id, role, req.user!.id);
      
      res.json({
        success: true,
        message: 'User role updated successfully'
      });
    } catch (error) {
      logger.error('Admin update role error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update role'
      });
    }
  }
);

/**
 * POST /admin/users/invite - Send user invitation
 */
router.post('/users/invite',
  authorize(['users:write']),
  auditLog('admin_invite_user', 'user'),
  async (req, res) => {
    try {
      const { email, role, organizationId } = req.body;
      
      await UserManagementService.sendUserInvitation(
        'temp-id', // Will be updated in service
        email,
        role,
        organizationId,
        req.user!.id
      );
      
      res.json({
        success: true,
        message: 'Invitation sent successfully'
      });
    } catch (error) {
      logger.error('Admin send invitation error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send invitation'
      });
    }
  }
);

/**
 * POST /admin/users/bulk-import - Bulk import users
 */
router.post('/users/bulk-import',
  authorize(['users:write']),
  validateRequest(bulkImportSchema),
  auditLog('admin_bulk_import', 'user'),
  async (req, res) => {
    try {
      const result = await UserManagementService.bulkImportUsers(req.body, req.user!.id);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Admin bulk import error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Bulk import failed'
      });
    }
  }
);

// === ORGANIZATION MANAGEMENT ROUTES ===

/**
 * POST /admin/organizations - Create new organization (tenant)
 */
router.post('/organizations',
  requireRole(['SUPER_ADMIN']),
  validateRequest(createTenantSchema),
  auditLog('admin_create_tenant', 'organization'),
  async (req, res) => {
    try {
      const result = await MultiTenantService.createTenant(req.body);
      
      res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Admin create tenant error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create organization'
      });
    }
  }
);

/**
 * GET /admin/organizations - Get all organizations
 */
router.get('/organizations',
  requireRole(['SUPER_ADMIN']),
  async (req, res) => {
    try {
      const filters = {
        search: req.query.search as string,
        subscriptionPlan: req.query.subscriptionPlan as string,
        isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50
      };

      const result = await MultiTenantService.getOrganizations(filters);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Admin get organizations error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get organizations'
      });
    }
  }
);

/**
 * GET /admin/organizations/:id - Get organization details
 */
router.get('/organizations/:id',
  requireRole(['SUPER_ADMIN']),
  async (req, res) => {
    try {
      const organization = await MultiTenantService.getOrganizationSettings(req.params.id);
      
      res.json({
        success: true,
        data: organization
      });
    } catch (error) {
      logger.error('Admin get organization error:', error);
      res.status(404).json({
        success: false,
        error: error instanceof Error ? error.message : 'Organization not found'
      });
    }
  }
);

/**
 * PUT /admin/organizations/:id - Update organization
 */
router.put('/organizations/:id',
  requireRole(['SUPER_ADMIN']),
  auditLog('admin_update_organization', 'organization'),
  async (req, res) => {
    try {
      const organization = await MultiTenantService.updateOrganization(
        req.params.id,
        req.body,
        req.user!.id
      );
      
      res.json({
        success: true,
        data: organization
      });
    } catch (error) {
      logger.error('Admin update organization error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update organization'
      });
    }
  }
);

/**
 * POST /admin/organizations/:id/deactivate - Deactivate organization
 */
router.post('/organizations/:id/deactivate',
  requireRole(['SUPER_ADMIN']),
  auditLog('admin_deactivate_organization', 'organization'),
  async (req, res) => {
    try {
      const { reason } = req.body;
      
      await MultiTenantService.deactivateOrganization(req.params.id, req.user!.id, reason);
      
      res.json({
        success: true,
        message: 'Organization deactivated successfully'
      });
    } catch (error) {
      logger.error('Admin deactivate organization error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to deactivate organization'
      });
    }
  }
);

/**
 * POST /admin/organizations/:id/reactivate - Reactivate organization
 */
router.post('/organizations/:id/reactivate',
  requireRole(['SUPER_ADMIN']),
  auditLog('admin_reactivate_organization', 'organization'),
  async (req, res) => {
    try {
      await MultiTenantService.reactivateOrganization(req.params.id, req.user!.id);
      
      res.json({
        success: true,
        message: 'Organization reactivated successfully'
      });
    } catch (error) {
      logger.error('Admin reactivate organization error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reactivate organization'
      });
    }
  }
);

/**
 * GET /admin/organizations/:id/stats - Get organization statistics
 */
router.get('/organizations/:id/stats',
  requireRole(['SUPER_ADMIN']),
  async (req, res) => {
    try {
      const stats = await MultiTenantService.getTenantStats(req.params.id);
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Admin get organization stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get organization statistics'
      });
    }
  }
);

/**
 * POST /admin/organizations/:id/saml - Setup SAML for organization
 */
router.post('/organizations/:id/saml',
  requireRole(['SUPER_ADMIN']),
  auditLog('admin_setup_saml', 'organization'),
  async (req, res) => {
    try {
      await MultiTenantService.setupSAML(req.params.id, req.body, req.user!.id);
      
      res.json({
        success: true,
        message: 'SAML configured successfully'
      });
    } catch (error) {
      logger.error('Admin setup SAML error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to setup SAML'
      });
    }
  }
);

/**
 * DELETE /admin/organizations/:id/saml - Remove SAML configuration
 */
router.delete('/organizations/:id/saml',
  requireRole(['SUPER_ADMIN']),
  auditLog('admin_remove_saml', 'organization'),
  async (req, res) => {
    try {
      await MultiTenantService.removeSAML(req.params.id, req.user!.id);
      
      res.json({
        success: true,
        message: 'SAML configuration removed'
      });
    } catch (error) {
      logger.error('Admin remove SAML error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove SAML'
      });
    }
  }
);

/**
 * POST /admin/organizations/:id/saml/test - Test SAML configuration
 */
router.post('/organizations/:id/saml/test',
  requireRole(['SUPER_ADMIN']),
  async (req, res) => {
    try {
      const result = await MultiTenantService.testSAML(req.params.id, req.body);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Admin test SAML error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test SAML'
      });
    }
  }
);

export default router;