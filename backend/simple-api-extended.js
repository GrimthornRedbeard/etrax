require('dotenv').config();
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const cors = require('cors');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Simple demo authentication - just check for Bearer token
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  // For demo purposes, accept any Bearer token
  req.user = {
    id: 'demo-user-id',
    email: 'demo@etrax.com',
    role: 'ADMIN',
    schoolId: null, // Will find the default school
    organizationId: null // Will find the default organization
  };
  
  next();
};

// Helper function to format equipment for frontend
const formatEquipmentForFrontend = (equipment) => {
  return {
    id: equipment.id,
    name: equipment.name,
    category: equipment.category?.name || "General Equipment",
    serialNumber: equipment.serialNumber,
    qrCode: equipment.qrCode,
    status: equipment.assignedTo ? "CHECKED_OUT" : mapEquipmentStatus(equipment.status),
    location: equipment.location?.name || "Unknown",
    condition: equipment.condition,
    checkedOutTo: equipment.assignedTo,
    checkedOutDate: equipment.assignedDate,
    dueDate: equipment.dueDate,
    notes: equipment.notes || "",
    cost: equipment.purchasePrice?.toString() || "0",
    purchaseDate: equipment.purchaseDate ? equipment.purchaseDate.toISOString().split('T')[0] : null,
  };
};

// Helper function to map database status to frontend status
const mapEquipmentStatus = (dbStatus) => {
  switch(dbStatus) {
    case 'AVAILABLE': return 'AVAILABLE';
    case 'IN_USE': return 'CHECKED_OUT';
    case 'MAINTENANCE': return 'MAINTENANCE';
    case 'RETIRED': return 'MAINTENANCE';
    case 'LOST': return 'MAINTENANCE';
    case 'DAMAGED': return 'MAINTENANCE';
    default: return 'AVAILABLE';
  }
};

// Auth endpoint
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  // Simple demo login
  if (email === 'demo@etrax.com' && password === 'demo123') {
    res.json({
      accessToken: `demo-token-${email}`,
      user: {
        id: 'demo-user-id',
        email: email,
        firstName: 'Demo',
        lastName: 'User',
        role: 'ADMIN'
      }
    });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Equipment endpoints
app.get('/api/equipment', authMiddleware, async (req, res) => {
  try {
    const equipment = await prisma.equipment.findMany({
      where: {
        isDeleted: false,
      },
      include: {
        category: {
          select: { name: true }
        },
        location: {
          select: { name: true }
        }
      },
      orderBy: { name: 'asc' },
    });

    const formattedEquipment = equipment.map(formatEquipmentForFrontend);

    res.json({
      equipment: formattedEquipment,
      total: formattedEquipment.length,
      page: 1,
      totalPages: 1
    });
  } catch (error) {
    console.error('Equipment fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch equipment' });
  }
});

app.post('/api/equipment', authMiddleware, async (req, res) => {
  try {
    const {
      name,
      category: categoryName,
      serialNumber,
      qrCode,
      location: locationName,
      condition,
      notes,
      cost,
      purchaseDate
    } = req.body;

    // Find or create category
    let category = await prisma.category.findFirst({
      where: { name: categoryName }
    });
    if (!category) {
      category = await prisma.category.create({
        data: {
          name: categoryName,
          code: categoryName.toUpperCase().replace(/\s+/g, '_'),
          description: `Auto-created category: ${categoryName}`,
          isActive: true
        }
      });
    }

    // Find or create location
    let location = await prisma.location.findFirst({
      where: { name: locationName }
    });
    if (!location) {
      location = await prisma.location.create({
        data: {
          name: locationName,
          code: locationName.toUpperCase().replace(/\s+/g, '_'),
          type: 'STORAGE',
          isActive: true
        }
      });
    }

    // Get default school and organization
    const defaultOrg = await prisma.organization.findFirst({
      where: { name: 'Default Organization' }
    });
    
    const defaultSchool = await prisma.school.findFirst({
      where: { organizationId: defaultOrg?.id }
    });

    const equipment = await prisma.equipment.create({
      data: {
        name,
        serialNumber,
        qrCode,
        condition: condition || 'GOOD',
        notes: notes || '',
        purchasePrice: cost ? parseFloat(cost) : null,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        status: 'AVAILABLE',
        categoryId: category.id,
        locationId: location.id,
        schoolId: defaultSchool?.id,
        organizationId: defaultOrg?.id,
        isDeleted: false
      },
      include: {
        category: { select: { name: true } },
        location: { select: { name: true } }
      }
    });

    res.status(201).json({
      message: 'Equipment created successfully',
      equipment: formatEquipmentForFrontend(equipment)
    });
  } catch (error) {
    console.error('Equipment creation error:', error);
    res.status(500).json({ error: 'Failed to create equipment' });
  }
});

app.put('/api/equipment/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      category: categoryName,
      serialNumber,
      qrCode,
      location: locationName,
      condition,
      notes,
      cost,
      purchaseDate
    } = req.body;

    // Find or create category
    let category = await prisma.category.findFirst({
      where: { name: categoryName }
    });
    if (!category) {
      category = await prisma.category.create({
        data: {
          name: categoryName,
          code: categoryName.toUpperCase().replace(/\s+/g, '_'),
          description: `Auto-created category: ${categoryName}`,
          isActive: true
        }
      });
    }

    // Find or create location
    let location = await prisma.location.findFirst({
      where: { name: locationName }
    });
    if (!location) {
      location = await prisma.location.create({
        data: {
          name: locationName,
          code: locationName.toUpperCase().replace(/\s+/g, '_'),
          type: 'STORAGE',
          isActive: true
        }
      });
    }

    const equipment = await prisma.equipment.update({
      where: { id },
      data: {
        name,
        serialNumber,
        qrCode,
        condition: condition || 'GOOD',
        notes: notes || '',
        purchasePrice: cost ? parseFloat(cost) : null,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        categoryId: category.id,
        locationId: location.id
      },
      include: {
        category: { select: { name: true } },
        location: { select: { name: true } }
      }
    });

    res.json({
      message: 'Equipment updated successfully',
      equipment: formatEquipmentForFrontend(equipment)
    });
  } catch (error) {
    console.error('Equipment update error:', error);
    res.status(500).json({ error: 'Failed to update equipment' });
  }
});

app.post('/api/equipment/:id/checkout', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { userName, dueDate, notes } = req.body;

    const equipment = await prisma.equipment.update({
      where: { id },
      data: {
        status: 'IN_USE',
        assignedTo: userName,
        assignedDate: new Date(),
        dueDate: dueDate ? new Date(dueDate) : null,
        notes: notes || equipment.notes
      },
      include: {
        category: { select: { name: true } },
        location: { select: { name: true } }
      }
    });

    // Create transaction record
    await prisma.transaction.create({
      data: {
        type: 'CHECK_OUT',
        equipmentId: id,
        metadata: {
          assignedTo: userName,
          dueDate: dueDate || null,
          notes: notes || null
        }
      }
    });

    res.json({
      message: 'Equipment checked out successfully',
      equipment: formatEquipmentForFrontend(equipment)
    });
  } catch (error) {
    console.error('Equipment checkout error:', error);
    res.status(500).json({ error: 'Failed to check out equipment' });
  }
});

app.post('/api/equipment/:id/checkin', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { condition, notes } = req.body;

    const equipment = await prisma.equipment.update({
      where: { id },
      data: {
        status: 'AVAILABLE',
        condition: condition || 'GOOD',
        assignedTo: null,
        assignedDate: null,
        dueDate: null,
        notes: notes || equipment.notes
      },
      include: {
        category: { select: { name: true } },
        location: { select: { name: true } }
      }
    });

    // Create transaction record
    await prisma.transaction.create({
      data: {
        type: 'CHECK_IN',
        equipmentId: id,
        metadata: {
          condition: condition,
          notes: notes || null
        }
      }
    });

    res.json({
      message: 'Equipment checked in successfully',
      equipment: formatEquipmentForFrontend(equipment)
    });
  } catch (error) {
    console.error('Equipment checkin error:', error);
    res.status(500).json({ error: 'Failed to check in equipment' });
  }
});

// Categories endpoint
app.get('/api/categories', authMiddleware, async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });

    res.json({
      categories: categories.map(cat => ({
        id: cat.id,
        name: cat.name
      }))
    });
  } catch (error) {
    console.error('Categories fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Locations endpoint
app.get('/api/locations', authMiddleware, async (req, res) => {
  try {
    const locations = await prisma.location.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });

    res.json({
      locations: locations.map(loc => ({
        id: loc.id,
        name: loc.name
      }))
    });
  } catch (error) {
    console.error('Locations fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// Dashboard stats endpoint
app.get('/api/dashboard/stats', authMiddleware, async (req, res) => {
  try {
    const totalEquipment = await prisma.equipment.count({
      where: { isDeleted: false }
    });

    const available = await prisma.equipment.count({
      where: { 
        isDeleted: false,
        status: 'AVAILABLE',
        assignedTo: null
      }
    });

    const checkedOut = await prisma.equipment.count({
      where: { 
        isDeleted: false,
        assignedTo: { not: null }
      }
    });

    const maintenance = await prisma.equipment.count({
      where: { 
        isDeleted: false,
        status: { in: ['MAINTENANCE', 'RETIRED', 'DAMAGED'] }
      }
    });

    // Get recent activity
    const recentActivity = await prisma.transaction.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        equipment: {
          select: { name: true }
        }
      }
    });

    const formattedActivity = recentActivity.map(activity => ({
      id: activity.id,
      equipmentName: activity.equipment?.name || 'Unknown Equipment',
      action: activity.type.replace('_', ' '),
      userName: activity.metadata?.assignedTo || 'System',
      timestamp: activity.createdAt
    }));

    res.json({
      totalEquipment,
      available,
      checkedOut,
      maintenance,
      recentActivity: formattedActivity
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// Admin auth config endpoint (placeholder)
app.get('/api/admin/auth/config', authMiddleware, async (req, res) => {
  res.json({
    oauth2: {
      google: { enabled: false, clientId: '', clientSecret: '', redirectUri: '' },
      microsoft: { enabled: false, clientId: '', clientSecret: '', redirectUri: '' },
      github: { enabled: false, clientId: '', clientSecret: '', redirectUri: '' }
    },
    saml: {
      enabled: false,
      entityId: '',
      ssoUrl: '',
      nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      certificate: ''
    }
  });
});

app.put('/api/admin/auth/oauth2/:provider', authMiddleware, (req, res) => {
  res.json({ message: `${req.params.provider} OAuth2 configuration updated (demo mode)` });
});

app.put('/api/admin/auth/saml', authMiddleware, (req, res) => {
  res.json({ message: 'SAML configuration updated (demo mode)' });
});

// Start server
app.listen(PORT, () => {
  console.log(`ETrax API server running on port ${PORT}`);
});