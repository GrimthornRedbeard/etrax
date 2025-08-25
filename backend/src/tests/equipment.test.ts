import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createEquipment,
  getEquipmentById,
  updateEquipment,
  deleteEquipment,
  getEquipmentList,
  getEquipmentStats,
  bulkUpdateEquipmentStatus,
  generateEquipmentQRCode,
} from '../services/equipment';

// Mock Prisma
const mockPrisma = {
  equipment: {
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
  category: {
    findFirst: vi.fn(),
  },
  location: {
    findFirst: vi.fn(),
  },
  school: {
    findUnique: vi.fn(),
  },
  transaction: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock('../index', () => ({
  prisma: mockPrisma,
}));

// Mock QR code generation
vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(),
  },
}));

// Mock config
vi.mock('../config/environment', () => ({
  config: {
    frontend: {
      url: 'http://localhost:3000',
    },
  },
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('Equipment Service', () => {
  const userId = 'user-123';
  const schoolId = 'school-123';
  const organizationId = 'org-123';

  const mockCategory = {
    id: 'category-123',
    name: 'Basketball Equipment',
    code: 'BB',
    schoolId,
    organizationId,
  };

  const mockLocation = {
    id: 'location-123',
    name: 'Gymnasium',
    code: 'GYM',
    schoolId,
    organizationId,
  };

  const mockSchool = {
    id: schoolId,
    name: 'Test High School',
    code: 'THS',
  };

  const mockEquipmentData = {
    name: 'Basketball',
    description: 'Official size basketball',
    condition: 'EXCELLENT' as const,
    status: 'AVAILABLE' as const,
    categoryId: 'category-123',
    locationId: 'location-123',
    serialNumber: 'BB001',
    manufacturer: 'Spalding',
    purchasePrice: 29.99,
    currentValue: 25.00,
  };

  const mockEquipment = {
    id: 'equipment-123',
    code: 'BB-123456',
    ...mockEquipmentData,
    schoolId,
    organizationId,
    createdById: userId,
    updatedById: userId,
    isDeleted: false,
    tags: [],
    specifications: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    category: mockCategory,
    location: mockLocation,
    school: mockSchool,
    createdBy: {
      id: userId,
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Equipment Creation', () => {
    it('should create equipment successfully', async () => {
      mockPrisma.category.findFirst.mockResolvedValue(mockCategory);
      mockPrisma.location.findFirst.mockResolvedValue(mockLocation);
      mockPrisma.equipment.create.mockResolvedValue(mockEquipment);
      mockPrisma.equipment.update.mockResolvedValue({
        ...mockEquipment,
        qrCodeUrl: 'data:image/png;base64,mock-qr-code',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await createEquipment(
        mockEquipmentData,
        userId,
        schoolId,
        organizationId
      );

      expect(result).toHaveProperty('id');
      expect(result.name).toBe(mockEquipmentData.name);
      expect(result.categoryId).toBe(mockEquipmentData.categoryId);
      expect(mockPrisma.equipment.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('should throw error if category not found', async () => {
      mockPrisma.category.findFirst.mockResolvedValue(null);
      mockPrisma.location.findFirst.mockResolvedValue(mockLocation);

      await expect(
        createEquipment(mockEquipmentData, userId, schoolId, organizationId)
      ).rejects.toThrow('Category not found or not accessible');
    });

    it('should throw error if location not found', async () => {
      mockPrisma.category.findFirst.mockResolvedValue(mockCategory);
      mockPrisma.location.findFirst.mockResolvedValue(null);

      await expect(
        createEquipment(mockEquipmentData, userId, schoolId, organizationId)
      ).rejects.toThrow('Location not found or not accessible');
    });

    it('should validate required fields', async () => {
      const invalidData = {
        ...mockEquipmentData,
        name: '', // Invalid: empty name
      };

      await expect(
        createEquipment(invalidData, userId, schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should validate condition enum', async () => {
      const invalidData = {
        ...mockEquipmentData,
        condition: 'INVALID_CONDITION' as any,
      };

      await expect(
        createEquipment(invalidData, userId, schoolId, organizationId)
      ).rejects.toThrow();
    });
  });

  describe('Equipment Retrieval', () => {
    it('should get equipment by ID successfully', async () => {
      const mockEquipmentWithTransactions = {
        ...mockEquipment,
        transactions: [],
        updatedBy: mockEquipment.createdBy,
      };

      mockPrisma.equipment.findFirst.mockResolvedValue(mockEquipmentWithTransactions);

      const result = await getEquipmentById(mockEquipment.id, schoolId, organizationId);

      expect(result).toEqual(mockEquipmentWithTransactions);
      expect(mockPrisma.equipment.findFirst).toHaveBeenCalledWith({
        where: {
          id: mockEquipment.id,
          OR: [
            { schoolId },
            { organizationId, schoolId: null },
          ],
        },
        include: expect.any(Object),
      });
    });

    it('should throw error if equipment not found', async () => {
      mockPrisma.equipment.findFirst.mockResolvedValue(null);

      await expect(
        getEquipmentById('non-existent-id', schoolId, organizationId)
      ).rejects.toThrow('Equipment not found');
    });
  });

  describe('Equipment Update', () => {
    it('should update equipment successfully', async () => {
      const updateData = {
        name: 'Updated Basketball',
        condition: 'GOOD' as const,
      };

      const mockEquipmentWithTransactions = {
        ...mockEquipment,
        transactions: [],
        updatedBy: mockEquipment.createdBy,
      };

      const updatedEquipment = {
        ...mockEquipment,
        ...updateData,
        updatedBy: mockEquipment.createdBy,
      };

      mockPrisma.equipment.findFirst.mockResolvedValue(mockEquipmentWithTransactions);
      mockPrisma.equipment.update.mockResolvedValue(updatedEquipment);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await updateEquipment(
        mockEquipment.id,
        updateData,
        userId,
        schoolId,
        organizationId
      );

      expect(result.name).toBe(updateData.name);
      expect(result.condition).toBe(updateData.condition);
      expect(mockPrisma.equipment.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('should validate category if being updated', async () => {
      const updateData = {
        categoryId: 'new-category-id',
      };

      const mockEquipmentWithTransactions = {
        ...mockEquipment,
        transactions: [],
        updatedBy: mockEquipment.createdBy,
      };

      mockPrisma.equipment.findFirst.mockResolvedValue(mockEquipmentWithTransactions);
      mockPrisma.category.findFirst.mockResolvedValue(null);

      await expect(
        updateEquipment(mockEquipment.id, updateData, userId, schoolId, organizationId)
      ).rejects.toThrow('Category not found or not accessible');
    });
  });

  describe('Equipment Deletion', () => {
    it('should delete equipment successfully', async () => {
      const mockEquipmentWithTransactions = {
        ...mockEquipment,
        transactions: [],
        updatedBy: mockEquipment.createdBy,
      };

      mockPrisma.equipment.findFirst.mockResolvedValue(mockEquipmentWithTransactions);
      mockPrisma.transaction.count.mockResolvedValue(0);
      mockPrisma.equipment.update.mockResolvedValue({
        ...mockEquipment,
        isDeleted: true,
        deletedAt: new Date(),
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await deleteEquipment(
        mockEquipment.id,
        userId,
        schoolId,
        organizationId
      );

      expect(result).toEqual({ message: 'Equipment deleted successfully' });
      expect(mockPrisma.equipment.update).toHaveBeenCalledWith({
        where: { id: mockEquipment.id },
        data: {
          isDeleted: true,
          deletedAt: expect.any(Date),
          updatedById: userId,
        },
      });
    });

    it('should prevent deletion if equipment has active transactions', async () => {
      const mockEquipmentWithTransactions = {
        ...mockEquipment,
        transactions: [],
        updatedBy: mockEquipment.createdBy,
      };

      mockPrisma.equipment.findFirst.mockResolvedValue(mockEquipmentWithTransactions);
      mockPrisma.transaction.count.mockResolvedValue(1); // Has active transactions

      await expect(
        deleteEquipment(mockEquipment.id, userId, schoolId, organizationId)
      ).rejects.toThrow('Cannot delete equipment with active transactions');
    });
  });

  describe('Equipment Listing and Filtering', () => {
    it('should get equipment list with default filters', async () => {
      const mockEquipmentList = [mockEquipment];
      const totalCount = 1;

      mockPrisma.equipment.findMany.mockResolvedValue(mockEquipmentList);
      mockPrisma.equipment.count.mockResolvedValue(totalCount);

      const result = await getEquipmentList({}, schoolId, organizationId);

      expect(result.equipment).toEqual(mockEquipmentList);
      expect(result.pagination.total).toBe(totalCount);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
    });

    it('should filter by search term', async () => {
      const filters = { search: 'basketball' };
      const mockEquipmentList = [mockEquipment];

      mockPrisma.equipment.findMany.mockResolvedValue(mockEquipmentList);
      mockPrisma.equipment.count.mockResolvedValue(1);

      await getEquipmentList(filters, schoolId, organizationId);

      expect(mockPrisma.equipment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { name: { contains: 'basketball', mode: 'insensitive' } },
              { description: { contains: 'basketball', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });

    it('should filter by status', async () => {
      const filters = { status: 'AVAILABLE' as const };

      mockPrisma.equipment.findMany.mockResolvedValue([]);
      mockPrisma.equipment.count.mockResolvedValue(0);

      await getEquipmentList(filters, schoolId, organizationId);

      expect(mockPrisma.equipment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'AVAILABLE',
          }),
        })
      );
    });

    it('should apply pagination correctly', async () => {
      const filters = { page: 2, limit: 10 };

      mockPrisma.equipment.findMany.mockResolvedValue([]);
      mockPrisma.equipment.count.mockResolvedValue(0);

      await getEquipmentList(filters, schoolId, organizationId);

      expect(mockPrisma.equipment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10, // (page - 1) * limit
          take: 10,
        })
      );
    });
  });

  describe('Equipment Statistics', () => {
    it('should get equipment statistics', async () => {
      const mockStats = {
        totalEquipment: 100,
        availableEquipment: 80,
        checkedOutEquipment: 15,
        maintenanceEquipment: 5,
        totalValue: { _sum: { currentValue: 5000 } },
        categoryStats: [
          { categoryId: 'cat-1', _count: { id: 50 } },
          { categoryId: 'cat-2', _count: { id: 50 } },
        ],
        conditionStats: [
          { condition: 'EXCELLENT', _count: { id: 60 } },
          { condition: 'GOOD', _count: { id: 30 } },
          { condition: 'FAIR', _count: { id: 10 } },
        ],
        recentActivity: [mockEquipment],
      };

      // Mock all the parallel queries
      mockPrisma.equipment.count
        .mockResolvedValueOnce(mockStats.totalEquipment)
        .mockResolvedValueOnce(mockStats.availableEquipment)
        .mockResolvedValueOnce(mockStats.checkedOutEquipment)
        .mockResolvedValueOnce(mockStats.maintenanceEquipment);

      mockPrisma.equipment.aggregate.mockResolvedValue(mockStats.totalValue);
      mockPrisma.equipment.groupBy
        .mockResolvedValueOnce(mockStats.categoryStats)
        .mockResolvedValueOnce(mockStats.conditionStats);
      mockPrisma.equipment.findMany.mockResolvedValue(mockStats.recentActivity);

      const result = await getEquipmentStats(schoolId, organizationId);

      expect(result.overview.totalEquipment).toBe(100);
      expect(result.overview.availableEquipment).toBe(80);
      expect(result.overview.checkedOutEquipment).toBe(15);
      expect(result.overview.totalValue).toBe(5000);
      expect(result.overview.utilizationRate).toBe(15); // 15/100 * 100
      expect(result.categoryBreakdown).toHaveLength(2);
      expect(result.conditionBreakdown).toHaveLength(3);
    });
  });

  describe('Bulk Operations', () => {
    it('should bulk update equipment status', async () => {
      const equipmentIds = ['eq-1', 'eq-2', 'eq-3'];
      const newStatus = 'MAINTENANCE';
      const mockEquipmentList = equipmentIds.map(id => ({
        ...mockEquipment,
        id,
      }));

      mockPrisma.equipment.findMany.mockResolvedValue(mockEquipmentList);
      mockPrisma.equipment.updateMany.mockResolvedValue({ count: 3 });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await bulkUpdateEquipmentStatus(
        equipmentIds,
        newStatus,
        userId,
        schoolId,
        organizationId
      );

      expect(result.updatedCount).toBe(3);
      expect(mockPrisma.equipment.updateMany).toHaveBeenCalledWith({
        where: { id: { in: equipmentIds } },
        data: {
          status: newStatus,
          updatedById: userId,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should validate equipment IDs exist', async () => {
      const equipmentIds = ['eq-1', 'eq-2', 'eq-3'];
      mockPrisma.equipment.findMany.mockResolvedValue([mockEquipment]); // Only 1 found, expecting 3

      await expect(
        bulkUpdateEquipmentStatus(
          equipmentIds,
          'MAINTENANCE',
          userId,
          schoolId,
          organizationId
        )
      ).rejects.toThrow('Some equipment not found or not accessible');
    });

    it('should validate status value', async () => {
      const equipmentIds = ['eq-1'];

      await expect(
        bulkUpdateEquipmentStatus(
          equipmentIds,
          'INVALID_STATUS',
          userId,
          schoolId,
          organizationId
        )
      ).rejects.toThrow('Invalid equipment status');
    });
  });

  describe('QR Code Generation', () => {
    it('should generate QR code for equipment', async () => {
      const QRCode = await import('qrcode');
      vi.mocked(QRCode.default.toDataURL).mockResolvedValue('data:image/png;base64,mock-qr-code');

      const result = await generateEquipmentQRCode('equipment-123', 'THS');

      expect(result).toBe('data:image/png;base64,mock-qr-code');
      expect(QRCode.default.toDataURL).toHaveBeenCalledWith(
        expect.stringContaining('equipment-123'),
        expect.any(Object)
      );
    });

    it('should handle QR code generation errors', async () => {
      const QRCode = await import('qrcode');
      vi.mocked(QRCode.default.toDataURL).mockRejectedValue(new Error('QR generation failed'));

      await expect(
        generateEquipmentQRCode('equipment-123', 'THS')
      ).rejects.toThrow('Failed to generate QR code');
    });
  });

  describe('Validation', () => {
    it('should validate UUID fields', async () => {
      const invalidData = {
        ...mockEquipmentData,
        categoryId: 'not-a-uuid',
      };

      await expect(
        createEquipment(invalidData, userId, schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should validate positive numbers', async () => {
      const invalidData = {
        ...mockEquipmentData,
        purchasePrice: -10, // Negative price
      };

      await expect(
        createEquipment(invalidData, userId, schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should validate datetime strings', async () => {
      const invalidData = {
        ...mockEquipmentData,
        purchaseDate: 'not-a-date',
      };

      await expect(
        createEquipment(invalidData, userId, schoolId, organizationId)
      ).rejects.toThrow();
    });
  });
});