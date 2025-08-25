// Core entity types
export interface Organization {
  id: string;
  name: string;
  type: OrganizationType;
  domain?: string;
  subdomain: string;
  parentId?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  website?: string;
  settings: Record<string, any>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export enum OrganizationType {
  STATE = 'STATE',
  DISTRICT = 'DISTRICT',
  SCHOOL = 'SCHOOL',
  COUNTY = 'COUNTY',
}

export interface School {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  email?: string;
  website?: string;
  mascot?: string;
  colors?: string[];
  sportPrograms?: Record<string, any>;
  qrCodePrefix: string;
  defaultStatus: EquipmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatar?: string;
  schoolId?: string;
  organizationId?: string;
  role: UserRole;
  permissions: string[];
  isActive: boolean;
  lastLoginAt?: Date;
  emailVerified: boolean;
  emailVerifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ORG_ADMIN = 'ORG_ADMIN',
  SCHOOL_ADMIN = 'SCHOOL_ADMIN',
  COACH = 'COACH',
  EQUIPMENT_MANAGER = 'EQUIPMENT_MANAGER',
  USER = 'USER',
  STUDENT = 'STUDENT',
  PARENT = 'PARENT',
}

export interface Equipment {
  id: string;
  schoolId: string;
  name: string;
  description?: string;
  serialNumber?: string;
  model?: string;
  brand?: string;
  qrCode: string;
  qrCodeData?: Record<string, any>;
  categoryId: string;
  locationId?: string;
  assignedTo?: string;
  status: EquipmentStatus;
  condition: EquipmentCondition;
  notes?: string;
  purchaseDate?: Date;
  purchasePrice?: number;
  warrantyExpiry?: Date;
  retirementDate?: Date;
  lastInspection?: Date;
  nextInspection?: Date;
  size?: string;
  weight?: number;
  color?: string;
  customFields?: Record<string, any>;
  images: string[];
  createdAt: Date;
  updatedAt: Date;
}

export enum EquipmentStatus {
  GREEN = 'GREEN',
  YELLOW = 'YELLOW',
  RED = 'RED',
  RETIRED = 'RETIRED',
  LOST = 'LOST',
}

export enum EquipmentCondition {
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  POOR = 'POOR',
  DAMAGED = 'DAMAGED',
}

export interface Category {
  id: string;
  schoolId: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  sport?: string;
  parentId?: string;
  requiresSize: boolean;
  requiresAssignment: boolean;
  inspectionInterval?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Location {
  id: string;
  schoolId: string;
  name: string;
  description?: string;
  type: LocationType;
  building?: string;
  room?: string;
  coordinates?: Record<string, any>;
  parentId?: string;
  capacity?: number;
  isSecure: boolean;
  accessCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum LocationType {
  ROOM = 'ROOM',
  BUILDING = 'BUILDING',
  FIELD = 'FIELD',
  GYM = 'GYM',
  STORAGE = 'STORAGE',
  LOCKER_ROOM = 'LOCKER_ROOM',
  OTHER = 'OTHER',
}

export interface Transaction {
  id: string;
  schoolId: string;
  equipmentId: string;
  userId?: string;
  type: TransactionType;
  fromLocationId?: string;
  toLocationId?: string;
  previousStatus?: EquipmentStatus;
  newStatus?: EquipmentStatus;
  previousAssignee?: string;
  newAssignee?: string;
  voiceCommand?: string;
  voiceConfidence?: number;
  notes?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export enum TransactionType {
  CHECK_OUT = 'CHECK_OUT',
  CHECK_IN = 'CHECK_IN',
  STATUS_CHANGE = 'STATUS_CHANGE',
  ASSIGNMENT_CHANGE = 'ASSIGNMENT_CHANGE',
  LOCATION_CHANGE = 'LOCATION_CHANGE',
  INSPECTION = 'INSPECTION',
  MAINTENANCE = 'MAINTENANCE',
  BULK_OPERATION = 'BULK_OPERATION',
  VOICE_COMMAND = 'VOICE_COMMAND',
}

export interface MaintenanceRecord {
  id: string;
  equipmentId: string;
  type: MaintenanceType;
  description: string;
  cost?: number;
  performedBy?: string;
  performedAt: Date;
  conditionBefore: EquipmentCondition;
  conditionAfter: EquipmentCondition;
  partsUsed?: string;
  materialsCost?: number;
  laborHours?: number;
  beforeImages: string[];
  afterImages: string[];
  invoiceUrl?: string;
  nextMaintenanceDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export enum MaintenanceType {
  ROUTINE = 'ROUTINE',
  REPAIR = 'REPAIR',
  CLEANING = 'CLEANING',
  INSPECTION = 'INSPECTION',
  REPLACEMENT = 'REPLACEMENT',
  UPGRADE = 'UPGRADE',
  RECALL = 'RECALL',
}

export interface Notification {
  id: string;
  schoolId: string;
  userId?: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  channels: NotificationChannel[];
  equipmentId?: string;
  isRead: boolean;
  readAt?: Date;
  emailSent: boolean;
  smsSent: boolean;
  pushSent: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export enum NotificationType {
  EQUIPMENT_ALERT = 'EQUIPMENT_ALERT',
  MAINTENANCE_DUE = 'MAINTENANCE_DUE',
  EQUIPMENT_ASSIGNED = 'EQUIPMENT_ASSIGNED',
  EQUIPMENT_OVERDUE = 'EQUIPMENT_OVERDUE',
  SYSTEM_UPDATE = 'SYSTEM_UPDATE',
  SECURITY_ALERT = 'SECURITY_ALERT',
  CUSTOM = 'CUSTOM',
}

export enum NotificationPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum NotificationChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  PUSH = 'PUSH',
  IN_APP = 'IN_APP',
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Filter and search types
export interface EquipmentFilters {
  status?: EquipmentStatus[];
  condition?: EquipmentCondition[];
  categoryId?: string[];
  locationId?: string[];
  assignedTo?: string;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Voice command types
export interface VoiceCommand {
  id: string;
  transcript: string;
  confidence: number;
  intent: VoiceIntent;
  entities: VoiceEntity[];
  equipmentId?: string;
  userId: string;
  processed: boolean;
  createdAt: Date;
}

export enum VoiceIntent {
  ADD_EQUIPMENT = 'ADD_EQUIPMENT',
  UPDATE_STATUS = 'UPDATE_STATUS',
  ASSIGN_EQUIPMENT = 'ASSIGN_EQUIPMENT',
  MOVE_EQUIPMENT = 'MOVE_EQUIPMENT',
  SEARCH_EQUIPMENT = 'SEARCH_EQUIPMENT',
  BULK_UPDATE = 'BULK_UPDATE',
  UNKNOWN = 'UNKNOWN',
}

export interface VoiceEntity {
  type: VoiceEntityType;
  value: string;
  confidence: number;
}

export enum VoiceEntityType {
  EQUIPMENT_NAME = 'EQUIPMENT_NAME',
  STATUS = 'STATUS',
  LOCATION = 'LOCATION',
  PERSON = 'PERSON',
  NUMBER = 'NUMBER',
  SIZE = 'SIZE',
  COLOR = 'COLOR',
  SPORT = 'SPORT',
}