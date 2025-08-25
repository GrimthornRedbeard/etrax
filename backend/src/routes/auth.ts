import { Router } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { authMiddleware } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { authLimiter, passwordResetLimiter, registrationLimiter } from '@/middleware/rateLimiter';
import { prisma } from '@/index';
import {
  loginUser,
  registerUser,
  refreshTokens,
  logoutUser,
  requestPasswordReset,
  changePasswordWithToken,
  verifyEmail,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '@/services/auth';

const router = Router();

// POST /api/auth/login
router.post('/login', authLimiter, validateRequest(loginSchema), asyncHandler(async (req, res) => {
  const result = await loginUser(req.body);
  
  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: result,
  });
}));

// POST /api/auth/register
router.post('/register', registrationLimiter, validateRequest(registerSchema), asyncHandler(async (req, res) => {
  const result = await registerUser(req.body);
  
  res.status(201).json({
    success: true,
    message: 'Registration successful',
    data: result,
  });
}));

// POST /api/auth/refresh
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      message: 'Refresh token is required',
    });
  }

  const result = await refreshTokens(refreshToken);
  
  res.status(200).json({
    success: true,
    message: 'Tokens refreshed successfully',
    data: result,
  });
}));

// POST /api/auth/logout
router.post('/logout', authMiddleware, asyncHandler(async (req, res) => {
  const result = await logoutUser(req.user!.id);
  
  res.status(200).json({
    success: true,
    data: result,
  });
}));

// GET /api/auth/verify
router.get('/verify', authMiddleware, asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Token is valid',
    data: {
      user: req.user,
    },
  });
}));

// POST /api/auth/forgot-password
router.post('/forgot-password', passwordResetLimiter, validateRequest(resetPasswordSchema), asyncHandler(async (req, res) => {
  const { email } = resetPasswordSchema.parse(req.body);
  
  const result = await requestPasswordReset(email);
  
  res.status(200).json({
    success: true,
    data: result,
  });
}));

// POST /api/auth/reset-password
router.post('/reset-password', validateRequest(changePasswordSchema), asyncHandler(async (req, res) => {
  const { token, newPassword } = changePasswordSchema.parse(req.body);
  
  const result = await changePasswordWithToken(token, newPassword);
  
  res.status(200).json({
    success: true,
    data: result,
  });
}));

// GET /api/auth/verify-email/:token
router.get('/verify-email/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;
  
  const result = await verifyEmail(token);
  
  res.status(200).json({
    success: true,
    data: result,
  });
}));

// GET /api/auth/me - Get current user profile
router.get('/me', authMiddleware, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      schoolId: true,
      organizationId: true,
      isActive: true,
      emailVerified: true,
      createdAt: true,
      lastLoginAt: true,
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      organization: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
  });

  res.status(200).json({
    success: true,
    data: { user },
  });
}));

// PUT /api/auth/profile - Update user profile
router.put('/profile', authMiddleware, asyncHandler(async (req, res) => {
  const { firstName, lastName, phone } = req.body;

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      ...(phone && { phone }),
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      schoolId: true,
      organizationId: true,
      isActive: true,
      emailVerified: true,
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  });

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: { user },
  });
}));

export default router;