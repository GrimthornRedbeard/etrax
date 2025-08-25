import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@/config/environment';
import { ApiError } from '@/middleware/errorHandler';
import { prisma } from '@/index';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    schoolId?: string;
    organizationId?: string;
  };
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError('No token provided', 401);
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      throw new ApiError('No token provided', 401);
    }

    const decoded = jwt.verify(token, config.jwt.secret) as any;
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        schoolId: true,
        organizationId: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new ApiError('User not found or inactive', 401);
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new ApiError('Invalid token', 401));
    } else {
      next(error);
    }
  }
};

export const requireRole = (roles: string | string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new ApiError('Authentication required', 401);
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      throw new ApiError('Insufficient permissions', 403);
    }

    next();
  };
};

export const requireSchoolAccess = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user?.schoolId) {
    throw new ApiError('School access required', 403);
  }
  next();
};