import { Request, Response, NextFunction } from 'express';
import { JWTService, JWTPayload } from '../services/auth/JWTService';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        organizationId: string | null;
        permissions: string[];
        sessionId: string;
      };
      organizationId?: string;
      organization?: {
        id: string;
        name: string;
        domain: string;
        settings: any;
        subscriptionPlan: string;
        isActive: boolean;
      };
    }
  }
}

/**
 * Authentication middleware - validates JWT tokens
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization token required'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    try {
      const payload: JWTPayload = await JWTService.verifyToken(token, 'access');
      
      // Verify user still exists and is active
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          email: true,
          role: true,
          organizationId: true,
          isActive: true
        }
      });

      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          error: 'User not found or inactive'
        });
      }

      // Attach user info to request
      req.user = {
        id: payload.userId,
        email: payload.email,
        role: payload.role,
        organizationId: payload.organizationId,
        permissions: payload.permissions,
        sessionId: payload.sessionId
      };

      next();
    } catch (tokenError) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }
  } catch (error) {
    logger.error('Authentication middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication error'
    });
  }
};

/**
 * Authorization middleware - checks user permissions
 */
export const authorize = (requiredPermissions: string[] | string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
    const userPermissions = req.user.permissions;

    // Super admin has all permissions
    if (userPermissions.includes('*')) {
      return next();
    }

    // Check if user has required permissions
    const hasPermission = permissions.some(permission => {
      // Check exact match
      if (userPermissions.includes(permission)) return true;
      
      // Check wildcard permissions (e.g., 'users:*' matches 'users:read')
      const [resource] = permission.split(':');
      if (userPermissions.includes(`${resource}:*`)) return true;
      
      return false;
    });

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        required: permissions,
        current: userPermissions
      });
    }

    next();
  };
};

/**
 * Role-based authorization middleware
 */
export const requireRole = (roles: string[] | string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient role permissions',
        required: allowedRoles,
        current: req.user.role
      });
    }

    next();
  };
};

/**
 * Organization isolation middleware - ensures users can only access their org data
 */
export const requireOrganization = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  if (!req.user.organizationId) {
    return res.status(403).json({
      success: false,
      error: 'User not associated with an organization'
    });
  }

  // Add organization filter to request
  req.organizationId = req.user.organizationId;
  next();
};

/**
 * Multi-tenant middleware - adds organization context
 */
export const addTenantContext = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user?.organizationId) {
      const organization = await prisma.organization.findUnique({
        where: { id: req.user.organizationId },
        select: {
          id: true,
          name: true,
          domain: true,
          settings: true,
          isActive: true
        }
      });

      if (!organization || !organization.isActive) {
        return res.status(403).json({
          success: false,
          error: 'Organization not found or inactive'
        });
      }

      req.organization = {
        ...organization,
        subscriptionPlan: 'basic' // Default value
      };
    }

    next();
  } catch (error) {
    logger.error('Tenant context middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Tenant context error'
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token provided
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // Continue without auth
  }

  try {
    const token = authHeader.substring(7);
    const payload: JWTPayload = await JWTService.verifyToken(token, 'access');
    
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        role: true,
        organizationId: true,
        isActive: true
      }
    });

    if (user && user.isActive) {
      req.user = {
        id: payload.userId,
        email: payload.email,
        role: payload.role,
        organizationId: payload.organizationId,
        permissions: payload.permissions,
        sessionId: payload.sessionId
      };
    }
  } catch (error) {
    // Ignore auth errors for optional auth
  }

  next();
};

/**
 * Audit logging middleware for sensitive operations
 */
export const auditLog = (action: string, resource: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const originalSend = res.send;
    
    res.send = function(data) {
      // Log after successful response
      if (res.statusCode < 400 && req.user) {
        prisma.auditLog.create({
          data: {
            userId: req.user.id,
            action,
            resource,
            resourceId: req.params.id || null,
            metadata: {
              method: req.method,
              path: req.path,
              params: req.params,
              query: req.query,
              ip: req.ip,
              userAgent: req.get('User-Agent')
            }
          }
        }).catch(error => {
          logger.error('Failed to log audit event:', error);
        });
      }
      
      return originalSend.call(this, data);
    };

    next();
  };
};

// Legacy middleware for backward compatibility
export const authMiddleware = authenticate;
export const requireSchoolAccess = requireOrganization;