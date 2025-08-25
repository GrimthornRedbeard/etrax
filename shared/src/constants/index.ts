// API Constants
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    VERIFY: '/auth/verify',
    FORGOT_PASSWORD: '/auth/forgot-password',
    RESET_PASSWORD: '/auth/reset-password',
  },
  EQUIPMENT: {
    BASE: '/equipment',
    BULK: '/equipment/bulk',
    SEARCH: '/equipment/search',
    QR: '/equipment/qr',
    HISTORY: '/equipment/:id/history',
  },
  SCHOOLS: {
    BASE: '/schools',
    ONBOARD: '/schools/onboard',
    SCAN_WEBSITE: '/schools/scan-website',
  },
  CATEGORIES: '/categories',
  LOCATIONS: '/locations',
  TRANSACTIONS: '/transactions',
  REPORTS: '/reports',
  NOTIFICATIONS: '/notifications',
  VOICE: '/voice',
  QR: '/qr',
  HEALTH: '/health',
} as const;

// Equipment status colors and labels
export const EQUIPMENT_STATUS = {
  GREEN: {
    label: 'Available',
    color: '#22c55e',
    bgColor: '#dcfce7',
    textColor: '#166534',
  },
  YELLOW: {
    label: 'Needs Attention',
    color: '#f59e0b',
    bgColor: '#fef3c7',
    textColor: '#92400e',
  },
  RED: {
    label: 'Out of Service',
    color: '#ef4444',
    bgColor: '#fee2e2',
    textColor: '#991b1b',
  },
  RETIRED: {
    label: 'Retired',
    color: '#6b7280',
    bgColor: '#f3f4f6',
    textColor: '#374151',
  },
  LOST: {
    label: 'Lost/Missing',
    color: '#7c2d12',
    bgColor: '#fef2f2',
    textColor: '#7c2d12',
  },
} as const;

// Equipment conditions
export const EQUIPMENT_CONDITION = {
  EXCELLENT: { label: 'Excellent', priority: 1 },
  GOOD: { label: 'Good', priority: 2 },
  FAIR: { label: 'Fair', priority: 3 },
  POOR: { label: 'Poor', priority: 4 },
  DAMAGED: { label: 'Damaged', priority: 5 },
} as const;

// User roles and permissions
export const USER_ROLES = {
  SUPER_ADMIN: {
    label: 'Super Administrator',
    permissions: ['*'],
  },
  ORG_ADMIN: {
    label: 'Organization Administrator',
    permissions: ['manage_organization', 'manage_schools', 'view_reports'],
  },
  SCHOOL_ADMIN: {
    label: 'School Administrator',
    permissions: ['manage_school', 'manage_users', 'manage_equipment', 'view_reports'],
  },
  COACH: {
    label: 'Coach',
    permissions: ['manage_equipment', 'view_equipment', 'create_transactions'],
  },
  EQUIPMENT_MANAGER: {
    label: 'Equipment Manager',
    permissions: ['manage_equipment', 'manage_maintenance', 'view_reports'],
  },
  USER: {
    label: 'User',
    permissions: ['view_equipment', 'create_transactions'],
  },
  STUDENT: {
    label: 'Student',
    permissions: ['view_assigned_equipment'],
  },
  PARENT: {
    label: 'Parent',
    permissions: ['view_child_equipment'],
  },
} as const;

// Notification priorities
export const NOTIFICATION_PRIORITY = {
  LOW: { label: 'Low', color: '#6b7280' },
  NORMAL: { label: 'Normal', color: '#3b82f6' },
  HIGH: { label: 'High', color: '#f59e0b' },
  URGENT: { label: 'Urgent', color: '#ef4444' },
} as const;

// Voice command confidence thresholds
export const VOICE_CONFIDENCE = {
  HIGH: 0.9,
  MEDIUM: 0.7,
  LOW: 0.5,
} as const;

// File upload constraints
export const UPLOAD_CONSTRAINTS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'text/plain'],
  MAX_FILES_PER_UPLOAD: 5,
} as const;

// QR Code settings
export const QR_CODE_SETTINGS = {
  SIZE: 200,
  ERROR_CORRECTION: 'M',
  MARGIN: 4,
  FOREGROUND_COLOR: '#000000',
  BACKGROUND_COLOR: '#ffffff',
} as const;

// Pagination defaults
export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

// Cache keys
export const CACHE_KEYS = {
  USER_PROFILE: 'user_profile',
  EQUIPMENT_LIST: 'equipment_list',
  CATEGORIES: 'categories',
  LOCATIONS: 'locations',
  SCHOOL_SETTINGS: 'school_settings',
  NOTIFICATIONS: 'notifications',
} as const;

// Local storage keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_PREFERENCES: 'user_preferences',
  OFFLINE_DATA: 'offline_data',
  SYNC_QUEUE: 'sync_queue',
  LAST_SYNC: 'last_sync',
} as const;

// PWA settings
export const PWA_SETTINGS = {
  CACHE_NAME: 'etrax-cache-v1',
  OFFLINE_FALLBACK: '/offline.html',
  SYNC_TAG: 'background-sync',
  UPDATE_INTERVAL: 24 * 60 * 60 * 1000, // 24 hours
} as const;

// Sports categories (for equipment categorization)
export const SPORT_CATEGORIES = [
  'Football',
  'Basketball',
  'Baseball',
  'Softball',
  'Soccer',
  'Track & Field',
  'Wrestling',
  'Swimming',
  'Tennis',
  'Golf',
  'Cross Country',
  'Volleyball',
  'Hockey',
  'Lacrosse',
  'Cheerleading',
  'Gymnastics',
  'Other',
] as const;

// Common equipment sizes
export const EQUIPMENT_SIZES = {
  CLOTHING: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
  SHOES: ['6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13', '13.5', '14'],
  HELMET: ['XS', 'S', 'M', 'L', 'XL'],
  GENERIC: ['XS', 'S', 'M', 'L', 'XL'],
} as const;

// Time intervals
export const TIME_INTERVALS = {
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
  MONTH: 30 * 24 * 60 * 60 * 1000,
} as const;

// Regular expressions
export const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[\d\s\-\(\)]{10,}$/,
  URL: /^https?:\/\/[^\s]+$/,
  QR_CODE: /^[A-Z0-9]{3,}-[A-Z0-9]{8}$/,
  SCHOOL_CODE: /^[A-Z0-9]{3,10}$/,
} as const;