import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { testPrisma, createTestUser, createTestOrganization, createTestSchool } from '../setup';

// Mock the main app setup
const createTestApp = () => {
  const app = express();
  
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Import routes
  const authRoutes = require('../../routes/auth').default;
  const userRoutes = require('../../routes/user').default;
  const equipmentRoutes = require('../../routes/equipment').default;
  const categoryRoutes = require('../../routes/category').default;
  const locationRoutes = require('../../routes/location').default;
  
  // Mount routes
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/equipment', equipmentRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/locations', locationRoutes);
  
  return app;
};

describe('API Integration Tests', () => {
  let app: express.Application;
  let testOrg: any;
  let testSchool: any;
  let adminUser: any;
  let regularUser: any;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    app = createTestApp();
    
    // Create test data
    testOrg = await createTestOrganization();
    testSchool = await createTestSchool(testOrg.id);
    
    adminUser = await createTestUser({
      email: 'admin@test.com',
      role: 'ADMIN',
      schoolId: testSchool.id,
      organizationId: testOrg.id,
    });
    
    regularUser = await createTestUser({
      email: 'user@test.com',
      role: 'USER',
      schoolId: testSchool.id,
      organizationId: testOrg.id,
    });
    
    // Generate JWT tokens
    adminToken = jwt.sign(
      {
        userId: adminUser.id,
        email: adminUser.email,
        role: adminUser.role,
        schoolId: adminUser.schoolId,
        organizationId: adminUser.organizationId,
      },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
    
    userToken = jwt.sign(
      {
        userId: regularUser.id,
        email: regularUser.email,
        role: regularUser.role,
        schoolId: regularUser.schoolId,
        organizationId: regularUser.organizationId,
      },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
  });

  describe('Authentication Endpoints', () => {
    describe('POST /api/auth/login', () => {
      it('should login successfully with valid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'admin@test.com',
            password: 'Test123!@#', // Mock bcrypt will accept this
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('accessToken');
        expect(response.body).toHaveProperty('refreshToken');
        expect(response.body.user).toHaveProperty('email', 'admin@test.com');
        expect(response.body.user).not.toHaveProperty('password');
      });

      it('should reject invalid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'admin@test.com',
            password: 'wrongpassword',
          });

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('message');
      });

      it('should validate required fields', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'admin@test.com',
            // Missing password
          });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('message');
      });
    });

    describe('POST /api/auth/register', () => {
      it('should register new user successfully', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: 'newuser@test.com',
            password: 'NewPassword123!@#',
            firstName: 'New',
            lastName: 'User',
            schoolCode: 'THS',
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('message', 'Registration successful');
        expect(response.body.user).toHaveProperty('email', 'newuser@test.com');
      });

      it('should reject duplicate email', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: 'admin@test.com', // Already exists
            password: 'Password123!@#',
            firstName: 'Duplicate',
            lastName: 'User',
            schoolCode: 'THS',
          });

        expect(response.status).toBe(409);
        expect(response.body).toHaveProperty('message');
      });
    });

    describe('GET /api/auth/me', () => {
      it('should return current user profile', async () => {
        const response = await request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('id', adminUser.id);
        expect(response.body).toHaveProperty('email', adminUser.email);
        expect(response.body).not.toHaveProperty('password');
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .get('/api/auth/me');

        expect(response.status).toBe(401);
      });
    });
  });

  describe('User Management Endpoints', () => {
    describe('GET /api/users', () => {
      it('should return users list for admin', async () => {
        const response = await request(app)
          .get('/api/users')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('users');
        expect(response.body).toHaveProperty('pagination');
        expect(Array.isArray(response.body.users)).toBe(true);
      });

      it('should restrict access for regular users', async () => {
        const response = await request(app)
          .get('/api/users')
          .set('Authorization', `Bearer ${userToken}`);

        expect(response.status).toBe(200);
        expect(response.body.users).toHaveLength(1); // Only self
        expect(response.body.users[0].id).toBe(regularUser.id);
      });

      it('should support search filtering', async () => {
        const response = await request(app)
          .get('/api/users?search=admin')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.users.length).toBeGreaterThanOrEqual(1);
      });

      it('should support role filtering', async () => {
        const response = await request(app)
          .get('/api/users?role=ADMIN')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.users.every((user: any) => user.role === 'ADMIN')).toBe(true);
      });
    });

    describe('POST /api/users', () => {
      it('should create new user as admin', async () => {
        const userData = {
          email: 'created@test.com',
          firstName: 'Created',
          lastName: 'User',
          role: 'STAFF',
          schoolId: testSchool.id,
          sendInvite: false,
        };

        const response = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(userData);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('message', 'User created successfully');
        expect(response.body.user).toHaveProperty('email', userData.email);
        expect(response.body).toHaveProperty('tempPassword'); // Since sendInvite is false
      });

      it('should reject user creation by regular user', async () => {
        const userData = {
          email: 'rejected@test.com',
          firstName: 'Rejected',
          lastName: 'User',
          role: 'USER',
        };

        const response = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${userToken}`)
          .send(userData);

        expect(response.status).toBe(403);
      });
    });

    describe('GET /api/users/me', () => {
      it('should return current user profile', async () => {
        const response = await request(app)
          .get('/api/users/me')
          .set('Authorization', `Bearer ${userToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('id', regularUser.id);
        expect(response.body).toHaveProperty('email', regularUser.email);
      });
    });

    describe('PUT /api/users/:id', () => {
      it('should allow user to update own profile', async () => {
        const updateData = {
          firstName: 'Updated',
          phone: '555-999-8888',
        };

        const response = await request(app)
          .put(`/api/users/${regularUser.id}`)
          .set('Authorization', `Bearer ${userToken}`)
          .send(updateData);

        expect(response.status).toBe(200);
        expect(response.body.user).toHaveProperty('firstName', 'Updated');
        expect(response.body.user).toHaveProperty('phone', '555-999-8888');
      });

      it('should allow admin to update other users', async () => {
        const updateData = {
          role: 'STAFF',
          isActive: false,
        };

        const response = await request(app)
          .put(`/api/users/${regularUser.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send(updateData);

        expect(response.status).toBe(200);
        expect(response.body.user).toHaveProperty('role', 'STAFF');
        expect(response.body.user).toHaveProperty('isActive', false);
      });
    });

    describe('POST /api/users/change-password', () => {
      it('should allow password change with valid current password', async () => {
        const passwordData = {
          currentPassword: 'Test123!@#',
          newPassword: 'NewPassword123!@#',
        };

        const response = await request(app)
          .post('/api/users/change-password')
          .set('Authorization', `Bearer ${userToken}`)
          .send(passwordData);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('message', 'Password changed successfully');
      });

      it('should reject password change with invalid current password', async () => {
        const passwordData = {
          currentPassword: 'WrongPassword',
          newPassword: 'NewPassword123!@#',
        };

        const response = await request(app)
          .post('/api/users/change-password')
          .set('Authorization', `Bearer ${userToken}`)
          .send(passwordData);

        expect(response.status).toBe(400);
      });
    });
  });

  describe('Category Management Endpoints', () => {
    describe('GET /api/categories', () => {
      it('should return categories list', async () => {
        const response = await request(app)
          .get('/api/categories')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('categories');
        expect(response.body).toHaveProperty('pagination');
      });

      it('should support search filtering', async () => {
        const response = await request(app)
          .get('/api/categories?search=basketball')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
      });
    });

    describe('POST /api/categories', () => {
      it('should create category as admin', async () => {
        const categoryData = {
          name: 'Basketball Equipment',
          code: 'BB',
          description: 'Equipment for basketball activities',
          color: '#ff5722',
        };

        const response = await request(app)
          .post('/api/categories')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(categoryData);

        expect(response.status).toBe(201);
        expect(response.body.category).toHaveProperty('name', categoryData.name);
        expect(response.body.category).toHaveProperty('code', categoryData.code);
      });

      it('should reject category creation by regular user', async () => {
        const categoryData = {
          name: 'Rejected Category',
          code: 'REJ',
        };

        const response = await request(app)
          .post('/api/categories')
          .set('Authorization', `Bearer ${userToken}`)
          .send(categoryData);

        expect(response.status).toBe(403);
      });
    });

    describe('GET /api/categories/tree', () => {
      it('should return category tree structure', async () => {
        const response = await request(app)
          .get('/api/categories/tree')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('tree');
        expect(Array.isArray(response.body.tree)).toBe(true);
      });
    });
  });

  describe('Location Management Endpoints', () => {
    describe('GET /api/locations', () => {
      it('should return locations list', async () => {
        const response = await request(app)
          .get('/api/locations')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('locations');
        expect(response.body).toHaveProperty('pagination');
      });

      it('should filter by location type', async () => {
        const response = await request(app)
          .get('/api/locations?type=BUILDING')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
      });
    });

    describe('POST /api/locations', () => {
      it('should create location as admin', async () => {
        const locationData = {
          name: 'Main Gymnasium',
          code: 'GYM1',
          type: 'BUILDING',
          address: '123 School St',
          capacity: 500,
        };

        const response = await request(app)
          .post('/api/locations')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(locationData);

        expect(response.status).toBe(201);
        expect(response.body.location).toHaveProperty('name', locationData.name);
        expect(response.body.location).toHaveProperty('code', locationData.code);
      });
    });

    describe('GET /api/locations/available', () => {
      it('should return available locations for equipment placement', async () => {
        const response = await request(app)
          .get('/api/locations/available')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('locations');
        expect(Array.isArray(response.body.locations)).toBe(true);
      });
    });
  });

  describe('Equipment Management Endpoints', () => {
    let testCategory: any;
    let testLocation: any;

    beforeEach(async () => {
      // Create test category and location for equipment tests
      testCategory = await testPrisma.category.create({
        data: {
          name: 'Test Equipment Category',
          code: 'TEC',
          isActive: true,
          sortOrder: 1,
          metadata: {},
          schoolId: testSchool.id,
          organizationId: testOrg.id,
          createdById: adminUser.id,
          updatedById: adminUser.id,
        },
      });

      testLocation = await testPrisma.location.create({
        data: {
          name: 'Test Storage Room',
          code: 'TSR',
          type: 'STORAGE',
          isActive: true,
          coordinates: {},
          contactInfo: {},
          operatingHours: {},
          metadata: {},
          schoolId: testSchool.id,
          organizationId: testOrg.id,
          createdById: adminUser.id,
          updatedById: adminUser.id,
        },
      });
    });

    describe('GET /api/equipment', () => {
      it('should return equipment list', async () => {
        const response = await request(app)
          .get('/api/equipment')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('equipment');
        expect(response.body).toHaveProperty('pagination');
      });

      it('should support filtering by status', async () => {
        const response = await request(app)
          .get('/api/equipment?status=AVAILABLE')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
      });
    });

    describe('POST /api/equipment', () => {
      it('should create equipment as admin', async () => {
        const equipmentData = {
          name: 'Test Basketball',
          description: 'Official size basketball',
          condition: 'EXCELLENT',
          status: 'AVAILABLE',
          categoryId: testCategory.id,
          locationId: testLocation.id,
          serialNumber: 'BB001',
          manufacturer: 'Spalding',
          purchasePrice: 29.99,
          currentValue: 25.00,
        };

        const response = await request(app)
          .post('/api/equipment')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(equipmentData);

        expect(response.status).toBe(201);
        expect(response.body.equipment).toHaveProperty('name', equipmentData.name);
        expect(response.body.equipment).toHaveProperty('code'); // Auto-generated
      });

      it('should reject equipment creation by regular user', async () => {
        const equipmentData = {
          name: 'Rejected Equipment',
          categoryId: testCategory.id,
          locationId: testLocation.id,
        };

        const response = await request(app)
          .post('/api/equipment')
          .set('Authorization', `Bearer ${userToken}`)
          .send(equipmentData);

        expect(response.status).toBe(403);
      });
    });

    describe('GET /api/equipment/stats', () => {
      it('should return equipment statistics', async () => {
        const response = await request(app)
          .get('/api/equipment/stats')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('overview');
        expect(response.body.overview).toHaveProperty('totalEquipment');
        expect(response.body.overview).toHaveProperty('availableEquipment');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });

    it('should handle invalid JSON payloads', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect(response.status).toBe(400);
    });

    it('should handle rate limiting', async () => {
      // This would need to be tested with actual rate limiting configured
      // For now, just ensure the endpoint works normally
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('Authentication & Authorization', () => {
    it('should reject requests without authorization header', async () => {
      const response = await request(app)
        .get('/api/users');

      expect(response.status).toBe(401);
    });

    it('should reject requests with invalid token', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', 'Bearer invalid.token.here');

      expect(response.status).toBe(401);
    });

    it('should reject requests with expired token', async () => {
      const expiredToken = jwt.sign(
        { userId: adminUser.id },
        process.env.JWT_SECRET!,
        { expiresIn: '-1h' } // Already expired
      );

      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
    });
  });
});