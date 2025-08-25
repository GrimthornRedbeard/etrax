import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createCategory,
  getCategoryById,
  updateCategory,
  deleteCategory,
  getCategoriesList,
  getCategoryTree,
  getCategoryStats,
  reorderCategories,
} from '../services/category';
import {
  testPrisma,
  createTestUser,
  createTestOrganization,
  createTestSchool,
  createTestCategory,
} from './setup';

// Mock Prisma client
const mockPrisma = {
  category: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
    deleteMany: vi.fn(),
  },
  equipment: {
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock('../index', () => ({
  prisma: mockPrisma,
}));

describe('Category Service', () => {
  const userId = 'user-123';
  const schoolId = 'school-123';
  const organizationId = 'org-123';

  const mockCategoryData = {
    name: 'Basketball Equipment',
    code: 'BB',
    description: 'Equipment for basketball activities',
    color: '#ff5722',
    isActive: true,
    sortOrder: 1,
  };

  const mockCategory = {
    id: 'category-123',
    ...mockCategoryData,
    schoolId,
    organizationId,
    createdById: userId,
    updatedById: userId,
    parentId: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    parent: null,
    children: [],
    createdBy: {
      id: userId,
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
    },
    _count: {
      equipment: 5,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Category Creation', () => {
    it('should create category successfully', async () => {
      mockPrisma.category.findFirst.mockResolvedValue(null); // No existing category with same code
      mockPrisma.category.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      mockPrisma.category.create.mockResolvedValue(mockCategory);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await createCategory(
        mockCategoryData,
        userId,
        schoolId,
        organizationId
      );

      expect(result).toHaveProperty('id');
      expect(result.name).toBe(mockCategoryData.name);
      expect(result.code).toBe(mockCategoryData.code);
      expect(mockPrisma.category.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('should throw error if category code already exists', async () => {
      mockPrisma.category.findFirst.mockResolvedValue(mockCategory);

      await expect(
        createCategory(mockCategoryData, userId, schoolId, organizationId)
      ).rejects.toThrow('Category code already exists');
    });

    it('should validate category code format', async () => {
      const invalidData = {
        ...mockCategoryData,
        code: 'invalid-code', // Contains lowercase and hyphen
      };

      await expect(
        createCategory(invalidData, userId, schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should validate hex color format', async () => {
      const invalidData = {
        ...mockCategoryData,
        color: 'red', // Invalid hex color
      };

      await expect(
        createCategory(invalidData, userId, schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should handle parent category validation', async () => {
      const parentId = 'parent-123';
      const dataWithParent = {
        ...mockCategoryData,
        parentId,
      };

      mockPrisma.category.findFirst
        .mockResolvedValueOnce(null) // No existing category with same code
        .mockResolvedValueOnce(mockCategory); // Parent category exists
      mockPrisma.category.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      mockPrisma.category.create.mockResolvedValue({
        ...mockCategory,
        parentId,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await createCategory(
        dataWithParent,
        userId,
        schoolId,
        organizationId
      );

      expect(result.parentId).toBe(parentId);
      expect(mockPrisma.category.findFirst).toHaveBeenCalledTimes(2); // Code check + parent check
    });

    it('should throw error if parent category not found', async () => {
      const dataWithParent = {
        ...mockCategoryData,
        parentId: 'non-existent-parent',
      };

      mockPrisma.category.findFirst
        .mockResolvedValueOnce(null) // No existing category with same code
        .mockResolvedValueOnce(null); // Parent category not found

      await expect(
        createCategory(dataWithParent, userId, schoolId, organizationId)
      ).rejects.toThrow('Parent category not found or not accessible');
    });

    it('should auto-increment sort order', async () => {
      mockPrisma.category.findFirst.mockResolvedValue(null);
      mockPrisma.category.aggregate.mockResolvedValue({ _max: { sortOrder: 5 } });
      mockPrisma.category.create.mockResolvedValue({
        ...mockCategory,
        sortOrder: 6,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      await createCategory(mockCategoryData, userId, schoolId, organizationId);

      expect(mockPrisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sortOrder: 6,
          }),
        })
      );
    });
  });

  describe('Category Retrieval', () => {
    it('should get category by ID successfully', async () => {
      const categoryWithChildren = {
        ...mockCategory,
        children: [
          {
            id: 'child-1',
            name: 'Child Category',
            code: 'CHILD',
            isActive: true,
          },
        ],
        _count: {
          equipment: 5,
          children: 1,
        },
      };

      mockPrisma.category.findFirst.mockResolvedValue(categoryWithChildren);

      const result = await getCategoryById('category-123', schoolId, organizationId);

      expect(result).toEqual(categoryWithChildren);
      expect(result.children).toHaveLength(1);
      expect(mockPrisma.category.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'category-123',
          OR: [
            { schoolId },
            { organizationId, schoolId: null },
          ],
        },
        include: expect.any(Object),
      });
    });

    it('should throw error if category not found', async () => {
      mockPrisma.category.findFirst.mockResolvedValue(null);

      await expect(
        getCategoryById('non-existent-id', schoolId, organizationId)
      ).rejects.toThrow('Category not found');
    });
  });

  describe('Category Update', () => {
    it('should update category successfully', async () => {
      const updateData = {
        name: 'Updated Basketball Equipment',
        color: '#2196f3',
      };

      const updatedCategory = {
        ...mockCategory,
        ...updateData,
        updatedBy: mockCategory.createdBy,
      };

      mockPrisma.category.findFirst.mockResolvedValue(mockCategory);
      mockPrisma.category.update.mockResolvedValue(updatedCategory);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await updateCategory(
        'category-123',
        updateData,
        userId,
        schoolId,
        organizationId
      );

      expect(result.name).toBe(updateData.name);
      expect(result.color).toBe(updateData.color);
      expect(mockPrisma.category.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('should validate code uniqueness when updating', async () => {
      const updateData = {
        code: 'NEW_CODE',
      };

      mockPrisma.category.findFirst
        .mockResolvedValueOnce(mockCategory) // Existing category
        .mockResolvedValueOnce({ id: 'other-category', code: 'NEW_CODE' }); // Code already exists

      await expect(
        updateCategory('category-123', updateData, userId, schoolId, organizationId)
      ).rejects.toThrow('Category code already exists');
    });

    it('should not log audit if no changes made', async () => {
      const updateData = {
        name: mockCategory.name, // Same as existing
      };

      mockPrisma.category.findFirst.mockResolvedValue(mockCategory);
      mockPrisma.category.update.mockResolvedValue(mockCategory);

      await updateCategory(
        'category-123',
        updateData,
        userId,
        schoolId,
        organizationId
      );

      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('Category Deletion', () => {
    it('should delete category successfully', async () => {
      mockPrisma.category.findFirst.mockResolvedValue(mockCategory);
      mockPrisma.equipment.count.mockResolvedValue(0); // No equipment
      mockPrisma.category.count.mockResolvedValue(0); // No children
      mockPrisma.category.update.mockResolvedValue({
        ...mockCategory,
        isActive: false,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await deleteCategory(
        'category-123',
        userId,
        schoolId,
        organizationId
      );

      expect(result).toEqual({ message: 'Category deleted successfully' });
      expect(mockPrisma.category.update).toHaveBeenCalledWith({
        where: { id: 'category-123' },
        data: {
          isActive: false,
          updatedById: userId,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should prevent deletion if category has equipment', async () => {
      mockPrisma.category.findFirst.mockResolvedValue(mockCategory);
      mockPrisma.equipment.count.mockResolvedValue(5); // Has equipment

      await expect(
        deleteCategory('category-123', userId, schoolId, organizationId)
      ).rejects.toThrow('Cannot delete category with existing equipment');
    });

    it('should prevent deletion if category has children', async () => {
      mockPrisma.category.findFirst.mockResolvedValue(mockCategory);
      mockPrisma.equipment.count.mockResolvedValue(0);
      mockPrisma.category.count.mockResolvedValue(2); // Has children

      await expect(
        deleteCategory('category-123', userId, schoolId, organizationId)
      ).rejects.toThrow('Cannot delete category with child categories');
    });
  });

  describe('Category Listing and Filtering', () => {
    it('should get categories list with default filters', async () => {
      const mockCategoriesList = [mockCategory];
      const totalCount = 1;

      mockPrisma.category.findMany.mockResolvedValue(mockCategoriesList);
      mockPrisma.category.count.mockResolvedValue(totalCount);

      const result = await getCategoriesList({}, schoolId, organizationId);

      expect(result.categories).toEqual(mockCategoriesList);
      expect(result.pagination.total).toBe(totalCount);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(50);
    });

    it('should filter by search term', async () => {
      const filters = { search: 'basketball' };
      const mockCategoriesList = [mockCategory];

      mockPrisma.category.findMany.mockResolvedValue(mockCategoriesList);
      mockPrisma.category.count.mockResolvedValue(1);

      await getCategoriesList(filters, schoolId, organizationId);

      expect(mockPrisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { name: { contains: 'basketball', mode: 'insensitive' } },
              { description: { contains: 'basketball', mode: 'insensitive' } },
              { code: { contains: 'basketball', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });

    it('should filter by parent category', async () => {
      const filters = { parentId: 'parent-123' };

      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.category.count.mockResolvedValue(0);

      await getCategoriesList(filters, schoolId, organizationId);

      expect(mockPrisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            parentId: 'parent-123',
          }),
        })
      );
    });

    it('should apply pagination correctly', async () => {
      const filters = { page: 2, limit: 10 };

      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.category.count.mockResolvedValue(0);

      await getCategoriesList(filters, schoolId, organizationId);

      expect(mockPrisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10, // (page - 1) * limit
          take: 10,
        })
      );
    });

    it('should include inactive categories when requested', async () => {
      const filters = { includeInactive: true };

      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.category.count.mockResolvedValue(0);

      await getCategoriesList(filters, schoolId, organizationId);

      // Should not filter by isActive when includeInactive is true
      expect(mockPrisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            isActive: true,
          }),
        })
      );
    });
  });

  describe('Category Tree Structure', () => {
    it('should build category tree correctly', async () => {
      const parentCategory = {
        ...mockCategory,
        id: 'parent-123',
        name: 'Sports Equipment',
        code: 'SPORTS',
        parentId: null,
      };

      const childCategory = {
        ...mockCategory,
        id: 'child-123',
        name: 'Basketball Equipment',
        code: 'BB',
        parentId: 'parent-123',
      };

      mockPrisma.category.findMany.mockResolvedValue([parentCategory, childCategory]);

      const result = await getCategoryTree(schoolId, organizationId);

      expect(result).toHaveLength(1); // Only one root category
      expect(result[0].id).toBe('parent-123');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].id).toBe('child-123');
    });

    it('should handle multiple root categories', async () => {
      const rootCategory1 = {
        ...mockCategory,
        id: 'root-1',
        name: 'Sports Equipment',
        parentId: null,
      };

      const rootCategory2 = {
        ...mockCategory,
        id: 'root-2',
        name: 'Academic Equipment',
        parentId: null,
      };

      mockPrisma.category.findMany.mockResolvedValue([rootCategory1, rootCategory2]);

      const result = await getCategoryTree(schoolId, organizationId);

      expect(result).toHaveLength(2);
      expect(result.map(c => c.id)).toContain('root-1');
      expect(result.map(c => c.id)).toContain('root-2');
    });
  });

  describe('Category Statistics', () => {
    it('should get category statistics', async () => {
      const mockStats = {
        totalCategories: 10,
        activeCategories: 8,
        rootCategories: 3,
      };

      mockPrisma.category.count
        .mockResolvedValueOnce(mockStats.totalCategories)
        .mockResolvedValueOnce(mockStats.activeCategories)
        .mockResolvedValueOnce(mockStats.rootCategories);

      mockPrisma.category.findMany.mockResolvedValue([mockCategory]);
      mockPrisma.equipment.groupBy.mockResolvedValue([
        { categoryId: 'cat-1', _count: { id: 15 } },
        { categoryId: 'cat-2', _count: { id: 10 } },
      ]);

      const result = await getCategoryStats(schoolId, organizationId);

      expect(result.overview.totalCategories).toBe(10);
      expect(result.overview.activeCategories).toBe(8);
      expect(result.overview.inactiveCategories).toBe(2);
      expect(result.overview.rootCategories).toBe(3);
      expect(result.topCategories).toHaveLength(2);
    });
  });

  describe('Category Reordering', () => {
    it('should reorder categories successfully', async () => {
      const categoryOrders = [
        { id: 'cat-1', sortOrder: 1 },
        { id: 'cat-2', sortOrder: 2 },
        { id: 'cat-3', sortOrder: 3 },
      ];

      const existingCategories = categoryOrders.map(order => ({
        ...mockCategory,
        id: order.id,
      }));

      mockPrisma.category.findMany.mockResolvedValue(existingCategories);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockPrisma);
      });
      mockPrisma.category.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await reorderCategories(
        categoryOrders,
        userId,
        schoolId,
        organizationId
      );

      expect(result).toEqual({ message: 'Categories reordered successfully' });
      expect(mockPrisma.category.update).toHaveBeenCalledTimes(3);
    });

    it('should validate all categories exist', async () => {
      const categoryOrders = [
        { id: 'cat-1', sortOrder: 1 },
        { id: 'non-existent', sortOrder: 2 },
      ];

      mockPrisma.category.findMany.mockResolvedValue([
        { ...mockCategory, id: 'cat-1' },
      ]); // Only one found, expecting two

      await expect(
        reorderCategories(categoryOrders, userId, schoolId, organizationId)
      ).rejects.toThrow('Some categories not found or not accessible');
    });
  });

  describe('Validation', () => {
    it('should validate required fields', async () => {
      const invalidData = {
        name: '', // Empty name
        code: 'TEST',
      };

      await expect(
        createCategory(invalidData, userId, schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should validate field length limits', async () => {
      const invalidData = {
        name: 'A'.repeat(101), // Too long
        code: 'TEST',
      };

      await expect(
        createCategory(invalidData, userId, schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should validate sort order is non-negative', async () => {
      const invalidData = {
        ...mockCategoryData,
        sortOrder: -1,
      };

      await expect(
        createCategory(invalidData, userId, schoolId, organizationId)
      ).rejects.toThrow();
    });
  });
});