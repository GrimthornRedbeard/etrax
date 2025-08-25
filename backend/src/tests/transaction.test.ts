import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  checkOutEquipment,
  checkInEquipment,
  bulkCheckOutEquipment,
  getTransactionById,
  getTransactionsList,
  getTransactionStats,
  updateTransactionStatus,
  updateOverdueTransactions,
} from '../services/transaction';

// Mock Prisma client
const mockPrisma = {
  transaction: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  equipment: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  user: {
    findFirst: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock('../index', () => ({
  prisma: mockPrisma,
}));

// Mock date-fns functions
vi.mock('date-fns', () => ({
  addDays: vi.fn((date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000)),
  addHours: vi.fn((date, hours) => new Date(date.getTime() + hours * 60 * 60 * 1000)),
  isBefore: vi.fn((date1, date2) => date1 < date2),
  isAfter: vi.fn((date1, date2) => date1 > date2),
}));

describe('Transaction Service', () => {
  const checkedOutById = 'staff-123';
  const userId = 'user-123';
  const schoolId = 'school-123';
  const organizationId = 'org-123';

  const mockEquipment = {
    id: 'equipment-123',
    name: 'Test Basketball',
    code: 'BB-001',
    status: 'AVAILABLE',
    condition: 'EXCELLENT',
    categoryId: 'category-123',
    locationId: 'location-123',
    isDeleted: false,
    schoolId,
    organizationId,
    category: {
      id: 'category-123',
      name: 'Basketball Equipment',
      code: 'BB',
    },
    location: {
      id: 'location-123',
      name: 'Equipment Storage',
      code: 'STOR',
    },
    transactions: [], // No active transactions
  };

  const mockUser = {
    id: userId,
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    isActive: true,
    schoolId,
    organizationId,
  };

  const mockTransaction = {
    id: 'transaction-123',
    equipmentId: 'equipment-123',
    userId,
    checkedOutById,
    status: 'CHECKED_OUT',
    checkedOutAt: new Date(),
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    expectedReturnDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    checkoutLocation: 'Front Desk',
    notes: 'Regular checkout',
    schoolId,
    organizationId,
    metadata: {},
    equipment: mockEquipment,
    user: {
      id: userId,
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
    },
    checkedOutBy: {
      id: checkedOutById,
      firstName: 'Staff',
      lastName: 'Member',
      email: 'staff@example.com',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Equipment Checkout', () => {
    const checkoutData = {
      equipmentId: 'equipment-123',
      userId,
      notes: 'Regular checkout',
      checkoutLocation: 'Front Desk',
    };

    it('should check out equipment successfully', async () => {
      mockPrisma.equipment.findFirst.mockResolvedValue(mockEquipment);
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.transaction.create.mockResolvedValue(mockTransaction);
      mockPrisma.equipment.update.mockResolvedValue({
        ...mockEquipment,
        status: 'CHECKED_OUT',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await checkOutEquipment(
        checkoutData,
        checkedOutById,
        schoolId,
        organizationId
      );

      expect(result).toHaveProperty('id');
      expect(result.status).toBe('CHECKED_OUT');
      expect(result.equipmentId).toBe(checkoutData.equipmentId);
      expect(mockPrisma.transaction.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.equipment.update).toHaveBeenCalledWith({
        where: { id: checkoutData.equipmentId },
        data: {
          status: 'CHECKED_OUT',
          updatedAt: expect.any(Date),
        },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('should throw error if equipment not found', async () => {
      mockPrisma.equipment.findFirst.mockResolvedValue(null);

      await expect(
        checkOutEquipment(checkoutData, checkedOutById, schoolId, organizationId)
      ).rejects.toThrow('Equipment not found or not accessible');
    });

    it('should throw error if equipment not available', async () => {
      mockPrisma.equipment.findFirst.mockResolvedValue({
        ...mockEquipment,
        status: 'MAINTENANCE',
      });

      await expect(
        checkOutEquipment(checkoutData, checkedOutById, schoolId, organizationId)
      ).rejects.toThrow('Equipment is not available (current status: MAINTENANCE)');
    });

    it('should throw error if equipment already checked out', async () => {
      mockPrisma.equipment.findFirst.mockResolvedValue({
        ...mockEquipment,
        transactions: [{ status: 'CHECKED_OUT' }], // Has active transaction
      });

      await expect(
        checkOutEquipment(checkoutData, checkedOutById, schoolId, organizationId)
      ).rejects.toThrow('Equipment is already checked out');
    });

    it('should throw error if target user not found', async () => {
      mockPrisma.equipment.findFirst.mockResolvedValue(mockEquipment);
      mockPrisma.user.findFirst.mockResolvedValue(null); // User not found

      await expect(
        checkOutEquipment(checkoutData, checkedOutById, schoolId, organizationId)
      ).rejects.toThrow('Target user not found or not accessible');
    });

    it('should use default due date if not provided', async () => {
      const checkoutDataNoDue = {
        equipmentId: 'equipment-123',
        userId,
      };

      mockPrisma.equipment.findFirst.mockResolvedValue(mockEquipment);
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.transaction.create.mockResolvedValue(mockTransaction);
      mockPrisma.equipment.update.mockResolvedValue(mockEquipment);
      mockPrisma.auditLog.create.mockResolvedValue({});

      await checkOutEquipment(
        checkoutDataNoDue,
        checkedOutById,
        schoolId,
        organizationId
      );

      expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dueDate: expect.any(Date),
          }),
        })
      );
    });

    it('should assign to checker if no target user provided', async () => {
      const checkoutDataNoUser = {
        equipmentId: 'equipment-123',
      };

      mockPrisma.equipment.findFirst.mockResolvedValue(mockEquipment);
      mockPrisma.transaction.create.mockResolvedValue({
        ...mockTransaction,
        userId: checkedOutById,
      });
      mockPrisma.equipment.update.mockResolvedValue(mockEquipment);
      mockPrisma.auditLog.create.mockResolvedValue({});

      await checkOutEquipment(
        checkoutDataNoUser,
        checkedOutById,
        schoolId,
        organizationId
      );

      expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: checkedOutById, // Should be assigned to checker
          }),
        })
      );
    });
  });

  describe('Equipment Checkin', () => {
    const checkinData = {
      transactionId: 'transaction-123',
      condition: 'GOOD' as const,
      notes: 'Regular return',
      actualReturnLocation: 'Return Desk',
    };

    it('should check in equipment successfully', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(mockTransaction);
      mockPrisma.transaction.update.mockResolvedValue({
        ...mockTransaction,
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
        checkedInById: checkedOutById,
      });
      mockPrisma.equipment.update.mockResolvedValue({
        ...mockEquipment,
        status: 'AVAILABLE',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await checkInEquipment(
        checkinData,
        checkedOutById,
        schoolId,
        organizationId
      );

      expect(result.status).toBe('CHECKED_IN');
      expect(mockPrisma.transaction.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.equipment.update).toHaveBeenCalledWith({
        where: { id: mockTransaction.equipmentId },
        data: {
          status: 'AVAILABLE',
          condition: 'GOOD',
          updatedAt: expect.any(Date),
        },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('should throw error if transaction not found', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(null);

      await expect(
        checkInEquipment(checkinData, checkedOutById, schoolId, organizationId)
      ).rejects.toThrow('Transaction not found or equipment not checked out');
    });

    it('should set equipment to maintenance if damaged', async () => {
      const damageCheckinData = {
        ...checkinData,
        condition: 'DAMAGED' as const,
        maintenanceRequired: true,
        damageReport: {
          severity: 'MODERATE' as const,
          description: 'Cracked surface',
          repairRequired: true,
        },
      };

      mockPrisma.transaction.findFirst.mockResolvedValue(mockTransaction);
      mockPrisma.transaction.update.mockResolvedValue({
        ...mockTransaction,
        status: 'CHECKED_IN',
        returnCondition: 'DAMAGED',
      });
      mockPrisma.equipment.update.mockResolvedValue({
        ...mockEquipment,
        status: 'MAINTENANCE',
        condition: 'DAMAGED',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      await checkInEquipment(
        damageCheckinData,
        checkedOutById,
        schoolId,
        organizationId
      );

      expect(mockPrisma.equipment.update).toHaveBeenCalledWith({
        where: { id: mockTransaction.equipmentId },
        data: {
          status: 'MAINTENANCE', // Should be set to maintenance
          condition: 'DAMAGED',
          updatedAt: expect.any(Date),
        },
      });

      // Should create maintenance request
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(2); // Check-in + maintenance request
    });

    it('should detect overdue return', async () => {
      const overdueTransaction = {
        ...mockTransaction,
        dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      };

      mockPrisma.transaction.findFirst.mockResolvedValue(overdueTransaction);
      mockPrisma.transaction.update.mockResolvedValue({
        ...overdueTransaction,
        status: 'CHECKED_IN',
        wasOverdue: true,
      });
      mockPrisma.equipment.update.mockResolvedValue(mockEquipment);
      mockPrisma.auditLog.create.mockResolvedValue({});

      await checkInEquipment(
        checkinData,
        checkedOutById,
        schoolId,
        organizationId
      );

      expect(mockPrisma.transaction.update).toHaveBeenCalledWith({
        where: { id: checkinData.transactionId },
        data: expect.objectContaining({
          wasOverdue: true,
        }),
      });
    });
  });

  describe('Bulk Operations', () => {
    const bulkCheckoutData = {
      equipmentIds: ['equipment-1', 'equipment-2', 'equipment-3'],
      userId,
      notes: 'Bulk checkout for team practice',
      checkoutLocation: 'Coach Office',
    };

    it('should bulk checkout equipment successfully', async () => {
      const mockEquipmentList = bulkCheckoutData.equipmentIds.map((id, index) => ({
        ...mockEquipment,
        id,
        name: `Equipment ${index + 1}`,
        transactions: [],
      }));

      mockPrisma.equipment.findMany.mockResolvedValue(mockEquipmentList);
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);

      // Mock the transaction function
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockPrisma);
      });

      const mockTransactionList = mockEquipmentList.map((equipment, index) => ({
        ...mockTransaction,
        id: `transaction-${index + 1}`,
        equipmentId: equipment.id,
        equipment,
      }));

      mockPrisma.transaction.create
        .mockResolvedValueOnce(mockTransactionList[0])
        .mockResolvedValueOnce(mockTransactionList[1])
        .mockResolvedValueOnce(mockTransactionList[2]);

      mockPrisma.equipment.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await bulkCheckOutEquipment(
        bulkCheckoutData,
        checkedOutById,
        schoolId,
        organizationId
      );

      expect(result.transactions).toHaveLength(3);
      expect(result.message).toContain('Successfully checked out 3 items');
      expect(mockPrisma.transaction.create).toHaveBeenCalledTimes(3);
      expect(mockPrisma.equipment.update).toHaveBeenCalledTimes(3);
    });

    it('should throw error if some equipment unavailable', async () => {
      // Return fewer equipment items than requested
      mockPrisma.equipment.findMany.mockResolvedValue([mockEquipment]); // Only 1 out of 3

      await expect(
        bulkCheckOutEquipment(bulkCheckoutData, checkedOutById, schoolId, organizationId)
      ).rejects.toThrow('Some equipment is not available or not accessible');
    });

    it('should throw error if some equipment already checked out', async () => {
      const mockEquipmentList = bulkCheckoutData.equipmentIds.map(id => ({
        ...mockEquipment,
        id,
        transactions: [{ status: 'CHECKED_OUT' }], // Already checked out
      }));

      mockPrisma.equipment.findMany.mockResolvedValue(mockEquipmentList);

      await expect(
        bulkCheckOutEquipment(bulkCheckoutData, checkedOutById, schoolId, organizationId)
      ).rejects.toThrow('Equipment already checked out');
    });
  });

  describe('Transaction Retrieval', () => {
    it('should get transaction by ID successfully', async () => {
      const transactionWithComputed = {
        ...mockTransaction,
        isOverdue: false,
        daysOverdue: 0,
      };

      mockPrisma.transaction.findFirst.mockResolvedValue(mockTransaction);

      const result = await getTransactionById('transaction-123', schoolId, organizationId);

      expect(result).toHaveProperty('id', 'transaction-123');
      expect(result).toHaveProperty('isOverdue');
      expect(result).toHaveProperty('daysOverdue');
      expect(mockPrisma.transaction.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'transaction-123',
          OR: [
            { schoolId },
            { organizationId, schoolId: null },
          ],
        },
        include: expect.any(Object),
      });
    });

    it('should throw error if transaction not found', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(null);

      await expect(
        getTransactionById('non-existent', schoolId, organizationId)
      ).rejects.toThrow('Transaction not found');
    });

    it('should calculate overdue status correctly', async () => {
      const overdueTransaction = {
        ...mockTransaction,
        dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      };

      mockPrisma.transaction.findFirst.mockResolvedValue(overdueTransaction);

      const result = await getTransactionById('transaction-123', schoolId, organizationId);

      expect(result.isOverdue).toBe(true);
      expect(result.daysOverdue).toBeGreaterThan(0);
    });
  });

  describe('Transaction Listing and Filtering', () => {
    it('should get transactions list with default filters', async () => {
      const mockTransactionsList = [mockTransaction];
      const totalCount = 1;

      mockPrisma.transaction.findMany.mockResolvedValue(mockTransactionsList);
      mockPrisma.transaction.count.mockResolvedValue(totalCount);

      const result = await getTransactionsList({}, schoolId, organizationId);

      expect(result.transactions).toHaveLength(1);
      expect(result.pagination.total).toBe(totalCount);
      expect(result.transactions[0]).toHaveProperty('isOverdue');
      expect(result.transactions[0]).toHaveProperty('daysOverdue');
    });

    it('should filter by transaction status', async () => {
      const filters = { status: 'CHECKED_OUT' as const };

      mockPrisma.transaction.findMany.mockResolvedValue([]);
      mockPrisma.transaction.count.mockResolvedValue(0);

      await getTransactionsList(filters, schoolId, organizationId);

      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'CHECKED_OUT',
          }),
        })
      );
    });

    it('should filter by user ID', async () => {
      const filters = { userId: 'user-456' };

      mockPrisma.transaction.findMany.mockResolvedValue([]);
      mockPrisma.transaction.count.mockResolvedValue(0);

      await getTransactionsList(filters, schoolId, organizationId);

      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-456',
          }),
        })
      );
    });

    it('should filter overdue transactions', async () => {
      const filters = { isOverdue: true };

      mockPrisma.transaction.findMany.mockResolvedValue([]);
      mockPrisma.transaction.count.mockResolvedValue(0);

      await getTransactionsList(filters, schoolId, organizationId);

      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'CHECKED_OUT',
            dueDate: { lt: expect.any(Date) },
          }),
        })
      );
    });

    it('should filter by date ranges', async () => {
      const filters = {
        dueDateFrom: '2023-01-01T00:00:00Z',
        dueDateTo: '2023-12-31T23:59:59Z',
      };

      mockPrisma.transaction.findMany.mockResolvedValue([]);
      mockPrisma.transaction.count.mockResolvedValue(0);

      await getTransactionsList(filters, schoolId, organizationId);

      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dueDate: {
              gte: new Date('2023-01-01T00:00:00Z'),
              lte: new Date('2023-12-31T23:59:59Z'),
            },
          }),
        })
      );
    });
  });

  describe('Transaction Statistics', () => {
    it('should get comprehensive transaction statistics', async () => {
      const mockStats = {
        totalTransactions: 100,
        activeTransactions: 25,
        overdueTransactions: 5,
        todayTransactions: 10,
      };

      mockPrisma.transaction.count
        .mockResolvedValueOnce(mockStats.totalTransactions)
        .mockResolvedValueOnce(mockStats.activeTransactions)
        .mockResolvedValueOnce(mockStats.overdueTransactions)
        .mockResolvedValueOnce(mockStats.todayTransactions);

      mockPrisma.transaction.groupBy.mockResolvedValue([
        { status: 'CHECKED_OUT', _count: { id: 25 } },
        { status: 'CHECKED_IN', _count: { id: 70 } },
        { status: 'OVERDUE', _count: { id: 5 } },
      ]);

      // Equipment utilization stats
      mockPrisma.equipment.count
        .mockResolvedValueOnce(25) // Checked out equipment
        .mockResolvedValueOnce(100); // Total equipment

      // Overdue breakdown
      mockPrisma.transaction.findMany.mockResolvedValue([
        { id: '1', dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) }, // 2 days overdue
        { id: '2', dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) }, // 10 days overdue
      ]);

      const result = await getTransactionStats(schoolId, organizationId);

      expect(result.overview.totalTransactions).toBe(100);
      expect(result.overview.activeTransactions).toBe(25);
      expect(result.overview.overdueTransactions).toBe(5);
      expect(result.overview.utilizationRate).toBe(25); // 25/100 * 100
      expect(result.statusBreakdown).toHaveLength(3);
      expect(result.overdueBreakdown).toHaveProperty('1-3 days');
      expect(result.overdueBreakdown).toHaveProperty('8-14 days');
      expect(result.utilization.utilizationRate).toBe(25);
    });
  });

  describe('Status Updates', () => {
    it('should update transaction status successfully', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(mockTransaction);
      mockPrisma.transaction.update.mockResolvedValue({
        ...mockTransaction,
        status: 'LOST',
        statusNotes: 'Equipment reported lost',
      });
      mockPrisma.equipment.update.mockResolvedValue({
        ...mockEquipment,
        status: 'LOST',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await updateTransactionStatus(
        'transaction-123',
        'LOST',
        checkedOutById,
        'Equipment reported lost',
        schoolId,
        organizationId
      );

      expect(result.status).toBe('LOST');
      expect(mockPrisma.transaction.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.equipment.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('should validate status transitions', async () => {
      // Try to transition from CHECKED_IN to CHECKED_OUT (not allowed)
      const completedTransaction = {
        ...mockTransaction,
        status: 'CHECKED_IN',
      };

      mockPrisma.transaction.findFirst.mockResolvedValue(completedTransaction);

      await expect(
        updateTransactionStatus(
          'transaction-123',
          'CHECKED_OUT', // Invalid transition from CHECKED_IN
          checkedOutById,
          undefined,
          schoolId,
          organizationId
        )
      ).rejects.toThrow('Cannot transition from CHECKED_IN to CHECKED_OUT');
    });

    it('should reject invalid status values', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(mockTransaction);

      await expect(
        updateTransactionStatus(
          'transaction-123',
          'INVALID_STATUS',
          checkedOutById,
          undefined,
          schoolId,
          organizationId
        )
      ).rejects.toThrow('Invalid transaction status');
    });
  });

  describe('Overdue Management', () => {
    it('should update overdue transactions', async () => {
      const overdueTransactions = [
        {
          id: 'transaction-1',
          status: 'CHECKED_OUT',
          dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        },
        {
          id: 'transaction-2',
          status: 'CHECKED_OUT',
          dueDate: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
        },
      ];

      mockPrisma.transaction.findMany.mockResolvedValue(overdueTransactions);
      mockPrisma.transaction.updateMany.mockResolvedValue({ count: 2 });

      const result = await updateOverdueTransactions();

      expect(result.updated).toBe(2);
      expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['transaction-1', 'transaction-2'] },
        },
        data: {
          status: 'OVERDUE',
          statusUpdatedAt: expect.any(Date),
        },
      });
    });

    it('should return zero if no overdue transactions', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      const result = await updateOverdueTransactions();

      expect(result.updated).toBe(0);
      expect(mockPrisma.transaction.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('Validation', () => {
    it('should validate equipment ID format', async () => {
      const invalidData = {
        equipmentId: 'not-a-uuid',
        userId,
      };

      await expect(
        checkOutEquipment(invalidData, checkedOutById, schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should validate user ID format', async () => {
      const invalidData = {
        equipmentId: 'equipment-123',
        userId: 'not-a-uuid',
      };

      await expect(
        checkOutEquipment(invalidData, checkedOutById, schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should validate notes length', async () => {
      const invalidData = {
        equipmentId: 'equipment-123',
        notes: 'x'.repeat(501), // Too long
      };

      await expect(
        checkOutEquipment(invalidData, checkedOutById, schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should validate datetime formats', async () => {
      const invalidData = {
        equipmentId: 'equipment-123',
        dueDate: 'invalid-date',
      };

      await expect(
        checkOutEquipment(invalidData, checkedOutById, schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should validate condition enum values', async () => {
      const invalidData = {
        transactionId: 'transaction-123',
        condition: 'INVALID_CONDITION' as any,
      };

      await expect(
        checkInEquipment(invalidData, checkedOutById, schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should validate bulk operation limits', async () => {
      const invalidData = {
        equipmentIds: new Array(51).fill(0).map((_, i) => `equipment-${i}`), // Too many items
        userId,
      };

      await expect(
        bulkCheckOutEquipment(invalidData, checkedOutById, schoolId, organizationId)
      ).rejects.toThrow();
    });
  });
});