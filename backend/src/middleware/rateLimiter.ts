import rateLimit from 'express-rate-limit';
import { config } from '@/config/environment';

// Strict rate limiting for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later',
    retryAfter: 15 * 60, // 15 minutes in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// Password reset rate limiting
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 password reset attempts per hour
  message: {
    success: false,
    message: 'Too many password reset requests, please try again later',
    retryAfter: 60 * 60, // 1 hour in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Registration rate limiting
export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: config.node.isDevelopment ? 10 : 3, // 3 registrations per hour in production
  message: {
    success: false,
    message: 'Too many registration attempts, please try again later',
    retryAfter: 60 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API rate limiting
export const apiLimiter = rateLimit({
  windowMs: config.security.rateLimitWindow,
  max: config.security.rateLimitMax,
  message: {
    success: false,
    message: 'Too many requests, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Equipment operations rate limiting
export const equipmentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    success: false,
    message: 'Too many equipment operations, please try again later',
    retryAfter: 15 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Upload rate limiting (more restrictive)
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 uploads per window
  message: {
    success: false,
    message: 'Too many file uploads, please try again later',
    retryAfter: 15 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Voice command rate limiting (higher frequency allowed)
export const voiceLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 voice commands per minute
  message: {
    success: false,
    message: 'Too many voice commands, please wait a moment',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Export rate limiters object for easier access
export const rateLimiter = {
  auth: authLimiter,
  passwordReset: passwordResetLimiter,
  registration: registrationLimiter,
  api: apiLimiter,
  equipment: equipmentLimiter,
  upload: uploadLimiter,
  voice: voiceLimiter,
};