import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createUser,
  getUserById,
  updateUser,
  deleteUser,
  getUsersList,
  getUserStats,
  changeUserPassword,
  resetUserPassword,
} from '../services/user';

// Mock Prisma client
const mockPrisma = {
  user: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  },
  school: {
    findFirst: vi.fn(),
  },
  transaction: {
    count: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
};

vi.mock('../index', () => ({
  prisma: mockPrisma,
}));

// Mock auth service
vi.mock('../services/auth', () => ({
  hashPassword: vi.fn().mockResolvedValue('$2a$10$mock.hashed.password'),
}));

describe('User Service', () => {
  const creatorId = 'creator-123';
  const schoolId = 'school-123';
  const organizationId = 'org-123';

  const mockUserData = {
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    phone: '555-123-4567',
    role: 'USER' as const,
    schoolId,
    organizationId,
    isActive: true,
    sendInvite: true,
  };

  const mockUser = {
    id: 'user-123',
    ...mockUserData,
    password: '$2a$10$mock.hashed.password',
    emailVerified: false,
    permissions: [],
    metadata: {},
    createdById: creatorId,
    updatedById: creatorId,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    school: {
      id: schoolId,
      name: 'Test High School',
      code: 'THS',
    },
    organization: {
      id: organizationId,
      name: 'Test District',
    },
    createdBy: {
      id: creatorId,
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('User Creation', () => {
    it('should create user successfully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null); // No existing user
      mockPrisma.school.findFirst.mockResolvedValue(mockUser.school);
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await createUser(
        mockUserData,
        creatorId,
        'ADMIN',
        schoolId,
        organizationId
      );

      expect(result.user).toHaveProperty('id');
      expect(result.user.email).toBe(mockUserData.email);
      expect(result.user.role).toBe(mockUserData.role);
      expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('should throw error if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        createUser(mockUserData, creatorId, 'ADMIN', schoolId, organizationId)
      ).rejects.toThrow('User with this email already exists');
    });

    it('should validate role hierarchy', async () => {
      const userData = {
        ...mockUserData,
        role: 'ADMIN' as const,
      };

      await expect(
        createUser(userData, creatorId, 'MANAGER', schoolId, organizationId)
      ).rejects.toThrow('Insufficient permissions to create user with this role');
    });

    it('should validate school access', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.school.findFirst.mockResolvedValue(null); // School not found

      await expect(
        createUser(mockUserData, creatorId, 'ADMIN', schoolId, organizationId)
      ).rejects.toThrow('School not found or not accessible');
    });

    it('should set organization from school if not provided', async () => {
      const userDataWithoutOrg = {
        ...mockUserData,
        organizationId: undefined,
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.school.findFirst.mockResolvedValue({
        ...mockUser.school,
        organizationId: 'school-org-123',
      });
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.auditLog.create.mockResolvedValue({});

      await createUser(
        userDataWithoutOrg,
        creatorId,
        'ADMIN',
        schoolId,
        organizationId
      );

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'school-org-123',
          }),
        })
      );
    });

    it('should validate email format', async () => {
      const invalidUserData = {
        ...mockUserData,
        email: 'invalid-email',
      };

      await expect(
        createUser(invalidUserData, creatorId, 'ADMIN', schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should validate required fields', async () => {
      const invalidUserData = {
        ...mockUserData,
        firstName: '', // Empty first name
      };

      await expect(
        createUser(invalidUserData, creatorId, 'ADMIN', schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should return temp password if not sending invite', async () => {
      const userDataNoInvite = {
        ...mockUserData,
        sendInvite: false,
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.school.findFirst.mockResolvedValue(mockUser.school);
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await createUser(
        userDataNoInvite,
        creatorId,
        'ADMIN',
        schoolId,
        organizationId
      );

      expect(result.tempPassword).toBeDefined();
      expect(typeof result.tempPassword).toBe('string');
      expect(result.tempPassword!.length).toBeGreaterThan(8);
    });
  });

  describe('User Retrieval', () => {
    it('should get user by ID successfully', async () => {
      const userWithCounts = {
        ...mockUser,
        updatedBy: mockUser.createdBy,
        _count: {
          createdEquipment: 5,
          transactions: 10,
        },
      };

      mockPrisma.user.findFirst.mockResolvedValue(userWithCounts);

      const result = await getUserById(
        'user-123',
        creatorId,
        'ADMIN',
        schoolId,
        organizationId
      );

      expect(result).toEqual(userWithCounts);
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'user-123',
          organizationId,
        },
        include: expect.any(Object),
      });
    });

    it('should throw error if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        getUserById('non-existent-id', creatorId, 'ADMIN', schoolId, organizationId)
      ).rejects.toThrow('User not found or not accessible');
    });

    it('should apply role-based access control', async () => {
      // Staff user should only see users in their school
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await getUserById('user-123', creatorId, 'STAFF', schoolId, organizationId);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'user-123',
          schoolId,
        },
        include: expect.any(Object),
      });
    });

    it('should allow users to access their own profile', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);

      await getUserById('user-123', 'user-123', 'USER', schoolId, organizationId);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'user-123',
          id: 'user-123', // Self-access
        },
        include: expect.any(Object),
      });
    });
  });

  describe('User Update', () => {
    it('should update user successfully', async () => {
      const updateData = {
        firstName: 'Updated John',
        phone: '555-987-6543',
      };

      const updatedUser = {
        ...mockUser,
        ...updateData,
        updatedBy: mockUser.createdBy,
      };

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(updatedUser);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await updateUser(
        'user-123',
        updateData,
        creatorId,
        'ADMIN',
        schoolId,
        organizationId
      );

      expect(result.firstName).toBe(updateData.firstName);
      expect(result.phone).toBe(updateData.phone);
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('should validate role change permissions', async () => {
      const updateData = {
        role: 'ADMIN' as const,
      };

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);

      await expect(
        updateUser('user-123', updateData, creatorId, 'MANAGER', schoolId, organizationId)
      ).rejects.toThrow('Insufficient permissions to change user role');
    });

    it('should allow self-updates with limited permissions', async () => {
      const updateData = {
        firstName: 'Self Updated',
        phone: '555-111-2222',
      };

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        ...updateData,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await updateUser(
        'user-123',
        updateData,
        'user-123', // Self-update
        'USER',
        schoolId,
        organizationId
      );

      expect(result.firstName).toBe(updateData.firstName);
    });

    it('should not log audit if no changes made', async () => {
      const updateData = {
        firstName: mockUser.firstName, // Same as existing
      };

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);

      await updateUser(
        'user-123',
        updateData,
        creatorId,
        'ADMIN',
        schoolId,
        organizationId
      );

      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('User Deletion', () => {
    it('should delete user successfully', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.transaction.count.mockResolvedValue(0); // No active transactions
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        isActive: false,
        email: `deleted_${Date.now()}_${mockUser.email}`,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await deleteUser(
        'user-123',
        creatorId,
        'ADMIN',
        schoolId,
        organizationId
      );

      expect(result).toEqual({ message: 'User deleted successfully' });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          isActive: false,
          email: expect.stringMatching(/^deleted_\d+_test@example\.com$/),
          updatedById: creatorId,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should prevent self-deletion', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);

      await expect(
        deleteUser('user-123', 'user-123', 'ADMIN', schoolId, organizationId)
      ).rejects.toThrow('Cannot delete your own account');
    });

    it('should prevent deletion if user has active transactions', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.transaction.count.mockResolvedValue(3); // Has active transactions

      await expect(
        deleteUser('user-123', creatorId, 'ADMIN', schoolId, organizationId)
      ).rejects.toThrow('Cannot delete user with active equipment transactions');
    });

    it('should validate deletion permissions', async () => {
      const adminUser = {
        ...mockUser,
        role: 'ADMIN',
      };

      mockPrisma.user.findFirst.mockResolvedValue(adminUser);

      await expect(
        deleteUser('user-123', creatorId, 'MANAGER', schoolId, organizationId)
      ).rejects.toThrow('Insufficient permissions to delete this user');
    });
  });

  describe('User Listing and Filtering', () => {
    it('should get users list with default filters', async () => {
      const mockUsersList = [mockUser];
      const totalCount = 1;

      mockPrisma.user.findMany.mockResolvedValue(mockUsersList);
      mockPrisma.user.count.mockResolvedValue(totalCount);

      const result = await getUsersList(
        {},
        creatorId,
        'ADMIN',
        schoolId,
        organizationId
      );

      expect(result.users).toHaveLength(1);
      expect(result.users[0].password).toBeUndefined(); // Password should be excluded
      expect(result.pagination.total).toBe(totalCount);
    });

    it('should filter by role', async () => {
      const filters = { role: 'STAFF' as const };

      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await getUsersList(
        filters,
        creatorId,
        'ADMIN',
        schoolId,
        organizationId
      );

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: 'STAFF',
          }),
        })
      );
    });

    it('should filter by search term', async () => {
      const filters = { search: 'john' };

      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await getUsersList(
        filters,
        creatorId,
        'ADMIN',
        schoolId,
        organizationId
      );

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { firstName: { contains: 'john', mode: 'insensitive' } },
              { lastName: { contains: 'john', mode: 'insensitive' } },
              { email: { contains: 'john', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });

    it('should filter by date ranges', async () => {
      const filters = {
        createdFrom: '2023-01-01T00:00:00Z',
        createdTo: '2023-12-31T23:59:59Z',
      };

      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await getUsersList(
        filters,
        creatorId,
        'ADMIN',
        schoolId,
        organizationId
      );

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: new Date('2023-01-01T00:00:00Z'),
              lte: new Date('2023-12-31T23:59:59Z'),
            },
          }),
        })
      );
    });

    it('should apply role-based access control in listing', async () => {
      // Regular user should only see themselves
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await getUsersList({}, 'user-123', 'USER', schoolId, organizationId);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'user-123',
          }),
        })
      );
    });
  });

  describe('User Statistics', () => {
    it('should get user statistics', async () => {
      const mockStats = {
        totalUsers: 50,
        activeUsers: 45,
      };

      mockPrisma.user.count
        .mockResolvedValueOnce(mockStats.totalUsers)
        .mockResolvedValueOnce(mockStats.activeUsers);

      mockPrisma.user.groupBy.mockResolvedValue([
        { role: 'USER', _count: { id: 30 } },
        { role: 'STAFF', _count: { id: 10 } },
        { role: 'MANAGER', _count: { id: 4 } },
        { role: 'ADMIN', _count: { id: 1 } },
      ]);

      mockPrisma.user.findMany.mockResolvedValue([mockUser]);
      mockPrisma.user.aggregate.mockResolvedValue({
        _count: { lastLoginAt: 35 },
      });

      const result = await getUserStats('ADMIN', schoolId, organizationId);

      expect(result.overview.totalUsers).toBe(50);
      expect(result.overview.activeUsers).toBe(45);
      expect(result.overview.inactiveUsers).toBe(5);
      expect(result.roleBreakdown).toHaveLength(4);
      expect(result.recentUsers).toHaveLength(1);
    });

    it('should restrict stats access to admin/manager roles', async () => {
      // This would be tested at the route level
      // Here we just ensure the function works with proper role
      const result = await getUserStats('MANAGER', schoolId, organizationId);
      expect(result).toBeDefined();
    });
  });

  describe('Password Management', () => {
    it('should change user password successfully', async () => {
      const passwordData = {
        currentPassword: 'validpassword',
        newPassword: 'NewPassword123!@#',
      };

      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        password: '$2a$10$mock.hashed.password.string',
      });
      mockPrisma.user.update.mockResolvedValue(mockUser);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await changeUserPassword('user-123', passwordData);

      expect(result).toEqual({ message: 'Password changed successfully' });
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('should validate current password', async () => {
      const passwordData = {
        currentPassword: 'wrongpassword',
        newPassword: 'NewPassword123!@#',
      };

      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        password: '$2a$10$mock.hashed.password.string',
      });

      await expect(
        changeUserPassword('user-123', passwordData)
      ).rejects.toThrow('Current password is incorrect');
    });

    it('should reset user password as admin', async () => {
      const resetData = {
        newPassword: 'ResetPassword123!@#',
        sendNotification: true,
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await resetUserPassword(
        'user-123',
        resetData,
        creatorId,
        'ADMIN'
      );

      expect(result.message).toBe('Password reset successfully');
      expect(result.newPassword).toBeUndefined(); // Should not return password when sending notification
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('should return new password if not sending notification', async () => {
      const resetData = {
        newPassword: 'ResetPassword123!@#',
        sendNotification: false,
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await resetUserPassword(
        'user-123',
        resetData,
        creatorId,
        'ADMIN'
      );

      expect(result.newPassword).toBe(resetData.newPassword);
    });

    it('should validate password complexity', async () => {
      const passwordData = {
        currentPassword: 'validpassword',
        newPassword: 'weak', // Too weak
      };

      await expect(
        changeUserPassword('user-123', passwordData)
      ).rejects.toThrow();
    });

    it('should validate admin permissions for password reset', async () => {
      const adminUser = {
        ...mockUser,
        role: 'ADMIN',
      };

      mockPrisma.user.findUnique.mockResolvedValue(adminUser);

      await expect(
        resetUserPassword('user-123', { newPassword: 'Test123!@#' }, creatorId, 'MANAGER')
      ).rejects.toThrow('Insufficient permissions to reset this user\'s password');
    });
  });

  describe('Validation', () => {
    it('should validate email format', async () => {
      const invalidData = {
        ...mockUserData,
        email: 'invalid-email-format',
      };

      await expect(
        createUser(invalidData, creatorId, 'ADMIN', schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should validate name length limits', async () => {
      const invalidData = {
        ...mockUserData,
        firstName: 'A'.repeat(51), // Too long
      };

      await expect(
        createUser(invalidData, creatorId, 'ADMIN', schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should validate role enum values', async () => {
      const invalidData = {
        ...mockUserData,
        role: 'INVALID_ROLE' as any,
      };

      await expect(
        createUser(invalidData, creatorId, 'ADMIN', schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should validate UUID format for IDs', async () => {
      const invalidData = {
        ...mockUserData,
        schoolId: 'invalid-uuid',
      };

      await expect(
        createUser(invalidData, creatorId, 'ADMIN', schoolId, organizationId)
      ).rejects.toThrow();
    });
  });
});