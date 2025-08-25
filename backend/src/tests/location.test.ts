import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createLocation,
  getLocationById,
  updateLocation,
  deleteLocation,
  getLocationsList,
  getLocationTree,
  getLocationStats,
  getAvailableLocations,
} from '../services/location';

// Mock Prisma client
const mockPrisma = {
  location: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  },
  equipment: {
    count: vi.fn(),
    groupBy: vi.fn(),
    findUnique: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
};

vi.mock('../index', () => ({
  prisma: mockPrisma,
}));

describe('Location Service', () => {
  const userId = 'user-123';
  const schoolId = 'school-123';
  const organizationId = 'org-123';

  const mockLocationData = {
    name: 'Main Gymnasium',
    code: 'GYM1',
    description: 'Primary basketball and volleyball facility',
    type: 'BUILDING' as const,
    address: '123 School St, Test City, TC 12345',
    capacity: 500,
    isActive: true,
    coordinates: {
      latitude: 40.7128,
      longitude: -74.0060,
    },
    contactInfo: {
      phone: '555-123-4567',
      email: 'gym@school.edu',
      manager: 'John Smith',
    },
    operatingHours: {
      monday: {
        open: '06:00',
        close: '22:00',
        closed: false,
      },
      saturday: {
        closed: true,
      },
    },
  };

  const mockLocation = {
    id: 'location-123',
    ...mockLocationData,
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
      equipment: 25,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Location Creation', () => {
    it('should create location successfully', async () => {
      mockPrisma.location.findFirst.mockResolvedValue(null); // No existing location with same code
      mockPrisma.location.create.mockResolvedValue(mockLocation);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await createLocation(
        mockLocationData,
        userId,
        schoolId,
        organizationId
      );

      expect(result).toHaveProperty('id');
      expect(result.name).toBe(mockLocationData.name);
      expect(result.code).toBe(mockLocationData.code);
      expect(result.type).toBe(mockLocationData.type);
      expect(mockPrisma.location.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('should throw error if location code already exists', async () => {
      mockPrisma.location.findFirst.mockResolvedValue(mockLocation);

      await expect(
        createLocation(mockLocationData, userId, schoolId, organizationId)
      ).rejects.toThrow('Location code already exists');
    });

    it('should validate location code format', async () => {
      const invalidData = {
        ...mockLocationData,
        code: 'invalid-code', // Contains lowercase and hyphen
      };

      await expect(
        createLocation(invalidData, userId, schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should validate location type enum', async () => {
      const invalidData = {
        ...mockLocationData,
        type: 'INVALID_TYPE' as any,
      };

      await expect(
        createLocation(invalidData, userId, schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should validate coordinates range', async () => {
      const invalidData = {
        ...mockLocationData,
        coordinates: {
          latitude: 100, // Invalid: > 90
          longitude: -200, // Invalid: < -180
        },
      };

      await expect(
        createLocation(invalidData, userId, schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should validate operating hours format', async () => {
      const invalidData = {
        ...mockLocationData,
        operatingHours: {
          monday: {
            open: '25:00', // Invalid hour format
            close: '22:00',
          },
        },
      };

      await expect(
        createLocation(invalidData, userId, schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should handle parent location validation', async () => {
      const parentId = 'parent-123';
      const dataWithParent = {
        ...mockLocationData,
        parentId,
      };

      mockPrisma.location.findFirst
        .mockResolvedValueOnce(null) // No existing location with same code
        .mockResolvedValueOnce(mockLocation); // Parent location exists
      mockPrisma.location.create.mockResolvedValue({
        ...mockLocation,
        parentId,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await createLocation(
        dataWithParent,
        userId,
        schoolId,
        organizationId
      );

      expect(result.parentId).toBe(parentId);
      expect(mockPrisma.location.findFirst).toHaveBeenCalledTimes(2);
    });

    it('should throw error if parent location not found', async () => {
      const dataWithParent = {
        ...mockLocationData,
        parentId: 'non-existent-parent',
      };

      mockPrisma.location.findFirst
        .mockResolvedValueOnce(null) // No existing location with same code
        .mockResolvedValueOnce(null); // Parent location not found

      await expect(
        createLocation(dataWithParent, userId, schoolId, organizationId)
      ).rejects.toThrow('Parent location not found or not accessible');
    });
  });

  describe('Location Retrieval', () => {
    it('should get location by ID successfully', async () => {
      const locationWithChildren = {
        ...mockLocation,
        children: [
          {
            id: 'child-1',
            name: 'Storage Room A',
            code: 'STORA',
            type: 'STORAGE',
            isActive: true,
          },
        ],
        _count: {
          equipment: 25,
          children: 1,
        },
      };

      mockPrisma.location.findFirst.mockResolvedValue(locationWithChildren);

      const result = await getLocationById('location-123', schoolId, organizationId);

      expect(result).toEqual(locationWithChildren);
      expect(result.children).toHaveLength(1);
      expect(mockPrisma.location.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'location-123',
          OR: [
            { schoolId },
            { organizationId, schoolId: null },
          ],
        },
        include: expect.any(Object),
      });
    });

    it('should throw error if location not found', async () => {
      mockPrisma.location.findFirst.mockResolvedValue(null);

      await expect(
        getLocationById('non-existent-id', schoolId, organizationId)
      ).rejects.toThrow('Location not found');
    });
  });

  describe('Location Update', () => {
    it('should update location successfully', async () => {
      const updateData = {
        name: 'Updated Main Gymnasium',
        capacity: 600,
        contactInfo: {
          phone: '555-987-6543',
          manager: 'Jane Doe',
        },
      };

      const updatedLocation = {
        ...mockLocation,
        ...updateData,
        updatedBy: mockLocation.createdBy,
      };

      mockPrisma.location.findFirst.mockResolvedValue(mockLocation);
      mockPrisma.location.update.mockResolvedValue(updatedLocation);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await updateLocation(
        'location-123',
        updateData,
        userId,
        schoolId,
        organizationId
      );

      expect(result.name).toBe(updateData.name);
      expect(result.capacity).toBe(updateData.capacity);
      expect(mockPrisma.location.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('should validate code uniqueness when updating', async () => {
      const updateData = {
        code: 'NEW_CODE',
      };

      mockPrisma.location.findFirst
        .mockResolvedValueOnce(mockLocation) // Existing location
        .mockResolvedValueOnce({ id: 'other-location', code: 'NEW_CODE' }); // Code already exists

      await expect(
        updateLocation('location-123', updateData, userId, schoolId, organizationId)
      ).rejects.toThrow('Location code already exists');
    });

    it('should handle nested object updates', async () => {
      const updateData = {
        coordinates: {
          latitude: 41.8781,
          longitude: -87.6298,
        },
        operatingHours: {
          sunday: {
            open: '08:00',
            close: '20:00',
            closed: false,
          },
        },
      };

      mockPrisma.location.findFirst.mockResolvedValue(mockLocation);
      mockPrisma.location.update.mockResolvedValue({
        ...mockLocation,
        ...updateData,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      await updateLocation(
        'location-123',
        updateData,
        userId,
        schoolId,
        organizationId
      );

      expect(mockPrisma.location.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            coordinates: updateData.coordinates,
            operatingHours: updateData.operatingHours,
          }),
        })
      );
    });
  });

  describe('Location Deletion', () => {
    it('should delete location successfully', async () => {
      mockPrisma.location.findFirst.mockResolvedValue(mockLocation);
      mockPrisma.equipment.count.mockResolvedValue(0); // No equipment
      mockPrisma.location.count.mockResolvedValue(0); // No children
      mockPrisma.location.update.mockResolvedValue({
        ...mockLocation,
        isActive: false,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await deleteLocation(
        'location-123',
        userId,
        schoolId,
        organizationId
      );

      expect(result).toEqual({ message: 'Location deleted successfully' });
      expect(mockPrisma.location.update).toHaveBeenCalledWith({
        where: { id: 'location-123' },
        data: {
          isActive: false,
          updatedById: userId,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should prevent deletion if location has equipment', async () => {
      mockPrisma.location.findFirst.mockResolvedValue(mockLocation);
      mockPrisma.equipment.count.mockResolvedValue(10); // Has equipment

      await expect(
        deleteLocation('location-123', userId, schoolId, organizationId)
      ).rejects.toThrow('Cannot delete location with existing equipment');
    });

    it('should prevent deletion if location has children', async () => {
      mockPrisma.location.findFirst.mockResolvedValue(mockLocation);
      mockPrisma.equipment.count.mockResolvedValue(0);
      mockPrisma.location.count.mockResolvedValue(3); // Has children

      await expect(
        deleteLocation('location-123', userId, schoolId, organizationId)
      ).rejects.toThrow('Cannot delete location with child locations');
    });
  });

  describe('Location Listing and Filtering', () => {
    it('should get locations list with default filters', async () => {
      const mockLocationsList = [mockLocation];
      const totalCount = 1;

      mockPrisma.location.findMany.mockResolvedValue(mockLocationsList);
      mockPrisma.location.count.mockResolvedValue(totalCount);

      const result = await getLocationsList({}, schoolId, organizationId);

      expect(result.locations).toEqual(mockLocationsList);
      expect(result.pagination.total).toBe(totalCount);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(50);
    });

    it('should filter by location type', async () => {
      const filters = { type: 'BUILDING' as const };

      mockPrisma.location.findMany.mockResolvedValue([]);
      mockPrisma.location.count.mockResolvedValue(0);

      await getLocationsList(filters, schoolId, organizationId);

      expect(mockPrisma.location.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'BUILDING',
          }),
        })
      );
    });

    it('should filter by search term', async () => {
      const filters = { search: 'gymnasium' };

      mockPrisma.location.findMany.mockResolvedValue([]);
      mockPrisma.location.count.mockResolvedValue(0);

      await getLocationsList(filters, schoolId, organizationId);

      expect(mockPrisma.location.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { name: { contains: 'gymnasium', mode: 'insensitive' } },
              { description: { contains: 'gymnasium', mode: 'insensitive' } },
              { code: { contains: 'gymnasium', mode: 'insensitive' } },
              { address: { contains: 'gymnasium', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });

    it('should filter by capacity requirement', async () => {
      const filters = { hasCapacity: true };

      mockPrisma.location.findMany.mockResolvedValue([]);
      mockPrisma.location.count.mockResolvedValue(0);

      await getLocationsList(filters, schoolId, organizationId);

      expect(mockPrisma.location.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            capacity: { not: null },
          }),
        })
      );
    });

    it('should sort by different fields', async () => {
      const filters = { sortBy: 'type' as const, sortOrder: 'desc' as const };

      mockPrisma.location.findMany.mockResolvedValue([]);
      mockPrisma.location.count.mockResolvedValue(0);

      await getLocationsList(filters, schoolId, organizationId);

      expect(mockPrisma.location.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: {
            type: 'desc',
          },
        })
      );
    });
  });

  describe('Location Tree Structure', () => {
    it('should build location tree correctly', async () => {
      const buildingLocation = {
        ...mockLocation,
        id: 'building-123',
        name: 'Main Building',
        type: 'BUILDING',
        parentId: null,
      };

      const roomLocation = {
        ...mockLocation,
        id: 'room-123',
        name: 'Room 101',
        type: 'ROOM',
        parentId: 'building-123',
      };

      mockPrisma.location.findMany.mockResolvedValue([buildingLocation, roomLocation]);

      const result = await getLocationTree(schoolId, organizationId);

      expect(result).toHaveLength(1); // Only one root location
      expect(result[0].id).toBe('building-123');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].id).toBe('room-123');
    });

    it('should handle complex hierarchies', async () => {
      const building = {
        ...mockLocation,
        id: 'building-1',
        name: 'Academic Building',
        type: 'BUILDING',
        parentId: null,
      };

      const floor = {
        ...mockLocation,
        id: 'floor-1',
        name: 'First Floor',
        type: 'ROOM',
        parentId: 'building-1',
      };

      const room = {
        ...mockLocation,
        id: 'room-1',
        name: 'Classroom 101',
        type: 'ROOM',
        parentId: 'floor-1',
      };

      mockPrisma.location.findMany.mockResolvedValue([building, floor, room]);

      const result = await getLocationTree(schoolId, organizationId);

      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].children).toHaveLength(1);
    });
  });

  describe('Location Statistics', () => {
    it('should get location statistics', async () => {
      const mockStats = {
        totalLocations: 15,
        activeLocations: 12,
      };

      mockPrisma.location.count
        .mockResolvedValueOnce(mockStats.totalLocations)
        .mockResolvedValueOnce(mockStats.activeLocations);

      mockPrisma.location.groupBy.mockResolvedValue([
        { type: 'BUILDING', _count: { id: 3 } },
        { type: 'ROOM', _count: { id: 8 } },
        { type: 'STORAGE', _count: { id: 1 } },
      ]);

      mockPrisma.location.findMany.mockResolvedValue([mockLocation]);
      mockPrisma.location.aggregate.mockResolvedValue({
        _sum: { capacity: 2500 },
        _avg: { capacity: 416.67 },
        _count: { capacity: 6 },
      });

      mockPrisma.equipment.groupBy.mockResolvedValue([
        { locationId: 'loc-1', _count: { id: 25 } },
        { locationId: 'loc-2', _count: { id: 15 } },
      ]);

      const result = await getLocationStats(schoolId, organizationId);

      expect(result.overview.totalLocations).toBe(15);
      expect(result.overview.activeLocations).toBe(12);
      expect(result.overview.inactiveLocations).toBe(3);
      expect(result.overview.totalCapacity).toBe(2500);
      expect(result.locationsByType).toHaveLength(3);
      expect(result.topLocations).toHaveLength(2);
    });
  });

  describe('Available Locations', () => {
    it('should get available locations for equipment placement', async () => {
      const mockAvailableLocations = [
        {
          ...mockLocation,
          capacity: 100,
          _count: { equipment: 25 },
        },
        {
          ...mockLocation,
          id: 'location-456',
          capacity: 50,
          _count: { equipment: 45 },
        },
      ];

      mockPrisma.location.findMany.mockResolvedValue(mockAvailableLocations);

      const result = await getAvailableLocations(
        'equipment-123',
        schoolId,
        organizationId
      );

      expect(result).toHaveLength(2);
      expect(result[0].currentOccupancy).toBe(25);
      expect(result[0].availableSpace).toBe(75);
      expect(result[0].isAtCapacity).toBe(false);
      expect(result[1].currentOccupancy).toBe(45);
      expect(result[1].availableSpace).toBe(5);
      expect(result[1].isAtCapacity).toBe(false);
    });

    it('should handle locations without capacity', async () => {
      const mockAvailableLocations = [
        {
          ...mockLocation,
          capacity: null,
          _count: { equipment: 10 },
        },
      ];

      mockPrisma.location.findMany.mockResolvedValue(mockAvailableLocations);

      const result = await getAvailableLocations(undefined, schoolId, organizationId);

      expect(result[0].availableSpace).toBeNull();
      expect(result[0].isAtCapacity).toBe(false);
    });

    it('should exclude current equipment from capacity calculation', async () => {
      const equipmentId = 'equipment-123';

      mockPrisma.equipment.findUnique.mockResolvedValue({
        id: equipmentId,
        locationId: 'location-123',
      });

      mockPrisma.location.findMany.mockResolvedValue([
        {
          ...mockLocation,
          capacity: 100,
          _count: { equipment: 24 }, // One less because current equipment excluded
        },
      ]);

      const result = await getAvailableLocations(equipmentId, schoolId, organizationId);

      expect(mockPrisma.location.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            _count: {
              select: {
                equipment: {
                  where: {
                    isDeleted: false,
                    id: { not: equipmentId },
                  },
                },
              },
            },
          },
        })
      );
    });

    it('should identify locations at capacity', async () => {
      const mockAvailableLocations = [
        {
          ...mockLocation,
          capacity: 50,
          _count: { equipment: 50 }, // At capacity
        },
        {
          ...mockLocation,
          id: 'location-456',
          capacity: 30,
          _count: { equipment: 35 }, // Over capacity
        },
      ];

      mockPrisma.location.findMany.mockResolvedValue(mockAvailableLocations);

      const result = await getAvailableLocations(undefined, schoolId, organizationId);

      expect(result[0].isAtCapacity).toBe(true);
      expect(result[0].availableSpace).toBe(0);
      expect(result[1].isAtCapacity).toBe(true);
      expect(result[1].availableSpace).toBe(-5);
    });
  });

  describe('Validation', () => {
    it('should validate required fields', async () => {
      const invalidData = {
        name: '', // Empty name
        code: 'TEST',
        type: 'ROOM' as const,
      };

      await expect(
        createLocation(invalidData, userId, schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should validate capacity is positive', async () => {
      const invalidData = {
        ...mockLocationData,
        capacity: -10,
      };

      await expect(
        createLocation(invalidData, userId, schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should validate email format in contact info', async () => {
      const invalidData = {
        ...mockLocationData,
        contactInfo: {
          email: 'invalid-email',
        },
      };

      await expect(
        createLocation(invalidData, userId, schoolId, organizationId)
      ).rejects.toThrow();
    });

    it('should validate time format in operating hours', async () => {
      const invalidData = {
        ...mockLocationData,
        operatingHours: {
          monday: {
            open: '9:00', // Should be HH:MM format
            close: '17:00',
          },
        },
      };

      await expect(
        createLocation(invalidData, userId, schoolId, organizationId)
      ).rejects.toThrow();
    });
  });
});