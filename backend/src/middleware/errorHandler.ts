import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { logger } from '@/utils/logger';
import { config } from '@/config/environment';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class ApiError extends Error implements AppError {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

const handlePrismaError = (error: Prisma.PrismaClientKnownRequestError): ApiError => {
  switch (error.code) {
    case 'P2002':
      return new ApiError('Resource already exists', 409);
    case 'P2025':
      return new ApiError('Resource not found', 404);
    case 'P2003':
      return new ApiError('Foreign key constraint failed', 400);
    case 'P2014':
      return new ApiError('Required relation is missing', 400);
    default:
      return new ApiError('Database error occurred', 500);
  }
};

const handleZodError = (error: ZodError): ApiError => {
  const message = error.errors
    .map(err => `${err.path.join('.')}: ${err.message}`)
    .join(', ');
  
  return new ApiError(`Validation error: ${message}`, 400);
};

export const errorHandler = (
  err: Error | ApiError | Prisma.PrismaClientKnownRequestError | ZodError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let error: ApiError;

  // Handle different error types
  if (err instanceof ApiError) {
    error = err;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    error = handlePrismaError(err);
  } else if (err instanceof ZodError) {
    error = handleZodError(err);
  } else if (err.name === 'ValidationError') {
    error = new ApiError('Validation error', 400);
  } else if (err.name === 'CastError') {
    error = new ApiError('Invalid data format', 400);
  } else if (err.name === 'JsonWebTokenError') {
    error = new ApiError('Invalid token', 401);
  } else if (err.name === 'TokenExpiredError') {
    error = new ApiError('Token expired', 401);
  } else {
    error = new ApiError(
      config.node.isProduction ? 'Something went wrong' : err.message,
      500,
      false
    );
  }

  // Log error
  logger.error('Error occurred:', {
    message: error.message,
    statusCode: error.statusCode,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // Send error response
  res.status(error.statusCode).json({
    success: false,
    message: error.message,
    ...(config.node.isDevelopment && { stack: error.stack }),
  });
};

export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const notFound = (req: Request, res: Response, next: NextFunction) => {
  const error = new ApiError(`Not found - ${req.originalUrl}`, 404);
  next(error);
};