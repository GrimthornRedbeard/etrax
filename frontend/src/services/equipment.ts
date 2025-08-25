import { apiClient } from './api';
import { Equipment, Category, Location, EquipmentStatus } from '@shared/types';

export interface EquipmentFilters {
  search?: string;
  status?: EquipmentStatus[];
  categoryId?: string;
  locationId?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'code' | 'status' | 'purchaseDate' | 'purchasePrice';
  sortOrder?: 'asc' | 'desc';
}

export interface EquipmentListResponse {
  equipment: Equipment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface CreateEquipmentData {
  name: string;
  code?: string;
  description?: string;
  categoryId: string;
  locationId: string;
  purchasePrice?: number;
  purchaseDate?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  condition?: string;
  notes?: string;
  images?: File[];
}

export interface UpdateEquipmentData extends Partial<CreateEquipmentData> {
  id: string;
}

export interface BulkUpdateData {
  equipmentIds: string[];
  updates: {
    status?: EquipmentStatus;
    locationId?: string;
    categoryId?: string;
    notes?: string;
  };
}

export interface EquipmentStatistics {
  totalEquipment: number;
  byStatus: Record<EquipmentStatus, number>;
  byCategory: Array<{ categoryId: string; categoryName: string; count: number }>;
  byLocation: Array<{ locationId: string; locationName: string; count: number }>;
  totalValue: number;
  averageValue: number;
  recentlyAdded: number;
}

export class EquipmentService {
  static async getEquipment(filters: EquipmentFilters = {}): Promise<EquipmentListResponse> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(v => params.append(key, v.toString()));
        } else {
          params.set(key, value.toString());
        }
      }
    });

    return await apiClient.get(`/equipment?${params.toString()}`);
  }

  static async getEquipmentById(id: string): Promise<Equipment> {
    return await apiClient.get(`/equipment/${id}`);
  }

  static async createEquipment(data: CreateEquipmentData): Promise<Equipment> {
    const formData = new FormData();
    
    Object.entries(data).forEach(([key, value]) => {
      if (key === 'images' && Array.isArray(value)) {
        value.forEach((file, index) => {
          formData.append(`images`, file);
        });
      } else if (value !== undefined && value !== null) {
        formData.append(key, value.toString());
      }
    });

    return await apiClient.post('/equipment', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }

  static async updateEquipment(data: UpdateEquipmentData): Promise<Equipment> {
    const { id, images, ...updateData } = data;
    
    if (images && images.length > 0) {
      // If there are images, use FormData
      const formData = new FormData();
      
      Object.entries(updateData).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });

      images.forEach((file) => {
        formData.append('images', file);
      });

      return await apiClient.put(`/equipment/${id}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
    } else {
      // No images, use regular JSON
      return await apiClient.put(`/equipment/${id}`, updateData);
    }
  }

  static async deleteEquipment(id: string): Promise<{ success: boolean; message: string }> {
    return await apiClient.delete(`/equipment/${id}`);
  }

  static async updateEquipmentStatus(
    id: string, 
    status: EquipmentStatus, 
    reason?: string
  ): Promise<Equipment> {
    return await apiClient.patch(`/equipment/${id}/status`, { status, reason });
  }

  static async bulkUpdateEquipment(data: BulkUpdateData): Promise<{
    success: boolean;
    updated: number;
    failed: number;
    results: Array<{ id: string; success: boolean; error?: string }>;
  }> {
    return await apiClient.post('/equipment/bulk-update', data);
  }

  static async getEquipmentStatistics(): Promise<EquipmentStatistics> {
    return await apiClient.get('/equipment/statistics');
  }

  static async searchEquipment(query: string, limit: number = 10): Promise<Equipment[]> {
    const response = await apiClient.get(`/equipment/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    return response.equipment || [];
  }

  static async getEquipmentHistory(id: string): Promise<{
    transactions: Array<any>;
    maintenanceRequests: Array<any>;
    statusChanges: Array<any>;
  }> {
    return await apiClient.get(`/equipment/${id}/history`);
  }

  static async exportEquipment(filters: EquipmentFilters = {}, format: 'csv' | 'xlsx' = 'csv'): Promise<Blob> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(v => params.append(key, v.toString()));
        } else {
          params.set(key, value.toString());
        }
      }
    });

    params.set('format', format);

    const response = await apiClient.getRawClient().get(`/equipment/export?${params.toString()}`, {
      responseType: 'blob',
    });

    return response.data;
  }

  static async importEquipment(file: File, options: {
    updateExisting?: boolean;
    skipDuplicates?: boolean;
  } = {}): Promise<{
    success: boolean;
    imported: number;
    updated: number;
    failed: number;
    errors: Array<{ row: number; error: string }>;
  }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('options', JSON.stringify(options));

    return await apiClient.post('/equipment/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }

  // Category management
  static async getCategories(): Promise<Category[]> {
    return await apiClient.get('/categories');
  }

  static async createCategory(data: {
    name: string;
    code?: string;
    description?: string;
    parentId?: string;
  }): Promise<Category> {
    return await apiClient.post('/categories', data);
  }

  static async updateCategory(id: string, data: Partial<Category>): Promise<Category> {
    return await apiClient.put(`/categories/${id}`, data);
  }

  static async deleteCategory(id: string): Promise<{ success: boolean; message: string }> {
    return await apiClient.delete(`/categories/${id}`);
  }

  // Location management
  static async getLocations(): Promise<Location[]> {
    return await apiClient.get('/locations');
  }

  static async createLocation(data: {
    name: string;
    code?: string;
    description?: string;
    parentId?: string;
    capacity?: number;
  }): Promise<Location> {
    return await apiClient.post('/locations', data);
  }

  static async updateLocation(id: string, data: Partial<Location>): Promise<Location> {
    return await apiClient.put(`/locations/${id}`, data);
  }

  static async deleteLocation(id: string): Promise<{ success: boolean; message: string }> {
    return await apiClient.delete(`/locations/${id}`);
  }

  // Image management
  static async uploadEquipmentImage(equipmentId: string, file: File): Promise<{ imageUrl: string }> {
    const formData = new FormData();
    formData.append('image', file);

    return await apiClient.post(`/equipment/${equipmentId}/images`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }

  static async deleteEquipmentImage(equipmentId: string, imageId: string): Promise<{ success: boolean }> {
    return await apiClient.delete(`/equipment/${equipmentId}/images/${imageId}`);
  }

  // Utility methods
  static getStatusColor(status: EquipmentStatus): string {
    const colors = {
      AVAILABLE: 'green',
      CHECKED_OUT: 'blue',
      MAINTENANCE: 'yellow',
      DAMAGED: 'red',
      LOST: 'gray',
      RETIRED: 'slate',
      RESERVED: 'purple',
      OVERDUE: 'orange',
    };
    return colors[status] || 'gray';
  }

  static getStatusLabel(status: EquipmentStatus): string {
    const labels = {
      AVAILABLE: 'Available',
      CHECKED_OUT: 'Checked Out',
      MAINTENANCE: 'Maintenance',
      DAMAGED: 'Damaged',
      LOST: 'Lost',
      RETIRED: 'Retired',
      RESERVED: 'Reserved',
      OVERDUE: 'Overdue',
    };
    return labels[status] || status;
  }

  static formatPrice(price?: number): string {
    if (!price) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  }
}