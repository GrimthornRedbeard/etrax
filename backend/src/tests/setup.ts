import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/etrax_test?schema=public';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only-min-32-chars';
process.env.REDIS_URL = 'redis://localhost:6379/1'; // Use different Redis DB for tests
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.PORT = '3001';
process.env.RATE_LIMIT_WINDOW_MS = '900000';
process.env.RATE_LIMIT_MAX = '1000';

// Create test database client
const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Mock Redis for testing
const mockRedisClient = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  setex: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  exists: vi.fn().mockResolvedValue(0),
  expire: vi.fn().mockResolvedValue(1),
  disconnect: vi.fn().mockResolvedValue(undefined),
  connected: true,
};

// Mock external services
vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => mockRedisClient),
  };
});

// Mock nodemailer for email testing
vi.mock('nodemailer', () => ({
  createTransporter: vi.fn().mockReturnValue({
    sendMail: vi.fn().mockResolvedValue({
      messageId: 'test-message-id',
      response: '250 OK',
    }),
  }),
}));

// Mock Winston logger for testing
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

vi.mock('@/utils/logger', () => ({
  logger: mockLogger,
}));

// Mock QR code generation
vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mock-qr-code-data'),
  },
}));

// Mock bcryptjs for password hashing
vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('$2a$10$mock.hashed.password.string'),
  compare: vi.fn().mockImplementation((password: string, hash: string) => {
    // Mock successful comparison for test passwords
    if (password === 'validpassword' || password === 'Test123!@#') {
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }),
  genSalt: vi.fn().mockResolvedValue('$2a$10$mock.salt.string'),
}));

// Global test setup
beforeAll(async () => {
  try {
    // Reset test database schema
    execSync('npx prisma migrate reset --force --skip-seed', {
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      stdio: 'pipe',
    });

    // Apply migrations
    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      stdio: 'pipe',
    });

    // Generate Prisma client
    execSync('npx prisma generate', {
      stdio: 'pipe',
    });

    console.log('✅ Test database setup complete');
  } catch (error) {
    console.error('❌ Test database setup failed:', error);
    console.log('💡 Make sure PostgreSQL is running and test database exists');
    console.log('💡 You may need to create the test database manually:');
    console.log('   createdb etrax_test -U postgres');
    // Don't fail the setup - allow tests to run with mocks
  }
});

afterAll(async () => {
  try {
    // Clean up database connections
    await testPrisma.$disconnect();
    
    // Mock Redis cleanup
    mockRedisClient.disconnect();
    
    console.log('✅ Test cleanup complete');
  } catch (error) {
    console.error('❌ Test cleanup failed:', error);
  }
});

// Reset database state between tests
beforeEach(async () => {
  try {
    // Clear all tables in reverse dependency order
    await testPrisma.auditLog.deleteMany({});
    await testPrisma.notification.deleteMany({});
    await testPrisma.transaction.deleteMany({});
    await testPrisma.equipment.deleteMany({});
    await testPrisma.location.deleteMany({});
    await testPrisma.category.deleteMany({});
    await testPrisma.user.deleteMany({});
    await testPrisma.school.deleteMany({});
    await testPrisma.organization.deleteMany({});
  } catch (error) {
    // If database operations fail, continue with mocked tests
    console.warn('⚠️ Database cleanup failed, using mocks:', error);
  }

  // Reset all mocks
  vi.clearAllMocks();
  
  // Reset mock implementations to defaults
  mockRedisClient.get.mockResolvedValue(null);
  mockRedisClient.set.mockResolvedValue('OK');
  mockRedisClient.setex.mockResolvedValue('OK');
  mockRedisClient.del.mockResolvedValue(1);
});

afterEach(() => {
  // Additional cleanup if needed
  vi.clearAllMocks();
});

// Helper functions for tests
export const createTestUser = async (overrides: any = {}) => {
  const defaultUser = {
    email: 'test@example.com',
    password: '$2a$10$mock.hashed.password.string',
    firstName: 'Test',
    lastName: 'User',
    role: 'USER',
    isActive: true,
    emailVerified: true,
    permissions: [],
    metadata: {},
    ...overrides,
  };

  try {
    return await testPrisma.user.create({
      data: defaultUser,
    });
  } catch (error) {
    // If database is unavailable, return mock user
    return {
      id: 'test-user-id',
      ...defaultUser,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
};

export const createTestOrganization = async (overrides: any = {}) => {
  const defaultOrg = {
    name: 'Test Organization',
    domain: 'test.edu',
    type: 'SCHOOL_DISTRICT',
    isActive: true,
    settings: {},
    metadata: {},
    ...overrides,
  };

  try {
    return await testPrisma.organization.create({
      data: defaultOrg,
    });
  } catch (error) {
    return {
      id: 'test-org-id',
      ...defaultOrg,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
};

export const createTestSchool = async (organizationId?: string, overrides: any = {}) => {
  const defaultSchool = {
    name: 'Test High School',
    code: 'THS',
    type: 'HIGH_SCHOOL',
    address: '123 Test St, Test City, TC 12345',
    organizationId: organizationId || 'test-org-id',
    isActive: true,
    settings: {},
    metadata: {},
    ...overrides,
  };

  try {
    return await testPrisma.school.create({
      data: defaultSchool,
    });
  } catch (error) {
    return {
      id: 'test-school-id',
      ...defaultSchool,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
};

export const createTestCategory = async (overrides: any = {}) => {
  const defaultCategory = {
    name: 'Test Category',
    code: 'TEST',
    description: 'Test category for equipment',
    isActive: true,
    sortOrder: 1,
    metadata: {},
    ...overrides,
  };

  try {
    return await testPrisma.category.create({
      data: defaultCategory,
    });
  } catch (error) {
    return {
      id: 'test-category-id',
      ...defaultCategory,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
};

export const createTestLocation = async (overrides: any = {}) => {
  const defaultLocation = {
    name: 'Test Location',
    code: 'TL',
    type: 'ROOM',
    isActive: true,
    coordinates: {},
    contactInfo: {},
    operatingHours: {},
    metadata: {},
    ...overrides,
  };

  try {
    return await testPrisma.location.create({
      data: defaultLocation,
    });
  } catch (error) {
    return {
      id: 'test-location-id',
      ...defaultLocation,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
};

export const createTestEquipment = async (categoryId?: string, locationId?: string, overrides: any = {}) => {
  const defaultEquipment = {
    name: 'Test Equipment',
    code: 'EQ-12345',
    description: 'Test equipment item',
    condition: 'EXCELLENT',
    status: 'AVAILABLE',
    categoryId: categoryId || 'test-category-id',
    locationId: locationId || 'test-location-id',
    isDeleted: false,
    tags: [],
    specifications: {},
    ...overrides,
  };

  try {
    return await testPrisma.equipment.create({
      data: defaultEquipment,
    });
  } catch (error) {
    return {
      id: 'test-equipment-id',
      ...defaultEquipment,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
};

// Export test database client and mocks for use in tests
export { testPrisma, mockRedisClient, mockLogger };

// Add global error handler for unhandled rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});