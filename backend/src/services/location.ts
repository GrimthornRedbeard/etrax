import { prisma } from '@/index';
import { ApiError } from '@/middleware/errorHandler';
import { z } from 'zod';
import { logger } from '@/utils/logger';

// Validation schemas
export const createLocationSchema = z.object({
  name: z.string().min(1, 'Location name is required').max(100, 'Location name too long'),
  code: z.string().min(1, 'Location code is required').max(10, 'Location code too long')
    .regex(/^[A-Z0-9_]+$/, 'Location code must contain only uppercase letters, numbers, and underscores'),
  description: z.string().optional(),
  type: z.enum(['BUILDING', 'ROOM', 'STORAGE', 'OUTDOOR', 'VEHICLE', 'OTHER']).default('ROOM'),
  address: z.string().optional(),
  floor: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  isActive: z.boolean().default(true),
  parentId: z.string().uuid('Invalid parent location ID').optional(),
  coordinates: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }).optional(),
  contactInfo: z.object({
    phone: z.string().optional(),
    email: z.string().email().optional(),
    manager: z.string().optional(),
  }).optional(),
  operatingHours: z.object({
    monday: z.object({
      open: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      close: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      closed: z.boolean().default(false),
    }).optional(),
    tuesday: z.object({
      open: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      close: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      closed: z.boolean().default(false),
    }).optional(),
    wednesday: z.object({
      open: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      close: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      closed: z.boolean().default(false),
    }).optional(),
    thursday: z.object({
      open: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      close: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      closed: z.boolean().default(false),
    }).optional(),
    friday: z.object({
      open: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      close: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      closed: z.boolean().default(false),
    }).optional(),
    saturday: z.object({
      open: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      close: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      closed: z.boolean().default(false),
    }).optional(),
    sunday: z.object({
      open: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      close: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      closed: z.boolean().default(false),
    }).optional(),
  }).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const updateLocationSchema = createLocationSchema.partial();

export const locationFilterSchema = z.object({
  search: z.string().optional(),
  type: z.enum(['BUILDING', 'ROOM', 'STORAGE', 'OUTDOOR', 'VEHICLE', 'OTHER']).optional(),
  isActive: z.boolean().optional(),
  parentId: z.string().uuid().optional(),
  includeInactive: z.boolean().default(false),
  hasCapacity: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(50),
  sortBy: z.enum(['name', 'code', 'createdAt', 'type']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// Create location
export const createLocation = async (
  data: z.infer<typeof createLocationSchema>,
  userId: string,
  schoolId?: string,
  organizationId?: string
) => {
  const validatedData = createLocationSchema.parse(data);

  // Check if location code already exists in the same scope
  const existingLocation = await prisma.location.findFirst({
    where: {
      code: validatedData.code,
      OR: [
        { schoolId },
        { organizationId, schoolId: null },
      ],
    },
  });

  if (existingLocation) {
    throw new ApiError('Location code already exists', 409);
  }

  // If parentId is provided, verify parent location exists and is accessible
  if (validatedData.parentId) {
    const parentLocation = await prisma.location.findFirst({
      where: {
        id: validatedData.parentId,
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    });

    if (!parentLocation) {
      throw new ApiError('Parent location not found or not accessible', 404);
    }

    // Prevent creating circular references
    if (await hasCircularReference(validatedData.parentId, validatedData.parentId)) {
      throw new ApiError('Cannot create circular location reference', 400);
    }
  }

  // Create location
  const location = await prisma.location.create({
    data: {
      ...validatedData,
      schoolId,
      organizationId,
      createdById: userId,
      updatedById: userId,
      coordinates: validatedData.coordinates || {},
      contactInfo: validatedData.contactInfo || {},
      operatingHours: validatedData.operatingHours || {},
      metadata: validatedData.metadata || {},
    },
    include: {
      parent: true,
      children: true,
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      _count: {
        select: {
          equipment: true,
        },
      },
    },
  });

  // Log location creation
  await prisma.auditLog.create({
    data: {
      action: 'CREATE_LOCATION',
      entityType: 'Location',
      entityId: location.id,
      changes: {
        created: {
          name: location.name,
          code: location.code,
          type: location.type,
          parentId: location.parentId,
        },
      },
      userId,
      schoolId,
      organizationId,
    },
  });

  logger.info('Location created successfully', {
    locationId: location.id,
    locationCode: location.code,
    userId,
    schoolId,
  });

  return location;
};

// Get location by ID
export const getLocationById = async (
  locationId: string,
  schoolId?: string,
  organizationId?: string
) => {
  const location = await prisma.location.findFirst({
    where: {
      id: locationId,
      OR: [
        { schoolId },
        { organizationId, schoolId: null },
      ],
    },
    include: {
      parent: true,
      children: {
        where: {
          isActive: true,
        },
        orderBy: {
          name: 'asc',
        },
      },
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      updatedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      _count: {
        select: {
          equipment: true,
          children: true,
        },
      },
    },
  });

  if (!location) {
    throw new ApiError('Location not found', 404);
  }

  return location;
};

// Update location
export const updateLocation = async (
  locationId: string,
  data: z.infer<typeof updateLocationSchema>,
  userId: string,
  schoolId?: string,
  organizationId?: string
) => {
  const validatedData = updateLocationSchema.parse(data);

  // Check if location exists and user has access
  const existingLocation = await getLocationById(locationId, schoolId, organizationId);

  // If code is being updated, check for uniqueness
  if (validatedData.code && validatedData.code !== existingLocation.code) {
    const codeExists = await prisma.location.findFirst({
      where: {
        code: validatedData.code,
        id: { not: locationId },
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    });

    if (codeExists) {
      throw new ApiError('Location code already exists', 409);
    }
  }

  // If parentId is being updated, verify it exists and doesn't create circular reference
  if (validatedData.parentId !== undefined) {
    if (validatedData.parentId) {
      const parentLocation = await prisma.location.findFirst({
        where: {
          id: validatedData.parentId,
          OR: [
            { schoolId },
            { organizationId, schoolId: null },
          ],
        },
      });

      if (!parentLocation) {
        throw new ApiError('Parent location not found or not accessible', 404);
      }

      // Check for circular reference
      if (await hasCircularReference(locationId, validatedData.parentId)) {
        throw new ApiError('Cannot create circular location reference', 400);
      }
    }
  }

  // Track changes for audit log
  const changes: Record<string, any> = {};
  Object.keys(validatedData).forEach(key => {
    const oldValue = (existingLocation as any)[key];
    const newValue = (validatedData as any)[key];
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes[key] = { from: oldValue, to: newValue };
    }
  });

  // Update location
  const updatedLocation = await prisma.location.update({
    where: { id: locationId },
    data: {
      ...validatedData,
      updatedById: userId,
      updatedAt: new Date(),
    },
    include: {
      parent: true,
      children: {
        where: {
          isActive: true,
        },
        orderBy: {
          name: 'asc',
        },
      },
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      updatedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      _count: {
        select: {
          equipment: true,
          children: true,
        },
      },
    },
  });

  // Log location update if there were changes
  if (Object.keys(changes).length > 0) {
    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_LOCATION',
        entityType: 'Location',
        entityId: locationId,
        changes,
        userId,
        schoolId,
        organizationId,
      },
    });

    logger.info('Location updated successfully', {
      locationId,
      changes: Object.keys(changes),
      userId,
      schoolId,
    });
  }

  return updatedLocation;
};

// Delete location
export const deleteLocation = async (
  locationId: string,
  userId: string,
  schoolId?: string,
  organizationId?: string
) => {
  // Check if location exists and user has access
  const location = await getLocationById(locationId, schoolId, organizationId);

  // Check if location has any equipment
  const equipmentCount = await prisma.equipment.count({
    where: {
      locationId,
      isDeleted: false,
    },
  });

  if (equipmentCount > 0) {
    throw new ApiError('Cannot delete location with existing equipment. Please move or delete equipment first.', 400);
  }

  // Check if location has any children
  const childrenCount = await prisma.location.count({
    where: {
      parentId: locationId,
      isActive: true,
    },
  });

  if (childrenCount > 0) {
    throw new ApiError('Cannot delete location with child locations. Please move or delete child locations first.', 400);
  }

  // Soft delete the location
  const deletedLocation = await prisma.location.update({
    where: { id: locationId },
    data: {
      isActive: false,
      updatedById: userId,
      updatedAt: new Date(),
    },
  });

  // Log location deletion
  await prisma.auditLog.create({
    data: {
      action: 'DELETE_LOCATION',
      entityType: 'Location',
      entityId: locationId,
      changes: {
        deleted: {
          name: location.name,
          code: location.code,
          type: location.type,
          reason: 'User deleted',
        },
      },
      userId,
      schoolId,
      organizationId,
    },
  });

  logger.info('Location deleted successfully', {
    locationId,
    locationCode: location.code,
    userId,
    schoolId,
  });

  return { message: 'Location deleted successfully' };
};

// Get locations list with filtering and pagination
export const getLocationsList = async (
  filters: z.infer<typeof locationFilterSchema>,
  schoolId?: string,
  organizationId?: string
) => {
  const validatedFilters = locationFilterSchema.parse(filters);

  // Build where clause
  const where: any = {
    OR: [
      { schoolId },
      { organizationId, schoolId: null },
    ],
  };

  if (!validatedFilters.includeInactive) {
    where.isActive = true;
  }

  if (validatedFilters.isActive !== undefined) {
    where.isActive = validatedFilters.isActive;
  }

  if (validatedFilters.type) {
    where.type = validatedFilters.type;
  }

  if (validatedFilters.search) {
    where.OR = [
      { name: { contains: validatedFilters.search, mode: 'insensitive' } },
      { description: { contains: validatedFilters.search, mode: 'insensitive' } },
      { code: { contains: validatedFilters.search, mode: 'insensitive' } },
      { address: { contains: validatedFilters.search, mode: 'insensitive' } },
    ];
  }

  if (validatedFilters.parentId !== undefined) {
    where.parentId = validatedFilters.parentId;
  }

  if (validatedFilters.hasCapacity) {
    where.capacity = { not: null };
  }

  // Calculate pagination
  const skip = (validatedFilters.page - 1) * validatedFilters.limit;

  // Build order by
  const orderBy: any = {};
  orderBy[validatedFilters.sortBy] = validatedFilters.sortOrder;

  // Execute query
  const [locations, total] = await Promise.all([
    prisma.location.findMany({
      where,
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            code: true,
            type: true,
          },
        },
        children: {
          where: {
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            code: true,
            type: true,
          },
          orderBy: {
            name: 'asc',
          },
        },
        _count: {
          select: {
            equipment: true,
            children: true,
          },
        },
      },
      orderBy,
      skip,
      take: validatedFilters.limit,
    }),
    prisma.location.count({ where }),
  ]);

  const totalPages = Math.ceil(total / validatedFilters.limit);

  return {
    locations,
    pagination: {
      page: validatedFilters.page,
      limit: validatedFilters.limit,
      total,
      totalPages,
      hasNext: validatedFilters.page < totalPages,
      hasPrev: validatedFilters.page > 1,
    },
    filters: validatedFilters,
  };
};

// Get location tree structure
export const getLocationTree = async (
  schoolId?: string,
  organizationId?: string
) => {
  const locations = await prisma.location.findMany({
    where: {
      isActive: true,
      OR: [
        { schoolId },
        { organizationId, schoolId: null },
      ],
    },
    include: {
      _count: {
        select: {
          equipment: true,
        },
      },
    },
    orderBy: [
      { name: 'asc' },
    ],
  });

  // Build tree structure
  const locationMap = new Map();
  const rootLocations: any[] = [];

  // First pass: create map of all locations
  locations.forEach(location => {
    locationMap.set(location.id, {
      ...location,
      children: [],
    });
  });

  // Second pass: build tree structure
  locations.forEach(location => {
    const locationNode = locationMap.get(location.id);
    
    if (location.parentId && locationMap.has(location.parentId)) {
      const parent = locationMap.get(location.parentId);
      parent.children.push(locationNode);
    } else {
      rootLocations.push(locationNode);
    }
  });

  return rootLocations;
};

// Get location statistics
export const getLocationStats = async (
  schoolId?: string,
  organizationId?: string
) => {
  const [
    totalLocations,
    activeLocations,
    locationsByType,
    equipmentByLocation,
    capacityStats,
    topLocations,
  ] = await Promise.all([
    // Total locations count
    prisma.location.count({
      where: {
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    }),
    // Active locations count
    prisma.location.count({
      where: {
        isActive: true,
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
    }),
    // Locations by type
    prisma.location.groupBy({
      by: ['type'],
      where: {
        isActive: true,
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
      _count: {
        id: true,
      },
    }),
    // Equipment count by location
    prisma.location.findMany({
      where: {
        isActive: true,
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
      include: {
        _count: {
          select: {
            equipment: {
              where: {
                isDeleted: false,
              },
            },
          },
        },
      },
      orderBy: {
        equipment: {
          _count: 'desc',
        },
      },
      take: 10,
    }),
    // Capacity statistics
    prisma.location.aggregate({
      where: {
        isActive: true,
        capacity: { not: null },
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
      _sum: {
        capacity: true,
      },
      _avg: {
        capacity: true,
      },
      _count: {
        capacity: true,
      },
    }),
    // Top locations by equipment count
    prisma.equipment.groupBy({
      by: ['locationId'],
      where: {
        isDeleted: false,
        OR: [
          { schoolId },
          { organizationId, schoolId: null },
        ],
      },
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: 5,
    }),
  ]);

  return {
    overview: {
      totalLocations,
      activeLocations,
      inactiveLocations: totalLocations - activeLocations,
      locationsWithCapacity: capacityStats._count.capacity,
      totalCapacity: capacityStats._sum.capacity || 0,
      averageCapacity: Math.round(capacityStats._avg.capacity || 0),
    },
    locationsByType: locationsByType.map(type => ({
      type: type.type,
      count: type._count.id,
    })),
    equipmentDistribution: equipmentByLocation.map(location => ({
      locationId: location.id,
      locationName: location.name,
      locationCode: location.code,
      locationType: location.type,
      equipmentCount: location._count.equipment,
    })),
    topLocations: topLocations.map(stat => ({
      locationId: stat.locationId,
      equipmentCount: stat._count.id,
    })),
  };
};

// Get available locations for equipment placement
export const getAvailableLocations = async (
  equipmentId?: string,
  schoolId?: string,
  organizationId?: string
) => {
  const where: any = {
    isActive: true,
    OR: [
      { schoolId },
      { organizationId, schoolId: null },
    ],
  };

  // If equipmentId is provided, exclude its current location from capacity calculation
  let currentLocation = null;
  if (equipmentId) {
    const equipment = await prisma.equipment.findUnique({
      where: { id: equipmentId },
      select: { locationId: true },
    });
    currentLocation = equipment?.locationId;
  }

  const locations = await prisma.location.findMany({
    where,
    include: {
      _count: {
        select: {
          equipment: {
            where: {
              isDeleted: false,
              ...(currentLocation ? { id: { not: equipmentId } } : {}),
            },
          },
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  });

  // Calculate availability based on capacity
  return locations.map(location => ({
    ...location,
    currentOccupancy: location._count.equipment,
    availableSpace: location.capacity ? location.capacity - location._count.equipment : null,
    isAtCapacity: location.capacity ? location._count.equipment >= location.capacity : false,
  }));
};

// Helper function to check for circular references
const hasCircularReference = async (locationId: string, potentialParentId: string): Promise<boolean> => {
  if (locationId === potentialParentId) {
    return true;
  }

  const parent = await prisma.location.findUnique({
    where: { id: potentialParentId },
    select: { parentId: true },
  });

  if (!parent || !parent.parentId) {
    return false;
  }

  return hasCircularReference(locationId, parent.parentId);
};