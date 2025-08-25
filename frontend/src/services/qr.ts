import { apiClient } from './api';
import { Equipment } from '@shared/types';

export interface QRCodeGenerationData {
  equipmentIds: string[];
  customTemplate?: {
    logoUrl?: string;
    backgroundColor?: string;
    foregroundColor?: string;
    borderColor?: string;
    textColor?: string;
    schoolName?: string;
    includeSchoolLogo?: boolean;
  };
  size?: 'small' | 'medium' | 'large';
  format?: 'png' | 'svg' | 'pdf';
  includeText?: boolean;
  batchSize?: number;
}

export interface QRCodeResponse {
  equipmentId: string;
  equipmentName: string;
  qrCodeUrl: string;
  qrCodeData: string;
  generatedAt: string;
}

export interface BulkQRResponse {
  success: boolean;
  generated: QRCodeResponse[];
  failed: Array<{ equipmentId: string; error: string }>;
  downloadUrl?: string;
  batchId: string;
}

export interface QRScanData {
  qrData: string;
  scanLocation?: string;
  scanMethod?: 'camera' | 'manual';
  metadata?: Record<string, any>;
}

export interface QRScanResult {
  success: boolean;
  equipment?: Equipment;
  message: string;
  actions?: Array<{
    type: 'checkout' | 'checkin' | 'view' | 'report';
    label: string;
    url?: string;
  }>;
  error?: string;
}

export interface QRCodeTemplate {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string;
  backgroundColor: string;
  foregroundColor: string;
  borderColor?: string;
  textColor?: string;
  schoolName?: string;
  includeSchoolLogo: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QRBatchJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  downloadUrl?: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export interface QRCodeStatistics {
  totalGenerated: number;
  totalScanned: number;
  mostScannedEquipment: Array<{
    equipmentId: string;
    equipmentName: string;
    scanCount: number;
  }>;
  scansByLocation: Array<{
    location: string;
    count: number;
  }>;
  recentActivity: Array<{
    equipmentId: string;
    equipmentName: string;
    action: 'generated' | 'scanned';
    timestamp: string;
    user?: string;
  }>;
  generationTrends: Array<{
    date: string;
    generated: number;
    scanned: number;
  }>;
}

export class QRCodeService {
  static async generateQRCode(equipmentId: string, options: Partial<QRCodeGenerationData> = {}): Promise<QRCodeResponse> {
    return await apiClient.post('/qr/generate/single', {
      equipmentId,
      ...options,
    });
  }

  static async generateBulkQRCodes(data: QRCodeGenerationData): Promise<BulkQRResponse> {
    return await apiClient.post('/qr/generate/bulk', data);
  }

  static async scanQRCode(data: QRScanData): Promise<QRScanResult> {
    return await apiClient.post('/qr/scan', data);
  }

  static async getEquipmentByQR(qrData: string): Promise<{
    equipment?: Equipment;
    isValid: boolean;
    message: string;
  }> {
    return await apiClient.get(`/qr/lookup/${encodeURIComponent(qrData)}`);
  }

  static async getQRCodeHistory(equipmentId?: string): Promise<{
    qrCodes: Array<{
      id: string;
      equipmentId: string;
      equipmentName: string;
      qrCodeUrl: string;
      generatedAt: string;
      scanCount: number;
      lastScannedAt?: string;
    }>;
    total: number;
  }> {
    const url = equipmentId 
      ? `/qr/history?equipmentId=${equipmentId}` 
      : '/qr/history';
    return await apiClient.get(url);
  }

  static async getScanHistory(equipmentId?: string): Promise<{
    scans: Array<{
      id: string;
      equipmentId: string;
      equipmentName: string;
      scannedAt: string;
      scanLocation?: string;
      scanMethod: string;
      user?: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
      };
    }>;
    total: number;
  }> {
    const url = equipmentId 
      ? `/qr/scans?equipmentId=${equipmentId}` 
      : '/qr/scans';
    return await apiClient.get(url);
  }

  // Template management
  static async getQRTemplates(): Promise<QRCodeTemplate[]> {
    return await apiClient.get('/qr/templates');
  }

  static async createQRTemplate(template: Omit<QRCodeTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<QRCodeTemplate> {
    return await apiClient.post('/qr/templates', template);
  }

  static async updateQRTemplate(id: string, updates: Partial<QRCodeTemplate>): Promise<QRCodeTemplate> {
    return await apiClient.put(`/qr/templates/${id}`, updates);
  }

  static async deleteQRTemplate(id: string): Promise<{ success: boolean; message: string }> {
    return await apiClient.delete(`/qr/templates/${id}`);
  }

  static async setDefaultTemplate(id: string): Promise<{ success: boolean; message: string }> {
    return await apiClient.post(`/qr/templates/${id}/set-default`);
  }

  // Batch job management
  static async getBatchJobs(): Promise<QRBatchJob[]> {
    return await apiClient.get('/qr/batches');
  }

  static async getBatchJobStatus(batchId: string): Promise<QRBatchJob> {
    return await apiClient.get(`/qr/batches/${batchId}`);
  }

  static async cancelBatchJob(batchId: string): Promise<{ success: boolean; message: string }> {
    return await apiClient.post(`/qr/batches/${batchId}/cancel`);
  }

  static async downloadBatchResult(batchId: string): Promise<Blob> {
    const response = await apiClient.getRawClient().get(`/qr/batches/${batchId}/download`, {
      responseType: 'blob',
    });
    return response.data;
  }

  // Statistics and analytics
  static async getQRStatistics(filters: {
    startDate?: string;
    endDate?: string;
    equipmentId?: string;
    locationId?: string;
  } = {}): Promise<QRCodeStatistics> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });

    return await apiClient.get(`/qr/statistics?${params.toString()}`);
  }

  static async exportQRData(filters: {
    startDate?: string;
    endDate?: string;
    equipmentId?: string;
    type?: 'generated' | 'scanned' | 'both';
    format?: 'csv' | 'xlsx';
  } = {}): Promise<Blob> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params.set(key, value.toString());
      }
    });

    const response = await apiClient.getRawClient().get(`/qr/export?${params.toString()}`, {
      responseType: 'blob',
    });

    return response.data;
  }

  // Utility methods for QR code operations
  static async validateQRCode(qrData: string): Promise<{
    isValid: boolean;
    equipmentId?: string;
    message: string;
    metadata?: Record<string, any>;
  }> {
    return await apiClient.post('/qr/validate', { qrData });
  }

  static async regenerateQRCode(equipmentId: string, reason?: string): Promise<QRCodeResponse> {
    return await apiClient.post(`/qr/regenerate/${equipmentId}`, { reason });
  }

  static async getQRCodeUrl(equipmentId: string): Promise<{
    qrCodeUrl: string;
    qrCodeData: string;
    lastGenerated: string;
  }> {
    return await apiClient.get(`/qr/equipment/${equipmentId}`);
  }

  // Bulk operations
  static async regenerateBulkQRCodes(equipmentIds: string[], options: {
    reason?: string;
    template?: string;
    format?: 'png' | 'svg' | 'pdf';
  } = {}): Promise<BulkQRResponse> {
    return await apiClient.post('/qr/regenerate/bulk', {
      equipmentIds,
      ...options,
    });
  }

  static async printQRCodes(equipmentIds: string[], options: {
    template?: string;
    format?: 'pdf';
    layout?: 'grid' | 'list';
    itemsPerPage?: number;
  } = {}): Promise<Blob> {
    const response = await apiClient.getRawClient().post('/qr/print', {
      equipmentIds,
      ...options,
    }, {
      responseType: 'blob',
    });

    return response.data;
  }

  // Camera integration utilities (client-side)
  static async startQRScanner(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Use back camera
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
    } catch (error) {
      throw new Error('Camera access denied or not available');
    }
  }

  static stopQRScanner(stream: MediaStream): void {
    stream.getTracks().forEach(track => track.stop());
  }

  // QR Code generation for offline use
  static generateOfflineQRData(equipmentId: string): string {
    // Generate a QR code data string that works offline
    const baseUrl = window.location.origin;
    return `${baseUrl}/equipment/${equipmentId}`;
  }

  // Utility functions
  static formatQRCodeSize(size: 'small' | 'medium' | 'large'): number {
    const sizes = {
      small: 150,
      medium: 200,
      large: 300,
    };
    return sizes[size];
  }

  static getQRCodeErrorCorrectionLevel(usage: 'indoor' | 'outdoor' | 'harsh'): 'L' | 'M' | 'Q' | 'H' {
    const levels = {
      indoor: 'M' as const,
      outdoor: 'Q' as const,
      harsh: 'H' as const,
    };
    return levels[usage];
  }

  static validateQRTemplate(template: Partial<QRCodeTemplate>): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!template.name?.trim()) {
      errors.push('Template name is required');
    }

    if (template.backgroundColor && !/^#[0-9A-F]{6}$/i.test(template.backgroundColor)) {
      errors.push('Invalid background color format');
    }

    if (template.foregroundColor && !/^#[0-9A-F]{6}$/i.test(template.foregroundColor)) {
      errors.push('Invalid foreground color format');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}