import { apiClient } from './api';
import { Transaction, TransactionStatus, Equipment, User } from '@shared/types';

export interface TransactionFilters {
  status?: TransactionStatus[];
  equipmentId?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortBy?: 'checkedOutAt' | 'dueDate' | 'returnedAt' | 'equipmentName' | 'userName';
  sortOrder?: 'asc' | 'desc';
}

export interface TransactionListResponse {
  transactions: Transaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface CheckoutData {
  equipmentId: string;
  userId: string;
  dueDate: string;
  notes?: string;
  checkoutLocation?: string;
}

export interface CheckinData {
  transactionId: string;
  returnNotes?: string;
  actualReturnLocation?: string;
  condition?: string;
  damageReport?: {
    description: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    requiresRepair: boolean;
    estimatedCost?: number;
  };
}

export interface BulkCheckoutData {
  equipmentIds: string[];
  userId: string;
  dueDate: string;
  notes?: string;
  checkoutLocation?: string;
}

export interface BulkCheckinData {
  transactionIds: string[];
  returnNotes?: string;
  actualReturnLocation?: string;
  condition?: string;
}

export interface TransactionStatistics {
  totalTransactions: number;
  activeTransactions: number;
  overdueTransactions: number;
  completedTransactions: number;
  averageCheckoutDuration: number;
  topUsers: Array<{
    userId: string;
    userName: string;
    transactionCount: number;
  }>;
  topEquipment: Array<{
    equipmentId: string;
    equipmentName: string;
    transactionCount: number;
  }>;
}

export interface UserTransactionSummary {
  user: User;
  currentTransactions: Transaction[];
  transactionHistory: Transaction[];
  statistics: {
    totalTransactions: number;
    currentlyCheckedOut: number;
    overdue: number;
    averageCheckoutDuration: number;
    totalDamageReports: number;
  };
}

export class TransactionService {
  static async getTransactions(filters: TransactionFilters = {}): Promise<TransactionListResponse> {
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

    return await apiClient.get(`/transactions?${params.toString()}`);
  }

  static async getTransactionById(id: string): Promise<Transaction> {
    return await apiClient.get(`/transactions/${id}`);
  }

  static async checkoutEquipment(data: CheckoutData): Promise<Transaction> {
    return await apiClient.post('/transactions/checkout', data);
  }

  static async checkinEquipment(data: CheckinData): Promise<Transaction> {
    return await apiClient.post('/transactions/checkin', data);
  }

  static async bulkCheckout(data: BulkCheckoutData): Promise<{
    success: boolean;
    transactions: Transaction[];
    failed: Array<{ equipmentId: string; error: string }>;
  }> {
    return await apiClient.post('/transactions/bulk/checkout', data);
  }

  static async bulkCheckin(data: BulkCheckinData): Promise<{
    success: boolean;
    transactions: Transaction[];
    failed: Array<{ transactionId: string; error: string }>;
  }> {
    return await apiClient.post('/transactions/bulk/checkin', data);
  }

  static async updateTransactionStatus(
    id: string,
    status: TransactionStatus,
    notes?: string
  ): Promise<Transaction> {
    return await apiClient.put(`/transactions/${id}/status`, { status, notes });
  }

  static async getEquipmentTransactionHistory(equipmentId: string): Promise<{
    equipment: Equipment;
    transactions: Transaction[];
    totalTransactions: number;
  }> {
    return await apiClient.get(`/transactions/equipment/${equipmentId}`);
  }

  static async getUserTransactionHistory(userId: string): Promise<UserTransactionSummary> {
    return await apiClient.get(`/transactions/user/${userId}`);
  }

  static async getCurrentUserTransactions(): Promise<{
    transactions: Transaction[];
    summary: {
      totalActive: number;
      overdue: number;
      dueSoon: number;
    };
  }> {
    return await apiClient.get('/transactions/my/current');
  }

  static async getTransactionStatistics(filters: TransactionFilters = {}): Promise<TransactionStatistics> {
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

    return await apiClient.get(`/transactions/stats?${params.toString()}`);
  }

  static async updateOverdueTransactions(): Promise<{
    message: string;
    updated: number;
    notified: number;
  }> {
    return await apiClient.post('/transactions/update-overdue');
  }

  static async searchTransactions(query: string, filters: TransactionFilters = {}): Promise<{
    query: string;
    transactions: Transaction[];
    total: number;
  }> {
    return await apiClient.post('/transactions/search', { query, filters });
  }

  static async extendDueDate(transactionId: string, newDueDate: string, reason?: string): Promise<Transaction> {
    return await apiClient.post(`/transactions/${transactionId}/extend`, {
      newDueDate,
      reason,
    });
  }

  static async addTransactionNote(transactionId: string, note: string): Promise<Transaction> {
    return await apiClient.post(`/transactions/${transactionId}/notes`, { note });
  }

  static async getOverdueTransactions(): Promise<{
    transactions: Transaction[];
    count: number;
    totalOverdueDays: number;
  }> {
    return await apiClient.get('/transactions/overdue');
  }

  // Workflow integration
  static async executeStatusTransition(
    equipmentId: string,
    newStatus: string,
    reason?: string,
    metadata?: Record<string, any>
  ): Promise<{
    message: string;
    newStatus: string;
    requiresApproval?: boolean;
    notifications?: string[];
  }> {
    return await apiClient.post(`/transactions/workflow/status/${equipmentId}`, {
      newStatus,
      reason,
      metadata,
    });
  }

  static async getWorkflowTransitions(): Promise<{
    allowedTransitions: Record<string, string[]>;
    rules: {
      overdueThresholdHours: number;
      maintenanceDueDays: number;
      lostThresholdDays: number;
    };
  }> {
    return await apiClient.get('/transactions/workflow/transitions');
  }

  static async getEquipmentWorkflowHistory(equipmentId: string): Promise<{
    equipmentId: string;
    workflowHistory: Array<{
      id: string;
      action: string;
      details: any;
      user: {
        firstName: string;
        lastName: string;
        email: string;
      };
      createdAt: string;
    }>;
    total: number;
  }> {
    return await apiClient.get(`/transactions/workflow/history/${equipmentId}`);
  }

  static async processAutomaticWorkflows(): Promise<{
    message: string;
    result: {
      overdueTransitions: number;
      maintenanceTransitions: number;
    };
  }> {
    return await apiClient.post('/transactions/workflow/auto-process');
  }

  // Utility methods
  static getStatusColor(status: TransactionStatus): string {
    const colors = {
      CHECKED_OUT: 'blue',
      RETURNED: 'green',
      OVERDUE: 'red',
      LOST: 'gray',
      DAMAGED: 'yellow',
    };
    return colors[status] || 'gray';
  }

  static getStatusLabel(status: TransactionStatus): string {
    const labels = {
      CHECKED_OUT: 'Checked Out',
      RETURNED: 'Returned',
      OVERDUE: 'Overdue',
      LOST: 'Lost',
      DAMAGED: 'Damaged',
    };
    return labels[status] || status;
  }

  static isOverdue(transaction: Transaction): boolean {
    if (transaction.status === 'OVERDUE') return true;
    if (transaction.status !== 'CHECKED_OUT') return false;
    
    const dueDate = new Date(transaction.dueDate);
    const now = new Date();
    return now > dueDate;
  }

  static getDaysOverdue(transaction: Transaction): number {
    if (!this.isOverdue(transaction)) return 0;
    
    const dueDate = new Date(transaction.dueDate);
    const now = new Date();
    const diffTime = now.getTime() - dueDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  static getDaysUntilDue(transaction: Transaction): number {
    if (transaction.status !== 'CHECKED_OUT') return 0;
    
    const dueDate = new Date(transaction.dueDate);
    const now = new Date();
    const diffTime = dueDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  static formatCheckoutDuration(transaction: Transaction): string {
    const checkoutDate = new Date(transaction.checkedOutAt);
    const returnDate = transaction.returnedAt ? new Date(transaction.returnedAt) : new Date();
    
    const diffTime = returnDate.getTime() - checkoutDate.getTime();
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (days === 1) return '1 day';
    return `${days} days`;
  }

  static exportTransactions(
    filters: TransactionFilters = {}, 
    format: 'csv' | 'xlsx' = 'csv'
  ): Promise<Blob> {
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

    return apiClient.getRawClient().get(`/transactions/export?${params.toString()}`, {
      responseType: 'blob',
    }).then(response => response.data);
  }
}