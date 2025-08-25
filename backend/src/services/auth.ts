import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '@/config/environment';
import { prisma } from '@/index';
import { ApiError } from '@/middleware/errorHandler';
import { sendEmailVerification, sendPasswordResetEmail, sendWelcomeEmail } from '@/services/email';
import { z } from 'zod';

// Validation schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
           'Password must contain uppercase, lowercase, number, and special character'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  schoolCode: z.string().optional(),
  phone: z.string().optional(),
});

export const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export const changePasswordSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
           'Password must contain uppercase, lowercase, number, and special character'),
});

// JWT payload interface
interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  schoolId?: string;
  organizationId?: string;
}

// Token generation
export const generateTokens = (user: any) => {
  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    schoolId: user.schoolId,
    organizationId: user.organizationId,
  };

  const accessToken = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
    issuer: 'etrax',
    audience: 'etrax-users',
    subject: user.id,
  });

  const refreshToken = jwt.sign(
    { userId: user.id, type: 'refresh' },
    config.jwt.secret,
    {
      expiresIn: config.jwt.refreshExpiresIn,
      issuer: 'etrax',
      audience: 'etrax-users',
      subject: user.id,
    }
  );

  return { accessToken, refreshToken };
};

// Verify tokens
export const verifyToken = (token: string): JWTPayload => {
  try {
    return jwt.verify(token, config.jwt.secret, {
      issuer: 'etrax',
      audience: 'etrax-users',
    }) as JWTPayload;
  } catch (error) {
    throw new ApiError('Invalid or expired token', 401);
  }
};

// Hash password
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, config.security.bcryptRounds);
};

// Compare password
export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

// Login service
export const loginUser = async (credentials: z.infer<typeof loginSchema>) => {
  const { email, password } = loginSchema.parse(credentials);

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      school: true,
      organization: true,
    },
  });

  if (!user) {
    throw new ApiError('Invalid email or password', 401);
  }

  if (!user.isActive) {
    throw new ApiError('Account is deactivated', 401);
  }

  // Check password
  const isValidPassword = await comparePassword(password, user.password);
  if (!isValidPassword) {
    throw new ApiError('Invalid email or password', 401);
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Generate tokens
  const tokens = generateTokens(user);

  // Store refresh token in database (for rotation)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      // Store refresh token hash for security
      // refreshTokenHash: await hashPassword(tokens.refreshToken),
    },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      schoolId: user.schoolId,
      organizationId: user.organizationId,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      school: user.school ? {
        id: user.school.id,
        name: user.school.name,
        code: user.school.code,
      } : null,
    },
    tokens,
  };
};

// Register service
export const registerUser = async (userData: z.infer<typeof registerSchema>) => {
  const validatedData = registerSchema.parse(userData);

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: validatedData.email.toLowerCase() },
  });

  if (existingUser) {
    throw new ApiError('User with this email already exists', 409);
  }

  // Find school by code if provided
  let school = null;
  if (validatedData.schoolCode) {
    school = await prisma.school.findUnique({
      where: { code: validatedData.schoolCode },
      include: { organization: true },
    });

    if (!school) {
      throw new ApiError('Invalid school code', 400);
    }
  }

  // Hash password
  const hashedPassword = await hashPassword(validatedData.password);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: validatedData.email.toLowerCase(),
      password: hashedPassword,
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
      phone: validatedData.phone,
      schoolId: school?.id,
      organizationId: school?.organizationId,
      role: school ? 'USER' : 'USER', // Default role
      isActive: true,
      emailVerified: false,
    },
    include: {
      school: true,
      organization: true,
    },
  });

  // Generate tokens
  const tokens = generateTokens(user);

  // Generate email verification token
  const emailVerificationToken = jwt.sign(
    { userId: user.id, type: 'email-verification' },
    config.jwt.secret,
    { expiresIn: '24h' }
  );

  // Send email verification (async, don't wait)
  sendEmailVerification(user.email, user.firstName, emailVerificationToken).catch(
    error => console.error('Failed to send verification email:', error)
  );

  // Send welcome email if user has a school
  if (user.school) {
    sendWelcomeEmail(user.email, user.firstName, user.school.name).catch(
      error => console.error('Failed to send welcome email:', error)
    );
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      schoolId: user.schoolId,
      organizationId: user.organizationId,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      school: user.school ? {
        id: user.school.id,
        name: user.school.name,
        code: user.school.code,
      } : null,
    },
    tokens,
  };
};

// Refresh token service
export const refreshTokens = async (refreshToken: string) => {
  try {
    const decoded = jwt.verify(refreshToken, config.jwt.secret) as any;
    
    if (decoded.type !== 'refresh') {
      throw new ApiError('Invalid refresh token', 401);
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        school: true,
        organization: true,
      },
    });

    if (!user || !user.isActive) {
      throw new ApiError('User not found or inactive', 401);
    }

    // Generate new tokens
    const tokens = generateTokens(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        schoolId: user.schoolId,
        organizationId: user.organizationId,
        isActive: user.isActive,
        emailVerified: user.emailVerified,
      },
      tokens,
    };
  } catch (error) {
    throw new ApiError('Invalid or expired refresh token', 401);
  }
};

// Logout service
export const logoutUser = async (userId: string) => {
  // Update user to clear refresh token
  await prisma.user.update({
    where: { id: userId },
    data: {
      // Clear refresh token hash
      // refreshTokenHash: null,
    },
  });

  return { message: 'Logged out successfully' };
};

// Password reset request
export const requestPasswordReset = async (email: string) => {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user) {
    // Don't reveal if email exists or not
    return { message: 'If the email exists, a reset link has been sent' };
  }

  // Generate reset token
  const resetToken = jwt.sign(
    { userId: user.id, type: 'password-reset' },
    config.jwt.secret,
    { expiresIn: '1h' }
  );

  // Send password reset email (async, don't wait)
  sendPasswordResetEmail(user.email, user.firstName, resetToken).catch(
    error => console.error('Failed to send password reset email:', error)
  );

  return { message: 'Password reset email sent' };
};

// Change password with reset token
export const changePasswordWithToken = async (token: string, newPassword: string) => {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    
    if (decoded.type !== 'password-reset') {
      throw new ApiError('Invalid reset token', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      throw new ApiError('User not found', 404);
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    return { message: 'Password updated successfully' };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Invalid or expired reset token', 401);
  }
};

// Verify email
export const verifyEmail = async (token: string) => {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    
    if (decoded.type !== 'email-verification') {
      throw new ApiError('Invalid verification token', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      throw new ApiError('User not found', 404);
    }

    // Update email verification status
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    return { message: 'Email verified successfully' };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Invalid or expired verification token', 401);
  }
};