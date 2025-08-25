import jwt from 'jsonwebtoken';
import { testPrisma } from './setup';

// JWT Token utilities
export const generateTestToken = (payload: any) => {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '1h' });
};

export const generateExpiredToken = (payload: any) => {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '-1h' });
};

export const generateInvalidToken = () => {
  return 'invalid.token.string';
};

// Database utilities
export const cleanDatabase = async () => {
  // Clean all tables in reverse dependency order
  await testPrisma.auditLog.deleteMany({});
  await testPrisma.notification.deleteMany({});
  await testPrisma.transaction.deleteMany({});
  await testPrisma.equipment.deleteMany({});
  await testPrisma.location.deleteMany({});
  await testPrisma.category.deleteMany({});
  await testPrisma.user.deleteMany({});
  await testPrisma.school.deleteMany({});
  await testPrisma.organization.deleteMany({});
};

// Test data generators
export const generateTestEmail = (prefix: string = 'test') => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@test.com`;
};

export const generateTestCode = (prefix: string = 'TEST') => {
  return `${prefix}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
};

export const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Validation helpers
export const expectValidationError = (error: any, field: string) => {
  expect(error.message).toContain(field);
  expect(error.issues).toBeDefined();
  expect(error.issues.some((issue: any) => issue.path.includes(field))).toBe(true);
};

export const expectApiError = (error: any, statusCode: number, message?: string) => {
  expect(error.statusCode || error.status).toBe(statusCode);
  if (message) {
    expect(error.message).toContain(message);
  }
};

// Mock data factories
export const createMockUser = (overrides: any = {}) => ({
  id: generateUUID(),
  email: generateTestEmail(),
  firstName: 'Test',
  lastName: 'User',
  role: 'USER',
  isActive: true,
  emailVerified: true,
  password: '$2a$10$mock.hashed.password',
  permissions: [],
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  lastLoginAt: null,
  ...overrides,
});

export const createMockCategory = (overrides: any = {}) => ({
  id: generateUUID(),
  name: 'Test Category',
  code: generateTestCode('CAT'),
  description: 'Test category description',
  color: '#ff5722',
  isActive: true,
  sortOrder: 1,
  parentId: null,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createMockLocation = (overrides: any = {}) => ({
  id: generateUUID(),
  name: 'Test Location',
  code: generateTestCode('LOC'),
  description: 'Test location description',
  type: 'ROOM',
  address: '123 Test Street',
  capacity: 50,
  isActive: true,
  parentId: null,
  coordinates: {},
  contactInfo: {},
  operatingHours: {},
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createMockEquipment = (overrides: any = {}) => ({
  id: generateUUID(),
  name: 'Test Equipment',
  code: generateTestCode('EQ'),
  description: 'Test equipment description',
  condition: 'EXCELLENT',
  status: 'AVAILABLE',
  categoryId: generateUUID(),
  locationId: generateUUID(),
  serialNumber: `SN${Date.now()}`,
  manufacturer: 'Test Manufacturer',
  modelNumber: 'TM-001',
  purchaseDate: new Date(),
  purchasePrice: 100.00,
  currentValue: 80.00,
  isDeleted: false,
  tags: [],
  specifications: {},
  imageUrls: [],
  qrCodeUrl: null,
  warrantyCoverage: null,
  warrantyExpiry: null,
  maintenanceSchedule: null,
  notes: null,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createMockOrganization = (overrides: any = {}) => ({
  id: generateUUID(),
  name: 'Test Organization',
  domain: 'test.edu',
  type: 'SCHOOL_DISTRICT',
  address: '123 Admin Street',
  phone: '555-123-4567',
  email: 'admin@test.edu',
  website: 'https://test.edu',
  isActive: true,
  settings: {},
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createMockSchool = (organizationId?: string, overrides: any = {}) => ({
  id: generateUUID(),
  name: 'Test High School',
  code: generateTestCode('HS'),
  type: 'HIGH_SCHOOL',
  address: '456 School Street',
  phone: '555-234-5678',
  email: 'info@testschool.edu',
  website: 'https://testschool.edu',
  organizationId: organizationId || generateUUID(),
  isActive: true,
  settings: {},
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// Assertion helpers
export const assertUserResponse = (user: any) => {
  expect(user).toHaveProperty('id');
  expect(user).toHaveProperty('email');
  expect(user).toHaveProperty('firstName');
  expect(user).toHaveProperty('lastName');
  expect(user).toHaveProperty('role');
  expect(user).toHaveProperty('isActive');
  expect(user).not.toHaveProperty('password'); // Should never be returned
};

export const assertEquipmentResponse = (equipment: any) => {
  expect(equipment).toHaveProperty('id');
  expect(equipment).toHaveProperty('name');
  expect(equipment).toHaveProperty('code');
  expect(equipment).toHaveProperty('condition');
  expect(equipment).toHaveProperty('status');
  expect(equipment).toHaveProperty('categoryId');
  expect(equipment).toHaveProperty('locationId');
};

export const assertCategoryResponse = (category: any) => {
  expect(category).toHaveProperty('id');
  expect(category).toHaveProperty('name');
  expect(category).toHaveProperty('code');
  expect(category).toHaveProperty('isActive');
  expect(category).toHaveProperty('sortOrder');
};

export const assertLocationResponse = (location: any) => {
  expect(location).toHaveProperty('id');
  expect(location).toHaveProperty('name');
  expect(location).toHaveProperty('code');
  expect(location).toHaveProperty('type');
  expect(location).toHaveProperty('isActive');
};

export const assertPaginationResponse = (pagination: any) => {
  expect(pagination).toHaveProperty('page');
  expect(pagination).toHaveProperty('limit');
  expect(pagination).toHaveProperty('total');
  expect(pagination).toHaveProperty('totalPages');
  expect(pagination).toHaveProperty('hasNext');
  expect(pagination).toHaveProperty('hasPrev');
  expect(typeof pagination.page).toBe('number');
  expect(typeof pagination.limit).toBe('number');
  expect(typeof pagination.total).toBe('number');
  expect(typeof pagination.totalPages).toBe('number');
  expect(typeof pagination.hasNext).toBe('boolean');
  expect(typeof pagination.hasPrev).toBe('boolean');
};

// Performance testing helpers
export const measureExecutionTime = async (fn: () => Promise<any>) => {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;
  return { result, duration };
};

export const expectExecutionTime = async (fn: () => Promise<any>, maxDurationMs: number) => {
  const { duration } = await measureExecutionTime(fn);
  expect(duration).toBeLessThan(maxDurationMs);
};

// Error simulation helpers
export const simulateDatabaseError = (mockPrisma: any, method: string) => {
  mockPrisma[method].mockRejectedValue(new Error('Database connection failed'));
};

export const simulateValidationError = (field: string, message: string) => {
  const error = new Error(message);
  (error as any).issues = [{ path: [field], message }];
  return error;
};

// File system helpers for testing file uploads
export const createTestFile = (filename: string, content: string = 'test content') => {
  return {
    fieldname: 'file',
    originalname: filename,
    encoding: '7bit',
    mimetype: 'text/plain',
    size: Buffer.byteLength(content),
    buffer: Buffer.from(content),
    path: `/tmp/${filename}`,
  };
};

export const createTestImage = (filename: string = 'test.jpg') => {
  // Create a minimal JPEG-like buffer (just for testing)
  const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
  const jpegEnd = Buffer.from([0xFF, 0xD9]);
  const content = Buffer.concat([jpegHeader, Buffer.alloc(100), jpegEnd]);
  
  return {
    fieldname: 'image',
    originalname: filename,
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: content.length,
    buffer: content,
    path: `/tmp/${filename}`,
  };
};

// Rate limiting test helpers
export const simulateRateLimitExceeded = () => {
  const error = new Error('Too Many Requests');
  (error as any).statusCode = 429;
  return error;
};

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));