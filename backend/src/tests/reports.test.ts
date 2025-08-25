import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { setupTestDb, cleanupTestDb, createTestUser, createTestEquipment, createTestSchool, createTestCategory, createTestLocation } from './setup';
import {
  ReportsService,
  dateRangeSchema,
  equipmentReportSchema,
  utilizationReportSchema,
  financialReportSchema,
  maintenanceReportSchema
} from '@/services/reports';
import { prisma } from '@/index';
import { subDays, subMonths } from 'date-fns';

describe('Reports Service', () => {
  const testSchoolId = 'test-school-reports-id';
  const testOrgId = 'test-org-reports-id';
  let testUserId: string;
  let testCategoryId: string;
  let testLocationId: string;
  let testEquipmentIds: string[] = [];

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await cleanupTestDb();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.maintenanceRequest.deleteMany({ where: { schoolId: testSchoolId } });
    await prisma.transaction.deleteMany({ where: { schoolId: testSchoolId } });
    await prisma.equipment.deleteMany({ where: { schoolId: testSchoolId } });
    await prisma.location.deleteMany({ where: { schoolId: testSchoolId } });
    await prisma.category.deleteMany({ where: { schoolId: testSchoolId } });
    await prisma.user.deleteMany({ where: { schoolId: testSchoolId } });
    await prisma.school.deleteMany({ where: { id: testSchoolId } });

    // Create test school
    await createTestSchool({
      id: testSchoolId,
      name: 'Reports Test School',
      organizationId: testOrgId
    });

    // Create test user
    testUserId = await createTestUser({
      email: 'reports-test@test.com',
      firstName: 'Reports',
      lastName: 'Tester',
      schoolId: testSchoolId,
      organizationId: testOrgId,
      role: 'ADMIN'
    });

    // Create test category
    testCategoryId = await createTestCategory({
      name: 'Test Sports Equipment',
      code: 'TSE',
      schoolId: testSchoolId,
      organizationId: testOrgId,
      createdById: testUserId
    });

    // Create test location
    testLocationId = await createTestLocation({
      name: 'Test Gym',
      code: 'TG',
      schoolId: testSchoolId,
      organizationId: testOrgId,
      createdById: testUserId
    });

    // Create test equipment with various statuses and data
    testEquipmentIds = [];
    
    const equipmentData = [
      { name: 'Basketball 1', code: 'BB1-001', status: 'AVAILABLE', price: 25.00 },
      { name: 'Basketball 2', code: 'BB2-001', status: 'CHECKED_OUT', price: 25.00 },
      { name: 'Tennis Racket 1', code: 'TR1-001', status: 'AVAILABLE', price: 50.00 },
      { name: 'Tennis Racket 2', code: 'TR2-001', status: 'MAINTENANCE', price: 50.00 },
      { name: 'Volleyball Net', code: 'VN-001', status: 'DAMAGED', price: 100.00 }
    ];

    for (const equipment of equipmentData) {
      const equipmentId = await createTestEquipment({
        name: equipment.name,
        code: equipment.code,
        status: equipment.status as any,
        purchasePrice: equipment.price,
        purchaseDate: subDays(new Date(), 30), // 30 days ago
        categoryId: testCategoryId,
        locationId: testLocationId,
        schoolId: testSchoolId,
        organizationId: testOrgId,
        createdById: testUserId
      });
      testEquipmentIds.push(equipmentId);
    }

    // Create some transactions for utilization testing
    await prisma.transaction.createMany({
      data: [
        {
          equipmentId: testEquipmentIds[0], // Basketball 1
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId,
          status: 'RETURNED',
          checkedOutAt: subDays(new Date(), 5),
          returnedAt: subDays(new Date(), 3),
          checkedOutById: testUserId,
          returnedById: testUserId,
          dueDate: new Date()
        },
        {
          equipmentId: testEquipmentIds[1], // Basketball 2
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId,
          status: 'CHECKED_OUT',
          checkedOutAt: subDays(new Date(), 2),
          checkedOutById: testUserId,
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
        },
        {
          equipmentId: testEquipmentIds[2], // Tennis Racket 1
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId,
          status: 'RETURNED',
          checkedOutAt: subDays(new Date(), 10),
          returnedAt: subDays(new Date(), 8),
          checkedOutById: testUserId,
          returnedById: testUserId,
          dueDate: subDays(new Date(), 8)
        }
      ]
    });

    // Create maintenance requests
    await prisma.maintenanceRequest.createMany({
      data: [
        {
          equipmentId: testEquipmentIds[3], // Tennis Racket 2
          requestedById: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId,
          description: 'String needs replacement',
          priority: 'MEDIUM',
          status: 'IN_PROGRESS',
          type: 'REPAIR',
          createdAt: subDays(new Date(), 3)
        },
        {
          equipmentId: testEquipmentIds[4], // Volleyball Net
          requestedById: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId,
          description: 'Net is torn',
          priority: 'HIGH',
          status: 'PENDING',
          type: 'REPAIR',
          createdAt: subDays(new Date(), 1)
        }
      ]
    });
  });

  describe('Schema Validation', () => {
    it('should validate dateRangeSchema correctly', () => {
      const validData = {
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        period: 'month' as const
      };

      expect(() => dateRangeSchema.parse(validData)).not.toThrow();
    });

    it('should validate equipmentReportSchema correctly', () => {
      const validData = {
        period: 'month' as const,
        categoryIds: [testCategoryId],
        locationIds: [testLocationId],
        status: ['AVAILABLE', 'CHECKED_OUT'] as const,
        includeDeleted: false
      };

      expect(() => equipmentReportSchema.parse(validData)).not.toThrow();
    });

    it('should validate utilizationReportSchema correctly', () => {
      const validData = {
        period: 'month' as const,
        equipmentIds: testEquipmentIds.slice(0, 2),
        groupBy: 'equipment' as const
      };

      expect(() => utilizationReportSchema.parse(validData)).not.toThrow();
    });

    it('should validate financialReportSchema correctly', () => {
      const validData = {
        period: 'month' as const,
        includeDepreciation: true,
        groupBy: 'category' as const
      };

      expect(() => financialReportSchema.parse(validData)).not.toThrow();
    });

    it('should validate maintenanceReportSchema correctly', () => {
      const validData = {
        period: 'month' as const,
        status: ['PENDING', 'IN_PROGRESS'] as const,
        priority: ['MEDIUM', 'HIGH'] as const,
        includePreventive: true
      };

      expect(() => maintenanceReportSchema.parse(validData)).not.toThrow();
    });
  });

  describe('Equipment Reports', () => {
    it('should generate basic equipment report', async () => {
      const report = await ReportsService.generateEquipmentReport(
        { period: 'month' },
        testSchoolId,
        testOrgId
      );

      expect(report.summary).toBeDefined();
      expect(report.summary.totalEquipment).toBe(5);
      expect(report.summary.byStatus.AVAILABLE).toBe(2);
      expect(report.summary.byStatus.CHECKED_OUT).toBe(1);
      expect(report.summary.byStatus.MAINTENANCE).toBe(1);
      expect(report.summary.byStatus.DAMAGED).toBe(1);
      expect(report.summary.totalValue).toBe(250); // Sum of all purchase prices
      expect(report.summary.byCategory).toHaveLength(1);
      expect(report.summary.byLocation).toHaveLength(1);

      expect(report.details).toHaveLength(5);
      expect(report.details[0]).toHaveProperty('name');
      expect(report.details[0]).toHaveProperty('code');
      expect(report.details[0]).toHaveProperty('status');
      expect(report.details[0]).toHaveProperty('category');
      expect(report.details[0]).toHaveProperty('location');
      expect(report.details[0]).toHaveProperty('purchasePrice');
      expect(report.details[0]).toHaveProperty('age');
    });

    it('should filter equipment report by status', async () => {
      const report = await ReportsService.generateEquipmentReport(
        { 
          period: 'month',
          status: ['AVAILABLE']
        },
        testSchoolId,
        testOrgId
      );

      expect(report.summary.totalEquipment).toBe(2); // Only available equipment
      expect(report.details).toHaveLength(2);
      expect(report.details.every(eq => eq.status === 'AVAILABLE')).toBe(true);
    });

    it('should filter equipment report by category', async () => {
      const report = await ReportsService.generateEquipmentReport(
        { 
          period: 'month',
          categoryIds: [testCategoryId]
        },
        testSchoolId,
        testOrgId
      );

      expect(report.summary.totalEquipment).toBe(5);
      expect(report.details.every(eq => eq.category === 'Test Sports Equipment')).toBe(true);
    });

    it('should filter equipment report by location', async () => {
      const report = await ReportsService.generateEquipmentReport(
        { 
          period: 'month',
          locationIds: [testLocationId]
        },
        testSchoolId,
        testOrgId
      );

      expect(report.summary.totalEquipment).toBe(5);
      expect(report.details.every(eq => eq.location === 'Test Gym')).toBe(true);
    });
  });

  describe('Utilization Reports', () => {
    it('should generate utilization report', async () => {
      const report = await ReportsService.generateUtilizationReport(
        { period: 'month' },
        testSchoolId,
        testOrgId
      );

      expect(report.summary).toBeDefined();
      expect(report.summary.totalEquipment).toBe(5);
      expect(report.summary.totalTransactions).toBe(3);
      expect(report.summary.averageUtilization).toBeGreaterThanOrEqual(0);
      expect(report.summary.averageCheckoutDuration).toBeGreaterThanOrEqual(0);

      expect(report.metrics).toHaveLength(5);
      expect(report.metrics[0]).toHaveProperty('equipmentId');
      expect(report.metrics[0]).toHaveProperty('equipmentName');
      expect(report.metrics[0]).toHaveProperty('equipmentCode');
      expect(report.metrics[0]).toHaveProperty('totalTransactions');
      expect(report.metrics[0]).toHaveProperty('utilizationRate');
      expect(report.metrics[0]).toHaveProperty('averageCheckoutDuration');
      expect(report.metrics[0]).toHaveProperty('currentStatus');
    });

    it('should filter utilization report by equipment', async () => {
      const report = await ReportsService.generateUtilizationReport(
        { 
          period: 'month',
          equipmentIds: [testEquipmentIds[0], testEquipmentIds[1]]
        },
        testSchoolId,
        testOrgId
      );

      expect(report.summary.totalEquipment).toBe(2);
      expect(report.metrics).toHaveLength(2);
      expect(report.metrics.every(m => 
        [testEquipmentIds[0], testEquipmentIds[1]].includes(m.equipmentId)
      )).toBe(true);
    });

    it('should calculate utilization rates correctly', async () => {
      const report = await ReportsService.generateUtilizationReport(
        { period: 'month' },
        testSchoolId,
        testOrgId
      );

      // Find Basketball 1 which has the returned transaction
      const basketball1 = report.metrics.find(m => m.equipmentName === 'Basketball 1');
      expect(basketball1).toBeDefined();
      expect(basketball1!.totalTransactions).toBe(1);
      expect(basketball1!.utilizationRate).toBeGreaterThan(0);
      expect(basketball1!.averageCheckoutDuration).toBe(2); // 2 days checkout

      // Find Basketball 2 which is currently checked out
      const basketball2 = report.metrics.find(m => m.equipmentName === 'Basketball 2');
      expect(basketball2).toBeDefined();
      expect(basketball2!.totalTransactions).toBe(1);
      expect(basketball2!.currentStatus).toBe('CHECKED_OUT');
    });
  });

  describe('Financial Reports', () => {
    it('should generate financial report', async () => {
      const report = await ReportsService.generateFinancialReport(
        { 
          period: 'month',
          includeDepreciation: true,
          groupBy: 'category'
        },
        testSchoolId,
        testOrgId
      );

      expect(report.totalValue).toBe(250); // Sum of all purchase prices
      expect(report.totalDepreciation).toBeGreaterThan(0); // Should have some depreciation
      expect(report.netValue).toBe(report.totalValue - report.totalDepreciation);
      
      expect(report.byCategory).toHaveLength(1);
      expect(report.byCategory[0].categoryName).toBe('Test Sports Equipment');
      expect(report.byCategory[0].originalValue).toBe(250);
      expect(report.byCategory[0].equipmentCount).toBe(5);
      expect(report.byCategory[0].currentValue).toBeLessThan(report.byCategory[0].originalValue);

      expect(Array.isArray(report.acquisitionTrend)).toBe(true);
    });

    it('should generate financial report without depreciation', async () => {
      const report = await ReportsService.generateFinancialReport(
        { 
          period: 'month',
          includeDepreciation: false,
          groupBy: 'category'
        },
        testSchoolId,
        testOrgId
      );

      expect(report.totalValue).toBe(250);
      expect(report.totalDepreciation).toBe(0);
      expect(report.netValue).toBe(250);
      expect(report.byCategory[0].currentValue).toBe(report.byCategory[0].originalValue);
    });

    it('should calculate acquisition trend correctly', async () => {
      const report = await ReportsService.generateFinancialReport(
        { 
          period: 'month',
          groupBy: 'month'
        },
        testSchoolId,
        testOrgId
      );

      expect(report.acquisitionTrend).toHaveLength(1); // All equipment purchased in same month
      expect(report.acquisitionTrend[0].acquisitionValue).toBe(250);
      expect(report.acquisitionTrend[0].equipmentCount).toBe(5);
    });
  });

  describe('Maintenance Reports', () => {
    it('should generate maintenance report', async () => {
      const report = await ReportsService.generateMaintenanceReport(
        { period: 'month' },
        testSchoolId,
        testOrgId
      );

      expect(report.summary).toBeDefined();
      expect(report.summary.totalRequests).toBe(2);
      expect(report.summary.pendingRequests).toBe(1);
      expect(report.summary.inProgressRequests).toBe(1);
      expect(report.summary.completedRequests).toBe(0);

      expect(report.breakdowns.byStatus.PENDING).toBe(1);
      expect(report.breakdowns.byStatus.IN_PROGRESS).toBe(1);
      expect(report.breakdowns.byPriority.MEDIUM).toBe(1);
      expect(report.breakdowns.byPriority.HIGH).toBe(1);
      expect(report.breakdowns.byEquipmentCategory['Test Sports Equipment']).toBe(2);

      expect(report.details).toHaveLength(2);
      expect(report.details[0]).toHaveProperty('equipmentName');
      expect(report.details[0]).toHaveProperty('description');
      expect(report.details[0]).toHaveProperty('priority');
      expect(report.details[0]).toHaveProperty('status');
    });

    it('should filter maintenance report by status', async () => {
      const report = await ReportsService.generateMaintenanceReport(
        { 
          period: 'month',
          status: ['PENDING']
        },
        testSchoolId,
        testOrgId
      );

      expect(report.summary.totalRequests).toBe(1);
      expect(report.details).toHaveLength(1);
      expect(report.details[0].status).toBe('PENDING');
    });

    it('should filter maintenance report by priority', async () => {
      const report = await ReportsService.generateMaintenanceReport(
        { 
          period: 'month',
          priority: ['HIGH']
        },
        testSchoolId,
        testOrgId
      );

      expect(report.summary.totalRequests).toBe(1);
      expect(report.details).toHaveLength(1);
      expect(report.details[0].priority).toBe('HIGH');
    });
  });

  describe('Dashboard Summary', () => {
    it('should generate dashboard summary', async () => {
      const summary = await ReportsService.generateDashboardSummary(
        testSchoolId,
        testOrgId
      );

      expect(summary.overview).toBeDefined();
      expect(summary.overview.totalEquipment).toBe(5);
      expect(summary.overview.availableEquipment).toBe(2);
      expect(summary.overview.checkedOutEquipment).toBe(1);
      expect(summary.overview.maintenanceEquipment).toBe(1);
      expect(summary.overview.damagedEquipment).toBe(1);
      expect(summary.overview.utilizationRate).toBe(20); // 1 out of 5 checked out

      expect(summary.activity).toBeDefined();
      expect(summary.activity.recentTransactions).toBeGreaterThanOrEqual(0);
      expect(summary.activity.pendingMaintenance).toBe(2);

      expect(Array.isArray(summary.topEquipment)).toBe(true);
      expect(Array.isArray(summary.recentActivity)).toBe(true);
      expect(summary.generatedAt).toBeDefined();
    });
  });

  describe('Custom Reports', () => {
    it('should generate custom equipment usage report', async () => {
      const report = await ReportsService.generateCustomReport(
        {
          reportType: 'equipment_usage',
          filters: { period: 'month' },
          groupBy: 'equipment'
        },
        testSchoolId,
        testOrgId
      );

      expect(report.summary).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(Array.isArray(report.metrics)).toBe(true);
    });

    it('should generate custom financial overview report', async () => {
      const report = await ReportsService.generateCustomReport(
        {
          reportType: 'financial_overview',
          filters: { period: 'month', includeDepreciation: true },
          groupBy: 'category'
        },
        testSchoolId,
        testOrgId
      );

      expect(report.totalValue).toBeDefined();
      expect(report.byCategory).toBeDefined();
      expect(Array.isArray(report.byCategory)).toBe(true);
    });

    it('should generate custom maintenance summary report', async () => {
      const report = await ReportsService.generateCustomReport(
        {
          reportType: 'maintenance_summary',
          filters: { period: 'month' }
        },
        testSchoolId,
        testOrgId
      );

      expect(report.summary).toBeDefined();
      expect(report.details).toBeDefined();
      expect(Array.isArray(report.details)).toBe(true);
    });

    it('should default to equipment report for unknown type', async () => {
      const report = await ReportsService.generateCustomReport(
        {
          reportType: 'unknown_type' as any,
          filters: { period: 'month' }
        },
        testSchoolId,
        testOrgId
      );

      expect(report.summary).toBeDefined();
      expect(report.details).toBeDefined();
      expect(report.summary.totalEquipment).toBe(5);
    });
  });

  describe('Date Range Handling', () => {
    it('should handle different date periods correctly', async () => {
      const periods = ['day', 'week', 'month', 'quarter', 'year'];

      for (const period of periods) {
        const report = await ReportsService.generateEquipmentReport(
          { period: period as any },
          testSchoolId,
          testOrgId
        );

        expect(report.summary).toBeDefined();
        expect(report.summary.totalEquipment).toBe(5);
      }
    });

    it('should handle custom date ranges', async () => {
      const startDate = subMonths(new Date(), 2).toISOString();
      const endDate = new Date().toISOString();

      const report = await ReportsService.generateEquipmentReport(
        { 
          period: 'custom',
          startDate,
          endDate
        },
        testSchoolId,
        testOrgId
      );

      expect(report.summary).toBeDefined();
      expect(report.summary.totalEquipment).toBe(5);
    });
  });

  describe('Multi-tenant Isolation', () => {
    it('should not include equipment from different organization', async () => {
      // Create equipment in different organization
      await createTestEquipment({
        name: 'Different Org Equipment',
        code: 'DOE-001',
        status: 'AVAILABLE',
        schoolId: 'different-school-id',
        organizationId: 'different-org-id',
        createdById: testUserId
      });

      const report = await ReportsService.generateEquipmentReport(
        { period: 'month' },
        testSchoolId,
        testOrgId
      );

      expect(report.summary.totalEquipment).toBe(5); // Only our organization's equipment
    });

    it('should isolate utilization data by organization', async () => {
      // Create transaction in different organization
      const differentOrgEquipmentId = await createTestEquipment({
        name: 'Different Org Equipment',
        code: 'DOE-002',
        status: 'CHECKED_OUT',
        schoolId: 'different-school-id-2',
        organizationId: 'different-org-id-2',
        createdById: testUserId
      });

      const report = await ReportsService.generateUtilizationReport(
        { period: 'month' },
        testSchoolId,
        testOrgId
      );

      expect(report.summary.totalEquipment).toBe(5);
      expect(report.metrics.every(m => m.equipmentId !== differentOrgEquipmentId)).toBe(true);
    });

    it('should isolate dashboard summary by organization', async () => {
      const summary = await ReportsService.generateDashboardSummary(
        testSchoolId,
        testOrgId
      );

      expect(summary.overview.totalEquipment).toBe(5);
      expect(summary.activity.pendingMaintenance).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid filters gracefully', async () => {
      const report = await ReportsService.generateEquipmentReport(
        { 
          period: 'month',
          categoryIds: ['non-existent-category-id']
        },
        testSchoolId,
        testOrgId
      );

      expect(report.summary.totalEquipment).toBe(0);
      expect(report.details).toHaveLength(0);
    });

    it('should handle empty data sets', async () => {
      // Clean up all equipment
      await prisma.equipment.deleteMany({ where: { schoolId: testSchoolId } });

      const report = await ReportsService.generateEquipmentReport(
        { period: 'month' },
        testSchoolId,
        testOrgId
      );

      expect(report.summary.totalEquipment).toBe(0);
      expect(report.summary.totalValue).toBe(0);
      expect(report.summary.averageAge).toBe(0);
      expect(report.details).toHaveLength(0);
    });

    it('should handle missing price data in financial reports', async () => {
      // Create equipment without purchase price
      await createTestEquipment({
        name: 'No Price Equipment',
        code: 'NPE-001',
        status: 'AVAILABLE',
        purchasePrice: null,
        categoryId: testCategoryId,
        schoolId: testSchoolId,
        organizationId: testOrgId,
        createdById: testUserId
      });

      const report = await ReportsService.generateFinancialReport(
        { period: 'month' },
        testSchoolId,
        testOrgId
      );

      expect(report.totalValue).toBe(250); // Should not include null prices
      expect(report.byCategory[0].equipmentCount).toBe(5); // Should still count equipment
    });
  });

  describe('Performance and Caching', () => {
    it('should handle large datasets efficiently', async () => {
      // This test would be more meaningful with a large dataset
      // For now, we'll verify it completes in reasonable time
      const start = Date.now();
      
      const report = await ReportsService.generateEquipmentReport(
        { period: 'year' },
        testSchoolId,
        testOrgId
      );

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(report.summary).toBeDefined();
    });
  });
});