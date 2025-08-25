import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import {
  generateTokens,
  verifyToken,
  hashPassword,
  comparePassword,
  loginUser,
  registerUser,
} from '../services/auth';

// Mock Prisma
const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock('../index', () => ({
  prisma: mockPrisma,
}));

// Mock config
vi.mock('../config/environment', () => ({
  config: {
    jwt: {
      secret: 'test-secret',
      expiresIn: '1h',
      refreshExpiresIn: '7d',
    },
    security: {
      bcryptRounds: 10,
    },
  },
}));

describe('Auth Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Password Hashing', () => {
    it('should hash password correctly', async () => {
      const password = 'TestPassword123!';
      const hashedPassword = await hashPassword(password);
      
      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(password);
      expect(await bcrypt.compare(password, hashedPassword)).toBe(true);
    });

    it('should compare passwords correctly', async () => {
      const password = 'TestPassword123!';
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const isMatch = await comparePassword(password, hashedPassword);
      const isNotMatch = await comparePassword('wrongpassword', hashedPassword);
      
      expect(isMatch).toBe(true);
      expect(isNotMatch).toBe(false);
    });
  });

  describe('JWT Token Management', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      role: 'USER',
      schoolId: 'school-123',
      organizationId: 'org-123',
    };

    it('should generate valid tokens', () => {
      const tokens = generateTokens(mockUser);
      
      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
    });

    it('should verify tokens correctly', () => {
      const tokens = generateTokens(mockUser);
      const decoded = verifyToken(tokens.accessToken);
      
      expect(decoded.userId).toBe(mockUser.id);
      expect(decoded.email).toBe(mockUser.email);
      expect(decoded.role).toBe(mockUser.role);
    });

    it('should throw error for invalid token', () => {
      expect(() => {
        verifyToken('invalid-token');
      }).toThrow('Invalid or expired token');
    });
  });

  describe('User Registration', () => {
    it('should register user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPassword123!',
        firstName: 'John',
        lastName: 'Doe',
      };

      const mockUser = {
        id: 'user-123',
        ...userData,
        password: 'hashedpassword',
        schoolId: null,
        organizationId: null,
        role: 'USER',
        isActive: true,
        emailVerified: false,
        school: null,
        organization: null,
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      const result = await registerUser(userData);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result.user.email).toBe(userData.email);
      expect(result.user.firstName).toBe(userData.firstName);
    });

    it('should throw error if user already exists', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'TestPassword123!',
        firstName: 'John',
        lastName: 'Doe',
      };

      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(registerUser(userData)).rejects.toThrow('User with this email already exists');
    });

    it('should validate password requirements', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'weak', // Invalid password
        firstName: 'John',
        lastName: 'Doe',
      };

      await expect(registerUser(userData)).rejects.toThrow();
    });
  });

  describe('User Login', () => {
    it('should login user successfully', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'TestPassword123!',
      };

      const mockUser = {
        id: 'user-123',
        email: credentials.email,
        password: await bcrypt.hash(credentials.password, 10),
        firstName: 'John',
        lastName: 'Doe',
        role: 'USER',
        schoolId: null,
        organizationId: null,
        isActive: true,
        emailVerified: true,
        school: null,
        organization: null,
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await loginUser(credentials);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result.user.email).toBe(credentials.email);
    });

    it('should throw error for invalid credentials', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(loginUser(credentials)).rejects.toThrow('Invalid email or password');
    });

    it('should throw error for inactive user', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'TestPassword123!',
      };

      const mockUser = {
        id: 'user-123',
        email: credentials.email,
        password: await bcrypt.hash(credentials.password, 10),
        isActive: false, // Inactive user
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(loginUser(credentials)).rejects.toThrow('Account is deactivated');
    });
  });

  describe('Input Validation', () => {
    it('should validate email format', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'TestPassword123!',
        firstName: 'John',
        lastName: 'Doe',
      };

      await expect(registerUser(userData)).rejects.toThrow();
    });

    it('should require strong password', async () => {
      const testCases = [
        'short', // Too short
        'nouppercase123!', // No uppercase
        'NOLOWERCASE123!', // No lowercase
        'NoNumbers!', // No numbers
        'NoSpecialChars123', // No special characters
      ];

      for (const password of testCases) {
        const userData = {
          email: 'test@example.com',
          password,
          firstName: 'John',
          lastName: 'Doe',
        };

        await expect(registerUser(userData)).rejects.toThrow();
      }
    });
  });
});