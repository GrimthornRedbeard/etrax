import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ApiError } from './errorHandler';

export const validateRequest = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.errors
          .map(err => `${err.path.join('.')}: ${err.message}`)
          .join(', ');
        next(new ApiError(`Validation error: ${message}`, 400));
      } else {
        next(error);
      }
    }
  };
};

export const validateParams = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.params);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.errors
          .map(err => `${err.path.join('.')}: ${err.message}`)
          .join(', ');
        next(new ApiError(`Parameter validation error: ${message}`, 400));
      } else {
        next(error);
      }
    }
  };
};

export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.errors
          .map(err => `${err.path.join('.')}: ${err.message}`)
          .join(', ');
        next(new ApiError(`Query validation error: ${message}`, 400));
      } else {
        next(error);
      }
    }
  };
};