import { z } from 'zod';
import { prisma } from '@/index';
import { logger } from '@/utils/logger';
import { startOfDay, endOfDay, subDays, subWeeks, subMonths, format } from 'date-fns';

// Validation schemas
export const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  period: z.enum(['day', 'week', 'month', 'quarter', 'year', 'custom']).optional().default('month'),
});

export const equipmentReportSchema = z.object({
  ...dateRangeSchema.shape,
  categoryIds: z.array(z.string().uuid()).optional(),
  locationIds: z.array(z.string().uuid()).optional(),
  status: z.array(z.enum(['AVAILABLE', 'CHECKED_OUT', 'MAINTENANCE', 'DAMAGED', 'LOST', 'RETIRED', 'RESERVED', 'OVERDUE'])).optional(),
  includeDeleted: z.boolean().optional().default(false),
});

export const utilizationReportSchema = z.object({
  ...dateRangeSchema.shape,
  equipmentIds: z.array(z.string().uuid()).optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  groupBy: z.enum(['equipment', 'category', 'location', 'user']).optional().default('equipment'),
});

export const financialReportSchema = z.object({
  ...dateRangeSchema.shape,
  includeDepreciation: z.boolean().optional().default(true),
  groupBy: z.enum(['category', 'location', 'month', 'quarter']).optional().default('category'),
});

export const maintenanceReportSchema = z.object({
  ...dateRangeSchema.shape,
  status: z.array(z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])).optional(),
  priority: z.array(z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])).optional(),
  includePreventive: z.boolean().optional().default(true),
});

interface DateRange {
  startDate: Date;
  endDate: Date;
}

interface EquipmentSummary {
  totalEquipment: number;
  byStatus: Record<string, number>;
  byCategory: Array<{ categoryId: string; categoryName: string; count: number; value: number }>;
  byLocation: Array<{ locationId: string; locationName: string; count: number }>;
  totalValue: number;
  averageAge: number;
}

interface UtilizationMetrics {
  equipmentId: string;
  equipmentName: string;
  equipmentCode: string;
  totalTransactions: number;
  totalDaysCheckedOut: number;
  utilizationRate: number;
  averageCheckoutDuration: number;
  currentStatus: string;
  lastUsed?: Date;
  mostFrequentUser?: string;
}

interface FinancialSummary {
  totalValue: number;
  totalDepreciation: number;
  netValue: number;
  byCategory: Array<{
    categoryName: string;
    originalValue: number;
    currentValue: number;
    depreciationAmount: number;
    equipmentCount: number;
  }>;
  acquisitionTrend: Array<{
    period: string;
    acquisitionValue: number;
    equipmentCount: number;
  }>;
}

/**
 * Reports and Analytics Service
 */
export class ReportsService {
  /**
   * Generate equipment inventory report
   */
  static async generateEquipmentReport(
    filters: z.infer<typeof equipmentReportSchema>,
    schoolId: string,
    organizationId: string
  ): Promise<{ summary: EquipmentSummary; details: any[] }> {
    try {
      const validatedFilters = equipmentReportSchema.parse(filters);
      const dateRange = this.calculateDateRange(validatedFilters.period, validatedFilters.startDate, validatedFilters.endDate);

      // Build equipment query
      const whereClause = this.buildEquipmentWhereClause(validatedFilters, schoolId, organizationId, dateRange);

      // Get equipment with details
      const equipment = await prisma.equipment.findMany({
        where: whereClause,
        include: {
          category: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
          transactions: {
            where: {
              createdAt: { gte: dateRange.startDate, lte: dateRange.endDate }
            },
            select: { id: true, status: true, createdAt: true }
          },
          maintenanceRequests: {
            where: {
              createdAt: { gte: dateRange.startDate, lte: dateRange.endDate }
            },
            select: { id: true, status: true, priority: true, createdAt: true }
          }
        },
        orderBy: { name: 'asc' }
      });

      // Generate summary statistics
      const summary = this.generateEquipmentSummary(equipment);

      return {
        summary,
        details: equipment.map(eq => ({
          id: eq.id,
          name: eq.name,
          code: eq.code,
          status: eq.status,
          category: eq.category?.name,
          location: eq.location?.name,
          purchasePrice: eq.purchasePrice,
          purchaseDate: eq.purchaseDate,
          age: eq.purchaseDate ? Math.floor((Date.now() - eq.purchaseDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null,
          transactionCount: eq.transactions.length,
          maintenanceCount: eq.maintenanceRequests.length,
          lastTransaction: eq.transactions[eq.transactions.length - 1]?.createdAt,
          createdAt: eq.createdAt,
          updatedAt: eq.updatedAt
        }))
      };
    } catch (error) {
      logger.error('Equipment report generation error:', error);
      throw error;
    }
  }

  /**
   * Generate equipment utilization report
   */
  static async generateUtilizationReport(
    filters: z.infer<typeof utilizationReportSchema>,
    schoolId: string,
    organizationId: string
  ): Promise<{ summary: any; metrics: UtilizationMetrics[] }> {
    try {
      const validatedFilters = utilizationReportSchema.parse(filters);
      const dateRange = this.calculateDateRange(validatedFilters.period, validatedFilters.startDate, validatedFilters.endDate);

      // Get utilization data
      const utilizationData = await this.calculateUtilizationMetrics(
        validatedFilters,
        dateRange,
        schoolId,
        organizationId
      );

      const summary = {
        totalEquipment: utilizationData.length,
        averageUtilization: utilizationData.reduce((sum, item) => sum + item.utilizationRate, 0) / utilizationData.length || 0,
        highUtilization: utilizationData.filter(item => item.utilizationRate > 70).length,
        mediumUtilization: utilizationData.filter(item => item.utilizationRate >= 30 && item.utilizationRate <= 70).length,
        lowUtilization: utilizationData.filter(item => item.utilizationRate < 30).length,
        totalTransactions: utilizationData.reduce((sum, item) => sum + item.totalTransactions, 0),
        averageCheckoutDuration: utilizationData.reduce((sum, item) => sum + item.averageCheckoutDuration, 0) / utilizationData.length || 0,
        dateRange
      };

      return {
        summary,
        metrics: utilizationData.sort((a, b) => b.utilizationRate - a.utilizationRate)
      };
    } catch (error) {
      logger.error('Utilization report generation error:', error);
      throw error;
    }
  }

  /**
   * Generate financial report
   */
  static async generateFinancialReport(
    filters: z.infer<typeof financialReportSchema>,
    schoolId: string,
    organizationId: string
  ): Promise<FinancialSummary> {
    try {
      const validatedFilters = financialReportSchema.parse(filters);
      const dateRange = this.calculateDateRange(validatedFilters.period, validatedFilters.startDate, validatedFilters.endDate);

      // Get equipment with financial data
      const equipment = await prisma.equipment.findMany({
        where: {
          OR: [{ schoolId }, { organizationId, schoolId: null }],
          isDeleted: false,
          purchaseDate: {
            gte: dateRange.startDate,
            lte: dateRange.endDate
          }
        },
        include: {
          category: { select: { name: true } }
        }
      });

      const totalValue = equipment.reduce((sum, eq) => sum + (eq.purchasePrice || 0), 0);
      
      // Calculate depreciation
      let totalDepreciation = 0;
      if (validatedFilters.includeDepreciation) {
        totalDepreciation = equipment.reduce((sum, eq) => {
          if (!eq.purchasePrice || !eq.purchaseDate) return sum;
          
          const age = Math.floor((Date.now() - eq.purchaseDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
          const depreciationRate = 0.15; // 15% per year
          const depreciation = Math.min(eq.purchasePrice * depreciationRate * age, eq.purchasePrice * 0.8);
          
          return sum + depreciation;
        }, 0);
      }

      // Group by category
      const byCategory = equipment.reduce((acc, eq) => {
        const categoryName = eq.category?.name || 'Uncategorized';
        if (!acc[categoryName]) {
          acc[categoryName] = {
            categoryName,
            originalValue: 0,
            currentValue: 0,
            depreciationAmount: 0,
            equipmentCount: 0
          };
        }
        
        const price = eq.purchasePrice || 0;
        acc[categoryName].originalValue += price;
        acc[categoryName].equipmentCount += 1;
        
        if (validatedFilters.includeDepreciation && eq.purchaseDate) {
          const age = Math.floor((Date.now() - eq.purchaseDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
          const depreciationRate = 0.15;
          const depreciation = Math.min(price * depreciationRate * age, price * 0.8);
          acc[categoryName].depreciationAmount += depreciation;
          acc[categoryName].currentValue += price - depreciation;
        } else {
          acc[categoryName].currentValue += price;
        }
        
        return acc;
      }, {} as Record<string, any>);

      // Generate acquisition trend
      const acquisitionTrend = await this.calculateAcquisitionTrend(equipment, validatedFilters.groupBy, dateRange);

      return {
        totalValue,
        totalDepreciation,
        netValue: totalValue - totalDepreciation,
        byCategory: Object.values(byCategory),
        acquisitionTrend
      };
    } catch (error) {
      logger.error('Financial report generation error:', error);
      throw error;
    }
  }

  /**
   * Generate maintenance report
   */
  static async generateMaintenanceReport(
    filters: z.infer<typeof maintenanceReportSchema>,
    schoolId: string,
    organizationId: string
  ): Promise<any> {
    try {
      const validatedFilters = maintenanceReportSchema.parse(filters);
      const dateRange = this.calculateDateRange(validatedFilters.period, validatedFilters.startDate, validatedFilters.endDate);

      const whereClause: any = {
        OR: [{ schoolId }, { organizationId, schoolId: null }],
        createdAt: { gte: dateRange.startDate, lte: dateRange.endDate }
      };

      if (validatedFilters.status?.length) {
        whereClause.status = { in: validatedFilters.status };
      }

      if (validatedFilters.priority?.length) {
        whereClause.priority = { in: validatedFilters.priority };
      }

      const maintenanceRequests = await prisma.maintenanceRequest.findMany({
        where: whereClause,
        include: {
          equipment: { select: { id: true, name: true, code: true, category: { select: { name: true } } } },
          requestedBy: { select: { firstName: true, lastName: true } },
          assignedTo: { select: { firstName: true, lastName: true } }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Calculate metrics
      const totalRequests = maintenanceRequests.length;
      const byStatus = maintenanceRequests.reduce((acc, req) => {
        acc[req.status] = (acc[req.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const byPriority = maintenanceRequests.reduce((acc, req) => {
        acc[req.priority] = (acc[req.priority] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const byEquipmentCategory = maintenanceRequests.reduce((acc, req) => {
        const category = req.equipment?.category?.name || 'Uncategorized';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Calculate average resolution time for completed requests
      const completedRequests = maintenanceRequests.filter(req => req.status === 'COMPLETED' && req.completedAt);
      const averageResolutionTime = completedRequests.length > 0
        ? completedRequests.reduce((sum, req) => {
            const duration = req.completedAt!.getTime() - req.createdAt.getTime();
            return sum + duration;
          }, 0) / completedRequests.length / (24 * 60 * 60 * 1000) // Convert to days
        : 0;

      // Preventive vs reactive maintenance
      const preventiveCount = maintenanceRequests.filter(req => req.type === 'PREVENTIVE').length;
      const reactiveCount = totalRequests - preventiveCount;

      return {
        summary: {
          totalRequests,
          completedRequests: byStatus.COMPLETED || 0,
          pendingRequests: byStatus.PENDING || 0,
          inProgressRequests: byStatus.IN_PROGRESS || 0,
          cancelledRequests: byStatus.CANCELLED || 0,
          averageResolutionTime: Math.round(averageResolutionTime * 10) / 10,
          preventiveCount,
          reactiveCount,
          preventivePercentage: totalRequests > 0 ? Math.round((preventiveCount / totalRequests) * 100) : 0,
          dateRange
        },
        breakdowns: {
          byStatus,
          byPriority,
          byEquipmentCategory
        },
        details: maintenanceRequests.map(req => ({
          id: req.id,
          equipmentName: req.equipment?.name,
          equipmentCode: req.equipment?.code,
          category: req.equipment?.category?.name,
          description: req.description,
          priority: req.priority,
          status: req.status,
          type: req.type,
          requestedBy: `${req.requestedBy?.firstName} ${req.requestedBy?.lastName}`,
          assignedTo: req.assignedTo ? `${req.assignedTo.firstName} ${req.assignedTo.lastName}` : null,
          createdAt: req.createdAt,
          dueDate: req.dueDate,
          completedAt: req.completedAt,
          resolutionTime: req.completedAt 
            ? Math.round((req.completedAt.getTime() - req.createdAt.getTime()) / (24 * 60 * 60 * 1000) * 10) / 10
            : null
        }))
      };
    } catch (error) {
      logger.error('Maintenance report generation error:', error);
      throw error;
    }
  }

  /**
   * Generate dashboard summary statistics
   */
  static async generateDashboardSummary(schoolId: string, organizationId: string): Promise<any> {
    try {
      const now = new Date();
      const thirtyDaysAgo = subDays(now, 30);
      const sevenDaysAgo = subDays(now, 7);

      // Get basic counts
      const [
        totalEquipment,
        availableEquipment,
        checkedOutEquipment,
        overdueEquipment,
        maintenanceEquipment,
        damagedEquipment,
        recentTransactions,
        pendingMaintenance,
        recentlyAdded
      ] = await Promise.all([
        // Total equipment
        prisma.equipment.count({
          where: {
            OR: [{ schoolId }, { organizationId, schoolId: null }],
            isDeleted: false
          }
        }),

        // Available equipment
        prisma.equipment.count({
          where: {
            OR: [{ schoolId }, { organizationId, schoolId: null }],
            isDeleted: false,
            status: 'AVAILABLE'
          }
        }),

        // Checked out equipment
        prisma.equipment.count({
          where: {
            OR: [{ schoolId }, { organizationId, schoolId: null }],
            isDeleted: false,
            status: 'CHECKED_OUT'
          }
        }),

        // Overdue equipment
        prisma.equipment.count({
          where: {
            OR: [{ schoolId }, { organizationId, schoolId: null }],
            isDeleted: false,
            status: 'OVERDUE'
          }
        }),

        // Maintenance equipment
        prisma.equipment.count({
          where: {
            OR: [{ schoolId }, { organizationId, schoolId: null }],
            isDeleted: false,
            status: 'MAINTENANCE'
          }
        }),

        // Damaged equipment
        prisma.equipment.count({
          where: {
            OR: [{ schoolId }, { organizationId, schoolId: null }],
            isDeleted: false,
            status: 'DAMAGED'
          }
        }),

        // Recent transactions (last 7 days)
        prisma.transaction.count({
          where: {
            OR: [{ schoolId }, { organizationId, schoolId: null }],
            createdAt: { gte: sevenDaysAgo }
          }
        }),

        // Pending maintenance requests
        prisma.maintenanceRequest.count({
          where: {
            OR: [{ schoolId }, { organizationId, schoolId: null }],
            status: { in: ['PENDING', 'IN_PROGRESS'] }
          }
        }),

        // Recently added equipment (last 30 days)
        prisma.equipment.count({
          where: {
            OR: [{ schoolId }, { organizationId, schoolId: null }],
            isDeleted: false,
            createdAt: { gte: thirtyDaysAgo }
          }
        })
      ]);

      // Calculate utilization rate
      const utilizationRate = totalEquipment > 0 ? Math.round((checkedOutEquipment / totalEquipment) * 100) : 0;

      // Get top equipment by transaction count
      const topEquipment = await prisma.equipment.findMany({
        where: {
          OR: [{ schoolId }, { organizationId, schoolId: null }],
          isDeleted: false
        },
        include: {
          transactions: {
            where: { createdAt: { gte: thirtyDaysAgo } },
            select: { id: true }
          },
          _count: { select: { transactions: true } }
        },
        orderBy: { transactions: { _count: 'desc' } },
        take: 5
      });

      // Get recent activity
      const recentActivity = await prisma.transaction.findMany({
        where: {
          OR: [{ schoolId }, { organizationId, schoolId: null }],
          createdAt: { gte: sevenDaysAgo }
        },
        include: {
          equipment: { select: { name: true, code: true } },
          user: { select: { firstName: true, lastName: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      // Calculate trends (compare with previous period)
      const previousPeriodStart = subDays(thirtyDaysAgo, 30);
      const previousTransactions = await prisma.transaction.count({
        where: {
          OR: [{ schoolId }, { organizationId, schoolId: null }],
          createdAt: { gte: previousPeriodStart, lt: thirtyDaysAgo }
        }
      });

      const transactionTrend = previousTransactions > 0
        ? Math.round(((recentTransactions - previousTransactions) / previousTransactions) * 100)
        : 0;

      return {
        overview: {
          totalEquipment,
          availableEquipment,
          checkedOutEquipment,
          overdueEquipment,
          maintenanceEquipment,
          damagedEquipment,
          utilizationRate,
          recentlyAdded
        },
        activity: {
          recentTransactions,
          pendingMaintenance,
          transactionTrend
        },
        topEquipment: topEquipment.map(eq => ({
          id: eq.id,
          name: eq.name,
          code: eq.code,
          recentTransactions: eq.transactions.length,
          totalTransactions: eq._count.transactions
        })),
        recentActivity: recentActivity.map(transaction => ({
          id: transaction.id,
          type: transaction.status,
          equipmentName: transaction.equipment?.name,
          equipmentCode: transaction.equipment?.code,
          userName: `${transaction.user?.firstName} ${transaction.user?.lastName}`,
          createdAt: transaction.createdAt
        })),
        generatedAt: now
      };
    } catch (error) {
      logger.error('Dashboard summary generation error:', error);
      throw error;
    }
  }

  /**
   * Generate custom report based on provided configuration
   */
  static async generateCustomReport(
    config: any,
    schoolId: string,
    organizationId: string
  ): Promise<any> {
    try {
      // This would be a flexible report generator based on user-defined criteria
      // Implementation depends on specific requirements
      const { reportType, filters, groupBy, metrics, chartType } = config;

      switch (reportType) {
        case 'equipment_usage':
          return await this.generateUtilizationReport(filters, schoolId, organizationId);
        
        case 'financial_overview':
          return await this.generateFinancialReport(filters, schoolId, organizationId);
        
        case 'maintenance_summary':
          return await this.generateMaintenanceReport(filters, schoolId, organizationId);
        
        default:
          return await this.generateEquipmentReport(filters, schoolId, organizationId);
      }
    } catch (error) {
      logger.error('Custom report generation error:', error);
      throw error;
    }
  }

  /**
   * Calculate date range based on period
   */
  private static calculateDateRange(period: string, startDate?: string, endDate?: string): DateRange {
    const now = new Date();

    if (period === 'custom' && startDate && endDate) {
      return {
        startDate: startOfDay(new Date(startDate)),
        endDate: endOfDay(new Date(endDate))
      };
    }

    switch (period) {
      case 'day':
        return {
          startDate: startOfDay(now),
          endDate: endOfDay(now)
        };
      
      case 'week':
        return {
          startDate: startOfDay(subWeeks(now, 1)),
          endDate: endOfDay(now)
        };
      
      case 'month':
        return {
          startDate: startOfDay(subMonths(now, 1)),
          endDate: endOfDay(now)
        };
      
      case 'quarter':
        return {
          startDate: startOfDay(subMonths(now, 3)),
          endDate: endOfDay(now)
        };
      
      case 'year':
        return {
          startDate: startOfDay(subMonths(now, 12)),
          endDate: endOfDay(now)
        };
      
      default:
        return {
          startDate: startOfDay(subMonths(now, 1)),
          endDate: endOfDay(now)
        };
    }
  }

  /**
   * Build equipment WHERE clause for database queries
   */
  private static buildEquipmentWhereClause(filters: any, schoolId: string, organizationId: string, dateRange: DateRange): any {
    const whereClause: any = {
      OR: [{ schoolId }, { organizationId, schoolId: null }],
      isDeleted: filters.includeDeleted ? undefined : false
    };

    if (filters.categoryIds?.length) {
      whereClause.categoryId = { in: filters.categoryIds };
    }

    if (filters.locationIds?.length) {
      whereClause.locationId = { in: filters.locationIds };
    }

    if (filters.status?.length) {
      whereClause.status = { in: filters.status };
    }

    return whereClause;
  }

  /**
   * Generate equipment summary statistics
   */
  private static generateEquipmentSummary(equipment: any[]): EquipmentSummary {
    const totalEquipment = equipment.length;
    const totalValue = equipment.reduce((sum, eq) => sum + (eq.purchasePrice || 0), 0);

    // Status breakdown
    const byStatus = equipment.reduce((acc, eq) => {
      acc[eq.status] = (acc[eq.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Category breakdown
    const categoryMap = equipment.reduce((acc, eq) => {
      const categoryId = eq.category?.id || 'uncategorized';
      const categoryName = eq.category?.name || 'Uncategorized';
      
      if (!acc[categoryId]) {
        acc[categoryId] = {
          categoryId,
          categoryName,
          count: 0,
          value: 0
        };
      }
      
      acc[categoryId].count += 1;
      acc[categoryId].value += eq.purchasePrice || 0;
      
      return acc;
    }, {} as Record<string, any>);

    const byCategory = Object.values(categoryMap);

    // Location breakdown
    const locationMap = equipment.reduce((acc, eq) => {
      const locationId = eq.location?.id || 'unassigned';
      const locationName = eq.location?.name || 'Unassigned';
      
      if (!acc[locationId]) {
        acc[locationId] = {
          locationId,
          locationName,
          count: 0
        };
      }
      
      acc[locationId].count += 1;
      
      return acc;
    }, {} as Record<string, any>);

    const byLocation = Object.values(locationMap);

    // Calculate average age
    const equipmentWithAge = equipment.filter(eq => eq.purchaseDate);
    const averageAge = equipmentWithAge.length > 0
      ? equipmentWithAge.reduce((sum, eq) => {
          const age = Math.floor((Date.now() - eq.purchaseDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
          return sum + age;
        }, 0) / equipmentWithAge.length
      : 0;

    return {
      totalEquipment,
      byStatus,
      byCategory,
      byLocation,
      totalValue,
      averageAge: Math.round(averageAge * 10) / 10
    };
  }

  /**
   * Calculate equipment utilization metrics
   */
  private static async calculateUtilizationMetrics(
    filters: any,
    dateRange: DateRange,
    schoolId: string,
    organizationId: string
  ): Promise<UtilizationMetrics[]> {
    const equipment = await prisma.equipment.findMany({
      where: {
        OR: [{ schoolId }, { organizationId, schoolId: null }],
        isDeleted: false,
        ...(filters.equipmentIds?.length && { id: { in: filters.equipmentIds } }),
        ...(filters.categoryIds?.length && { categoryId: { in: filters.categoryIds } })
      },
      include: {
        transactions: {
          where: {
            createdAt: { gte: dateRange.startDate, lte: dateRange.endDate }
          },
          include: {
            user: { select: { firstName: true, lastName: true } }
          }
        }
      }
    });

    const periodDays = Math.floor((dateRange.endDate.getTime() - dateRange.startDate.getTime()) / (24 * 60 * 60 * 1000));

    return equipment.map(eq => {
      const transactions = eq.transactions;
      const totalTransactions = transactions.length;

      // Calculate total days checked out
      const totalDaysCheckedOut = transactions.reduce((sum, transaction) => {
        const checkoutDate = transaction.checkedOutAt;
        const returnDate = transaction.returnedAt || new Date();
        const duration = Math.floor((returnDate.getTime() - checkoutDate.getTime()) / (24 * 60 * 60 * 1000));
        return sum + Math.max(0, duration);
      }, 0);

      // Calculate utilization rate
      const utilizationRate = periodDays > 0 ? Math.round((totalDaysCheckedOut / periodDays) * 100) : 0;

      // Calculate average checkout duration
      const completedTransactions = transactions.filter(t => t.returnedAt);
      const averageCheckoutDuration = completedTransactions.length > 0
        ? completedTransactions.reduce((sum, t) => {
            const duration = Math.floor((t.returnedAt!.getTime() - t.checkedOutAt.getTime()) / (24 * 60 * 60 * 1000));
            return sum + duration;
          }, 0) / completedTransactions.length
        : 0;

      // Find most frequent user
      const userFrequency = transactions.reduce((acc, t) => {
        const userName = `${t.user?.firstName} ${t.user?.lastName}`;
        acc[userName] = (acc[userName] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const mostFrequentUser = Object.entries(userFrequency)
        .sort(([,a], [,b]) => b - a)[0]?.[0];

      // Find last used date
      const lastUsed = transactions.length > 0
        ? new Date(Math.max(...transactions.map(t => t.checkedOutAt.getTime())))
        : undefined;

      return {
        equipmentId: eq.id,
        equipmentName: eq.name,
        equipmentCode: eq.code,
        totalTransactions,
        totalDaysCheckedOut,
        utilizationRate: Math.min(100, utilizationRate), // Cap at 100%
        averageCheckoutDuration: Math.round(averageCheckoutDuration * 10) / 10,
        currentStatus: eq.status,
        lastUsed,
        mostFrequentUser
      };
    });
  }

  /**
   * Calculate acquisition trend for financial reports
   */
  private static async calculateAcquisitionTrend(equipment: any[], groupBy: string, dateRange: DateRange): Promise<any[]> {
    const trendData = equipment.reduce((acc, eq) => {
      if (!eq.purchaseDate || !eq.purchasePrice) return acc;

      let periodKey: string;
      
      switch (groupBy) {
        case 'month':
          periodKey = format(eq.purchaseDate, 'yyyy-MM');
          break;
        case 'quarter':
          const quarter = Math.floor(eq.purchaseDate.getMonth() / 3) + 1;
          periodKey = `${eq.purchaseDate.getFullYear()}-Q${quarter}`;
          break;
        default:
          periodKey = format(eq.purchaseDate, 'yyyy-MM');
      }

      if (!acc[periodKey]) {
        acc[periodKey] = {
          period: periodKey,
          acquisitionValue: 0,
          equipmentCount: 0
        };
      }

      acc[periodKey].acquisitionValue += eq.purchasePrice;
      acc[periodKey].equipmentCount += 1;

      return acc;
    }, {} as Record<string, any>);

    return Object.values(trendData).sort((a: any, b: any) => a.period.localeCompare(b.period));
  }
}