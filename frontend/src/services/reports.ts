import { apiClient } from './api';
import { Equipment, Transaction, User } from '@shared/types';

export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  equipmentIds?: string[];
  categoryIds?: string[];
  locationIds?: string[];
  userIds?: string[];
  statuses?: string[];
  departments?: string[];
  organizationId?: string;
  schoolId?: string;
}

export interface EquipmentReport {
  equipment: Equipment[];
  summary: {
    totalEquipment: number;
    totalValue: number;
    averageAge: number;
    utilizationRate: number;
    maintenanceRate: number;
  };
  breakdown: {
    byStatus: Array<{ status: string; count: number; value: number }>;
    byCategory: Array<{ categoryId: string; categoryName: string; count: number; value: number }>;
    byLocation: Array<{ locationId: string; locationName: string; count: number; value: number }>;
    byAge: Array<{ ageRange: string; count: number; value: number }>;
  };
  trends: Array<{
    date: string;
    acquisitions: number;
    retirements: number;
    totalValue: number;
  }>;
}

export interface UtilizationReport {
  overall: {
    totalTransactions: number;
    totalEquipment: number;
    averageUtilizationRate: number;
    averageCheckoutDuration: number;
    peakUsagePeriods: Array<{
      period: string;
      transactionCount: number;
    }>;
  };
  byEquipment: Array<{
    equipmentId: string;
    equipmentName: string;
    equipmentCode: string;
    checkoutCount: number;
    totalDaysOut: number;
    utilizationRate: number;
    averageDuration: number;
    lastUsed: string;
  }>;
  byUser: Array<{
    userId: string;
    userName: string;
    checkoutCount: number;
    averageDuration: number;
    overdueDays: number;
    damageReports: number;
  }>;
  trends: Array<{
    date: string;
    checkouts: number;
    returns: number;
    utilization: number;
  }>;
}

export interface FinancialReport {
  summary: {
    totalAssetValue: number;
    depreciatedValue: number;
    totalDepreciation: number;
    annualDepreciationRate: number;
    replacementCosts: number;
    maintenanceCosts: number;
  };
  costAnalysis: {
    byCategory: Array<{
      categoryId: string;
      categoryName: string;
      assetValue: number;
      depreciatedValue: number;
      maintenanceCost: number;
      replacementCost: number;
    }>;
    byLocation: Array<{
      locationId: string;
      locationName: string;
      assetValue: number;
      depreciatedValue: number;
      maintenanceCost: number;
    }>;
    byAge: Array<{
      ageRange: string;
      count: number;
      assetValue: number;
      maintenanceCost: number;
      replacementRecommendation: boolean;
    }>;
  };
  projections: Array<{
    year: number;
    depreciatedValue: number;
    projectedMaintenance: number;
    projectedReplacements: number;
    budgetRecommendation: number;
  }>;
  riskAnalysis: {
    highValueItems: Equipment[];
    agingEquipment: Equipment[];
    highMaintenanceItems: Equipment[];
    underutilizedAssets: Equipment[];
  };
}

export interface MaintenanceReport {
  summary: {
    totalMaintenanceRequests: number;
    completedRequests: number;
    pendingRequests: number;
    overdueMaintenance: number;
    averageResolutionTime: number;
    totalMaintenanceCost: number;
  };
  breakdown: {
    byPriority: Array<{ priority: string; count: number; cost: number }>;
    byType: Array<{ type: string; count: number; averageCost: number }>;
    byTechnician: Array<{ technicianId: string; name: string; completed: number; avgTime: number }>;
  };
  equipment: Array<{
    equipmentId: string;
    equipmentName: string;
    maintenanceCount: number;
    totalCost: number;
    lastMaintenance: string;
    nextScheduled?: string;
    reliability: number;
    failureRate: number;
  }>;
  trends: Array<{
    date: string;
    requests: number;
    completed: number;
    cost: number;
  }>;
  predictions: {
    upcomingMaintenance: Array<{
      equipmentId: string;
      equipmentName: string;
      predictedDate: string;
      confidence: number;
      estimatedCost: number;
    }>;
    riskAssessment: Array<{
      equipmentId: string;
      equipmentName: string;
      riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      factors: string[];
    }>;
  };
}

export interface ComplianceReport {
  overview: {
    totalPolicies: number;
    compliantItems: number;
    nonCompliantItems: number;
    complianceRate: number;
    lastAudit: string;
    nextAudit: string;
  };
  violations: Array<{
    equipmentId: string;
    equipmentName: string;
    violations: Array<{
      type: string;
      description: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      detectedAt: string;
      resolvedAt?: string;
    }>;
  }>;
  policies: Array<{
    policyId: string;
    policyName: string;
    compliantCount: number;
    totalCount: number;
    complianceRate: number;
  }>;
  recommendations: Array<{
    type: string;
    description: string;
    priority: number;
    estimatedCost?: number;
    dueDate?: string;
  }>;
}

export interface CustomReport {
  id: string;
  name: string;
  description?: string;
  type: 'equipment' | 'utilization' | 'financial' | 'maintenance' | 'compliance' | 'custom';
  filters: ReportFilters;
  fields: Array<{
    field: string;
    label: string;
    type: 'string' | 'number' | 'date' | 'boolean';
    aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  }>;
  groupBy?: string[];
  sortBy?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  chartConfig?: {
    type: 'bar' | 'line' | 'pie' | 'scatter' | 'table';
    xAxis?: string;
    yAxis?: string;
    series?: string[];
  };
  schedule?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    time?: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
    recipients: string[];
    format: 'pdf' | 'xlsx' | 'csv';
  };
  isPublic: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportExportOptions {
  format: 'pdf' | 'xlsx' | 'csv' | 'json';
  includeCharts?: boolean;
  includeRawData?: boolean;
  template?: string;
  fileName?: string;
}

export class ReportsService {
  // Equipment Reports
  static async generateEquipmentReport(filters: ReportFilters = {}): Promise<EquipmentReport> {
    return await apiClient.post('/reports/equipment', { filters });
  }

  // Utilization Reports
  static async generateUtilizationReport(filters: ReportFilters = {}): Promise<UtilizationReport> {
    return await apiClient.post('/reports/utilization', { filters });
  }

  // Financial Reports
  static async generateFinancialReport(filters: ReportFilters = {}): Promise<FinancialReport> {
    return await apiClient.post('/reports/financial', { filters });
  }

  // Maintenance Reports
  static async generateMaintenanceReport(filters: ReportFilters = {}): Promise<MaintenanceReport> {
    return await apiClient.post('/reports/maintenance', { filters });
  }

  // Compliance Reports
  static async generateComplianceReport(filters: ReportFilters = {}): Promise<ComplianceReport> {
    return await apiClient.post('/reports/compliance', { filters });
  }

  // Custom Reports
  static async getCustomReports(): Promise<CustomReport[]> {
    return await apiClient.get('/reports/custom');
  }

  static async getCustomReport(id: string): Promise<CustomReport> {
    return await apiClient.get(`/reports/custom/${id}`);
  }

  static async createCustomReport(report: Omit<CustomReport, 'id' | 'createdAt' | 'updatedAt'>): Promise<CustomReport> {
    return await apiClient.post('/reports/custom', report);
  }

  static async updateCustomReport(id: string, updates: Partial<CustomReport>): Promise<CustomReport> {
    return await apiClient.put(`/reports/custom/${id}`, updates);
  }

  static async deleteCustomReport(id: string): Promise<{ success: boolean; message: string }> {
    return await apiClient.delete(`/reports/custom/${id}`);
  }

  static async duplicateCustomReport(id: string, name: string): Promise<CustomReport> {
    return await apiClient.post(`/reports/custom/${id}/duplicate`, { name });
  }

  static async runCustomReport(id: string, filters?: ReportFilters): Promise<{
    data: any[];
    summary: Record<string, any>;
    chartData?: any;
    generatedAt: string;
  }> {
    return await apiClient.post(`/reports/custom/${id}/run`, { filters });
  }

  // Scheduled Reports
  static async getScheduledReports(): Promise<Array<{
    id: string;
    reportId: string;
    reportName: string;
    schedule: CustomReport['schedule'];
    lastRun?: string;
    nextRun: string;
    status: 'active' | 'paused' | 'failed';
    recipients: string[];
  }>> {
    return await apiClient.get('/reports/scheduled');
  }

  static async createScheduledReport(data: {
    reportId: string;
    schedule: CustomReport['schedule'];
  }): Promise<{ id: string; nextRun: string }> {
    return await apiClient.post('/reports/scheduled', data);
  }

  static async updateScheduledReport(id: string, updates: {
    schedule?: CustomReport['schedule'];
    status?: 'active' | 'paused';
  }): Promise<{ success: boolean }> {
    return await apiClient.put(`/reports/scheduled/${id}`, updates);
  }

  static async deleteScheduledReport(id: string): Promise<{ success: boolean }> {
    return await apiClient.delete(`/reports/scheduled/${id}`);
  }

  static async runScheduledReport(id: string): Promise<{ success: boolean; message: string }> {
    return await apiClient.post(`/reports/scheduled/${id}/run`);
  }

  // Report Export
  static async exportReport(
    type: 'equipment' | 'utilization' | 'financial' | 'maintenance' | 'compliance',
    filters: ReportFilters = {},
    options: ReportExportOptions = { format: 'pdf' }
  ): Promise<Blob> {
    const response = await apiClient.getRawClient().post(`/reports/${type}/export`, {
      filters,
      options,
    }, {
      responseType: 'blob',
    });

    return response.data;
  }

  static async exportCustomReport(
    reportId: string,
    options: ReportExportOptions = { format: 'pdf' }
  ): Promise<Blob> {
    const response = await apiClient.getRawClient().post(`/reports/custom/${reportId}/export`, {
      options,
    }, {
      responseType: 'blob',
    });

    return response.data;
  }

  // Dashboard Analytics
  static async getDashboardAnalytics(filters: {
    period?: 'day' | 'week' | 'month' | 'quarter' | 'year';
    compare?: boolean;
  } = {}): Promise<{
    summary: {
      totalEquipment: number;
      equipmentValue: number;
      activeTransactions: number;
      utilizationRate: number;
      maintenanceRequests: number;
      overdueItems: number;
    };
    trends: {
      utilization: Array<{ date: string; rate: number }>;
      transactions: Array<{ date: string; checkouts: number; returns: number }>;
      maintenance: Array<{ date: string; requests: number; completed: number }>;
    };
    alerts: Array<{
      type: 'overdue' | 'maintenance' | 'low_stock' | 'compliance';
      message: string;
      count: number;
      severity: 'low' | 'medium' | 'high' | 'critical';
    }>;
    topEquipment: Array<{
      equipmentId: string;
      name: string;
      checkoutCount: number;
    }>;
    topUsers: Array<{
      userId: string;
      name: string;
      transactionCount: number;
    }>;
  }> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) {
        params.set(key, value.toString());
      }
    });

    return await apiClient.get(`/reports/dashboard?${params.toString()}`);
  }

  // Report Templates
  static async getReportTemplates(): Promise<Array<{
    id: string;
    name: string;
    description: string;
    type: string;
    previewUrl?: string;
  }>> {
    return await apiClient.get('/reports/templates');
  }

  static async applyTemplate(templateId: string, reportData: any): Promise<Blob> {
    const response = await apiClient.getRawClient().post(`/reports/templates/${templateId}/apply`, reportData, {
      responseType: 'blob',
    });

    return response.data;
  }

  // Data Insights
  static async getInsights(type: 'equipment' | 'utilization' | 'financial' | 'maintenance'): Promise<{
    insights: Array<{
      type: 'trend' | 'anomaly' | 'recommendation' | 'alert';
      title: string;
      description: string;
      impact: 'low' | 'medium' | 'high';
      action?: string;
      data?: any;
    }>;
    confidence: number;
    generatedAt: string;
  }> {
    return await apiClient.get(`/reports/insights/${type}`);
  }

  // Report Sharing
  static async shareReport(data: {
    reportId?: string;
    reportType?: string;
    recipients: string[];
    message?: string;
    expiresAt?: string;
    accessLevel: 'view' | 'download';
  }): Promise<{
    shareId: string;
    shareUrl: string;
    expiresAt: string;
  }> {
    return await apiClient.post('/reports/share', data);
  }

  static async getSharedReport(shareId: string): Promise<{
    report: any;
    metadata: {
      sharedBy: string;
      sharedAt: string;
      expiresAt: string;
      accessLevel: string;
    };
  }> {
    return await apiClient.get(`/reports/shared/${shareId}`);
  }

  // Utility methods
  static formatCurrency(amount: number, currency = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  }

  static formatPercentage(value: number, decimals = 1): string {
    return `${(value * 100).toFixed(decimals)}%`;
  }

  static formatDuration(minutes: number): string {
    const days = Math.floor(minutes / (24 * 60));
    const hours = Math.floor((minutes % (24 * 60)) / 60);
    const mins = minutes % 60;

    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${mins}m`;
    } else {
      return `${mins}m`;
    }
  }

  static calculateTrend(data: Array<{ date: string; value: number }>): {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
    isSignificant: boolean;
  } {
    if (data.length < 2) {
      return { direction: 'stable', percentage: 0, isSignificant: false };
    }

    const first = data[0].value;
    const last = data[data.length - 1].value;
    const change = ((last - first) / first) * 100;

    return {
      direction: change > 2 ? 'up' : change < -2 ? 'down' : 'stable',
      percentage: Math.abs(change),
      isSignificant: Math.abs(change) > 5,
    };
  }

  static getPeriodDates(period: 'day' | 'week' | 'month' | 'quarter' | 'year'): {
    startDate: string;
    endDate: string;
  } {
    const now = new Date();
    const endDate = now.toISOString().split('T')[0];
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        break;
      case 'quarter':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        break;
      case 'year':
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
    }

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate,
    };
  }

  static validateReportFilters(filters: ReportFilters): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (filters.startDate && filters.endDate) {
      const start = new Date(filters.startDate);
      const end = new Date(filters.endDate);
      
      if (start > end) {
        errors.push('Start date must be before end date');
      }
    }

    if (filters.equipmentIds && filters.equipmentIds.length > 1000) {
      errors.push('Maximum 1000 equipment items can be selected');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}