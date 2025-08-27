const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3002; // Use different port

app.use(cors());
app.use(express.json());

// Simple demo authentication
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  req.user = {
    id: 'demo-user-id',
    email: 'demo@etrax.com',
    role: 'ADMIN'
  };
  
  next();
};

// Mock data
const mockEquipment = [
  {
    id: '1',
    name: 'Basketball - Spalding NBA',
    category: 'Basketballs',
    serialNumber: 'SPL-001',
    qrCode: 'EQ-BB-001',
    status: 'AVAILABLE',
    location: 'Gym Storage',
    condition: 'EXCELLENT',
    checkedOutTo: null,
    notes: 'Official game ball',
    cost: '89.99',
    purchaseDate: '2024-01-15'
  },
  {
    id: '2',
    name: 'Soccer Ball - Nike Strike',
    category: 'Soccer Equipment',
    serialNumber: 'NIKE-002',
    qrCode: 'EQ-SB-002',
    status: 'CHECKED_OUT',
    location: 'Field A',
    condition: 'GOOD',
    checkedOutTo: 'John Smith',
    checkedOutDate: new Date(),
    notes: 'Practice ball',
    cost: '45.99',
    purchaseDate: '2024-02-10'
  }
];

const mockCategories = [
  { id: '1', name: 'Basketballs' },
  { id: '2', name: 'Soccer Equipment' },
  { id: '3', name: 'General Equipment' },
  { id: '4', name: 'Tennis Equipment' },
  { id: '5', name: 'Swimming Equipment' }
];

const mockLocations = [
  { id: '1', name: 'Gym Storage' },
  { id: '2', name: 'Field A' },
  { id: '3', name: 'Equipment Room' },
  { id: '4', name: 'Pool Deck' },
  { id: '5', name: 'Tennis Courts' }
];

// Auth endpoint
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
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
  res.json({
    equipment: mockEquipment,
    total: mockEquipment.length,
    page: 1,
    totalPages: 1
  });
});

app.post('/api/equipment', authMiddleware, async (req, res) => {
  const newEquipment = {
    id: (mockEquipment.length + 1).toString(),
    ...req.body,
    status: 'AVAILABLE',
    checkedOutTo: null
  };
  
  mockEquipment.push(newEquipment);
  
  res.status(201).json({
    message: 'Equipment created successfully',
    equipment: newEquipment
  });
});

app.put('/api/equipment/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const index = mockEquipment.findIndex(eq => eq.id === id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Equipment not found' });
  }
  
  mockEquipment[index] = { ...mockEquipment[index], ...req.body };
  
  res.json({
    message: 'Equipment updated successfully',
    equipment: mockEquipment[index]
  });
});

app.post('/api/equipment/:id/checkout', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { userName, dueDate, notes } = req.body;
  const index = mockEquipment.findIndex(eq => eq.id === id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Equipment not found' });
  }
  
  mockEquipment[index] = {
    ...mockEquipment[index],
    status: 'CHECKED_OUT',
    checkedOutTo: userName,
    checkedOutDate: new Date(),
    dueDate: dueDate ? new Date(dueDate) : null,
    notes: notes || mockEquipment[index].notes
  };
  
  res.json({
    message: 'Equipment checked out successfully',
    equipment: mockEquipment[index]
  });
});

app.post('/api/equipment/:id/checkin', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { condition, notes } = req.body;
  const index = mockEquipment.findIndex(eq => eq.id === id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Equipment not found' });
  }
  
  mockEquipment[index] = {
    ...mockEquipment[index],
    status: 'AVAILABLE',
    condition: condition || 'GOOD',
    checkedOutTo: null,
    checkedOutDate: null,
    dueDate: null,
    notes: notes || mockEquipment[index].notes
  };
  
  res.json({
    message: 'Equipment checked in successfully',
    equipment: mockEquipment[index]
  });
});

// Categories endpoint
app.get('/api/categories', authMiddleware, async (req, res) => {
  res.json({
    categories: mockCategories
  });
});

// Locations endpoint
app.get('/api/locations', authMiddleware, async (req, res) => {
  res.json({
    locations: mockLocations
  });
});

// Dashboard stats endpoint
app.get('/api/dashboard/stats', authMiddleware, async (req, res) => {
  const available = mockEquipment.filter(eq => eq.status === 'AVAILABLE').length;
  const checkedOut = mockEquipment.filter(eq => eq.status === 'CHECKED_OUT').length;
  const maintenance = mockEquipment.filter(eq => eq.status === 'MAINTENANCE').length;

  res.json({
    totalEquipment: mockEquipment.length,
    available,
    checkedOut,
    maintenance,
    recentActivity: [
      {
        id: '1',
        equipmentName: 'Soccer Ball - Nike Strike',
        action: 'CHECK OUT',
        userName: 'John Smith',
        timestamp: new Date()
      }
    ]
  });
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
  console.log(`ETrax Mock API server running on port ${PORT}`);
});