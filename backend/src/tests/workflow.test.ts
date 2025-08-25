import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest';
import { setupTestDb, cleanupTestDb, createTestUser, createTestEquipment } from './setup';
import {
  executeStatusTransition,
  processAutomaticTransitions,
  getEquipmentWorkflowHistory,
  validateWorkflowRules,
  isTransitionAllowed,
  ALLOWED_TRANSITIONS,
  AUTO_TRANSITION_RULES
} from '@/services/workflow';
import { prisma } from '@/index';
import { EquipmentStatus } from '@prisma/client';

describe('Workflow Service', () => {
  const testSchoolId = 'test-school-id';
  const testOrgId = 'test-org-id';
  let testUserId: string;
  let testEquipmentId: string;

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await cleanupTestDb();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.auditLog.deleteMany({ where: { schoolId: testSchoolId } });
    await prisma.transaction.deleteMany({ where: { schoolId: testSchoolId } });
    await prisma.equipment.deleteMany({ where: { schoolId: testSchoolId } });
    await prisma.user.deleteMany({ where: { schoolId: testSchoolId } });

    // Create test user and equipment
    testUserId = await createTestUser({
      email: 'workflow-test@test.com',
      firstName: 'Workflow',
      lastName: 'Tester',
      schoolId: testSchoolId,
      organizationId: testOrgId,
      role: 'STAFF'
    });

    testEquipmentId = await createTestEquipment({
      name: 'Workflow Test Equipment',
      code: 'WTE-001',
      status: 'AVAILABLE',
      schoolId: testSchoolId,
      organizationId: testOrgId,
      createdById: testUserId
    });
  });

  describe('Status Transitions', () => {
    it('should allow valid status transitions', () => {
      expect(isTransitionAllowed('AVAILABLE', 'CHECKED_OUT')).toBe(true);
      expect(isTransitionAllowed('CHECKED_OUT', 'AVAILABLE')).toBe(true);
      expect(isTransitionAllowed('AVAILABLE', 'MAINTENANCE')).toBe(true);
      expect(isTransitionAllowed('MAINTENANCE', 'AVAILABLE')).toBe(true);
    });

    it('should reject invalid status transitions', () => {
      expect(isTransitionAllowed('RETIRED', 'AVAILABLE')).toBe(false);
      expect(isTransitionAllowed('AVAILABLE', 'OVERDUE')).toBe(false);
      expect(isTransitionAllowed('RESERVED', 'OVERDUE')).toBe(false);
    });

    it('should execute valid status transition', async () => {
      const result = await executeStatusTransition(
        testEquipmentId,
        'CHECKED_OUT',
        {
          equipmentId: testEquipmentId,
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId,
          reason: 'Test checkout'
        }
      );

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('CHECKED_OUT');
      expect(result.message).toContain('Equipment status updated');

      // Verify equipment status was updated
      const equipment = await prisma.equipment.findUnique({
        where: { id: testEquipmentId }
      });
      expect(equipment?.status).toBe('CHECKED_OUT');

      // Verify audit log was created
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          entityType: 'EQUIPMENT',
          entityId: testEquipmentId,
          action: 'STATUS_CHANGE'
        }
      });
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].details).toMatchObject({
        previousStatus: 'AVAILABLE',
        newStatus: 'CHECKED_OUT',
        reason: 'Test checkout'
      });
    });

    it('should reject invalid status transition', async () => {
      const result = await executeStatusTransition(
        testEquipmentId,
        'OVERDUE',
        {
          equipmentId: testEquipmentId,
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId
        }
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Transition from AVAILABLE to OVERDUE is not allowed');

      // Verify equipment status was not changed
      const equipment = await prisma.equipment.findUnique({
        where: { id: testEquipmentId }
      });
      expect(equipment?.status).toBe('AVAILABLE');
    });

    it('should handle equipment not found', async () => {
      const result = await executeStatusTransition(
        'non-existent-id',
        'CHECKED_OUT',
        {
          equipmentId: 'non-existent-id',
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId
        }
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('Equipment not found');
    });
  });

  describe('Business Rules', () => {
    it('should require reason for damaged equipment', async () => {
      const result = await executeStatusTransition(
        testEquipmentId,
        'DAMAGED',
        {
          equipmentId: testEquipmentId,
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId
          // No reason provided
        }
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Reason is required when marking equipment as damaged');
    });

    it('should allow damaged equipment with reason', async () => {
      const result = await executeStatusTransition(
        testEquipmentId,
        'DAMAGED',
        {
          equipmentId: testEquipmentId,
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId,
          reason: 'Broken during use'
        }
      );

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('DAMAGED');

      // Verify damage report was created
      const damageReport = await prisma.damageReport.findFirst({
        where: { equipmentId: testEquipmentId }
      });
      expect(damageReport).toBeTruthy();
      expect(damageReport?.description).toBe('Broken during use');
    });

    it('should require approval for high-value lost equipment', async () => {
      // Update equipment with high purchase price
      await prisma.equipment.update({
        where: { id: testEquipmentId },
        data: { purchasePrice: 1000 }
      });

      const result = await executeStatusTransition(
        testEquipmentId,
        'LOST',
        {
          equipmentId: testEquipmentId,
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId,
          reason: 'Cannot locate equipment'
        }
      );

      expect(result.success).toBe(true);
      expect(result.requiresApproval).toBe(true);
      expect(result.message).toContain('requires management approval');
    });

    it('should require approval for retirement', async () => {
      const result = await executeStatusTransition(
        testEquipmentId,
        'RETIRED',
        {
          equipmentId: testEquipmentId,
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId,
          reason: 'End of lifecycle'
        }
      );

      expect(result.success).toBe(true);
      expect(result.requiresApproval).toBe(true);
      expect(result.message).toContain('requires approval');
    });
  });

  describe('Status-Specific Logic', () => {
    it('should create maintenance request when transitioning to maintenance', async () => {
      const result = await executeStatusTransition(
        testEquipmentId,
        'MAINTENANCE',
        {
          equipmentId: testEquipmentId,
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId,
          reason: 'Scheduled maintenance'
        }
      );

      expect(result.success).toBe(true);

      // Verify maintenance request was created
      const maintenanceRequest = await prisma.maintenanceRequest.findFirst({
        where: { equipmentId: testEquipmentId }
      });
      expect(maintenanceRequest).toBeTruthy();
      expect(maintenanceRequest?.description).toBe('Scheduled maintenance');
      expect(maintenanceRequest?.status).toBe('PENDING');
    });

    it('should update retirement fields when retiring equipment', async () => {
      const result = await executeStatusTransition(
        testEquipmentId,
        'RETIRED',
        {
          equipmentId: testEquipmentId,
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId,
          reason: 'Equipment obsolete'
        }
      );

      expect(result.success).toBe(true);

      // Verify retirement fields were updated
      const equipment = await prisma.equipment.findUnique({
        where: { id: testEquipmentId }
      });
      expect(equipment?.retiredAt).toBeTruthy();
      expect(equipment?.retiredReason).toBe('Equipment obsolete');
    });

    it('should close transactions when returning to available', async () => {
      // First check out the equipment
      await executeStatusTransition(
        testEquipmentId,
        'CHECKED_OUT',
        {
          equipmentId: testEquipmentId,
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId
        }
      );

      // Create a transaction
      await prisma.transaction.create({
        data: {
          equipmentId: testEquipmentId,
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId,
          status: 'CHECKED_OUT',
          checkedOutAt: new Date(),
          checkedOutById: testUserId,
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      });

      // Return to available
      const result = await executeStatusTransition(
        testEquipmentId,
        'AVAILABLE',
        {
          equipmentId: testEquipmentId,
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId
        }
      );

      expect(result.success).toBe(true);

      // Verify transaction was closed
      const transaction = await prisma.transaction.findFirst({
        where: { equipmentId: testEquipmentId }
      });
      expect(transaction?.status).toBe('RETURNED');
      expect(transaction?.returnedAt).toBeTruthy();
      expect(transaction?.returnedById).toBe(testUserId);
    });
  });

  describe('Automatic Transitions', () => {
    beforeEach(() => {
      // Mock current time for predictable testing
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should identify and transition overdue equipment', async () => {
      // Create overdue transaction
      const overdueDate = new Date(Date.now() - (AUTO_TRANSITION_RULES.OVERDUE_THRESHOLD_HOURS + 1) * 60 * 60 * 1000);
      
      await prisma.equipment.update({
        where: { id: testEquipmentId },
        data: { status: 'CHECKED_OUT' }
      });

      await prisma.transaction.create({
        data: {
          equipmentId: testEquipmentId,
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId,
          status: 'CHECKED_OUT',
          checkedOutAt: overdueDate,
          checkedOutById: testUserId,
          dueDate: overdueDate
        }
      });

      const result = await processAutomaticTransitions(testSchoolId, testOrgId);

      expect(result.overdueTransitions).toBe(1);

      // Verify equipment status was updated
      const equipment = await prisma.equipment.findUnique({
        where: { id: testEquipmentId }
      });
      expect(equipment?.status).toBe('OVERDUE');
    });

    it('should identify and schedule maintenance for due equipment', async () => {
      const maintenanceDueDate = new Date(Date.now() - (AUTO_TRANSITION_RULES.MAINTENANCE_DUE_DAYS + 1) * 24 * 60 * 60 * 1000);
      
      await prisma.equipment.update({
        where: { id: testEquipmentId },
        data: { 
          status: 'AVAILABLE',
          lastMaintenanceDate: maintenanceDueDate
        }
      });

      const result = await processAutomaticTransitions(testSchoolId, testOrgId);

      expect(result.maintenanceTransitions).toBe(1);

      // Verify equipment status was updated and maintenance request created
      const equipment = await prisma.equipment.findUnique({
        where: { id: testEquipmentId }
      });
      expect(equipment?.status).toBe('MAINTENANCE');

      const maintenanceRequest = await prisma.maintenanceRequest.findFirst({
        where: { equipmentId: testEquipmentId }
      });
      expect(maintenanceRequest).toBeTruthy();
      expect(maintenanceRequest?.description).toContain('scheduled maintenance due');
    });
  });

  describe('Workflow History', () => {
    it('should track workflow history', async () => {
      // Execute multiple status transitions
      await executeStatusTransition(
        testEquipmentId,
        'CHECKED_OUT',
        {
          equipmentId: testEquipmentId,
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId,
          reason: 'Initial checkout'
        }
      );

      await executeStatusTransition(
        testEquipmentId,
        'AVAILABLE',
        {
          equipmentId: testEquipmentId,
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId,
          reason: 'Returned'
        }
      );

      await executeStatusTransition(
        testEquipmentId,
        'MAINTENANCE',
        {
          equipmentId: testEquipmentId,
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId,
          reason: 'Routine maintenance'
        }
      );

      const history = await getEquipmentWorkflowHistory(testEquipmentId, testSchoolId, testOrgId);

      expect(history).toHaveLength(3);
      expect(history[0].details.newStatus).toBe('MAINTENANCE'); // Most recent first
      expect(history[1].details.newStatus).toBe('AVAILABLE');
      expect(history[2].details.newStatus).toBe('CHECKED_OUT');

      // Verify user information is included
      expect(history[0].user).toBeTruthy();
      expect(history[0].user?.firstName).toBe('Workflow');
    });

    it('should return empty history for equipment with no workflow changes', async () => {
      const newEquipmentId = await createTestEquipment({
        name: 'New Equipment',
        code: 'NEW-001',
        status: 'AVAILABLE',
        schoolId: testSchoolId,
        organizationId: testOrgId,
        createdById: testUserId
      });

      const history = await getEquipmentWorkflowHistory(newEquipmentId, testSchoolId, testOrgId);

      expect(history).toHaveLength(0);
    });
  });

  describe('Workflow Validation', () => {
    it('should validate workflow rules successfully', () => {
      const validation = validateWorkflowRules();

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect configuration issues', () => {
      // This test would be more meaningful with actual invalid configurations
      // For now, we verify the validation function works
      const validation = validateWorkflowRules();

      expect(validation).toHaveProperty('isValid');
      expect(validation).toHaveProperty('errors');
      expect(Array.isArray(validation.errors)).toBe(true);
    });
  });

  describe('Workflow Rules Configuration', () => {
    it('should have valid allowed transitions configuration', () => {
      // Verify all statuses have valid transition arrays
      Object.entries(ALLOWED_TRANSITIONS).forEach(([status, transitions]) => {
        expect(Array.isArray(transitions)).toBe(true);
        expect(typeof status).toBe('string');
        
        // Verify all transitions are valid status values
        transitions.forEach(transition => {
          expect(typeof transition).toBe('string');
          expect(Object.keys(ALLOWED_TRANSITIONS)).toContain(transition);
        });
      });
    });

    it('should have RETIRED as terminal state', () => {
      expect(ALLOWED_TRANSITIONS.RETIRED).toHaveLength(0);
    });

    it('should have reasonable auto-transition rules', () => {
      expect(AUTO_TRANSITION_RULES.OVERDUE_THRESHOLD_HOURS).toBeGreaterThan(0);
      expect(AUTO_TRANSITION_RULES.MAINTENANCE_DUE_DAYS).toBeGreaterThan(0);
      expect(AUTO_TRANSITION_RULES.LOST_THRESHOLD_DAYS).toBeGreaterThan(0);

      // Sanity checks for reasonable values
      expect(AUTO_TRANSITION_RULES.OVERDUE_THRESHOLD_HOURS).toBeLessThan(720); // Less than 30 days
      expect(AUTO_TRANSITION_RULES.MAINTENANCE_DUE_DAYS).toBeLessThan(365); // Less than 1 year
      expect(AUTO_TRANSITION_RULES.LOST_THRESHOLD_DAYS).toBeLessThan(365); // Less than 1 year
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock prisma to throw an error
      const mockPrisma = vi.mocked(prisma.equipment.findFirst);
      mockPrisma.mockRejectedValueOnce(new Error('Database connection error'));

      const result = await executeStatusTransition(
        testEquipmentId,
        'CHECKED_OUT',
        {
          equipmentId: testEquipmentId,
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId
        }
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to update equipment status');

      mockPrisma.mockRestore();
    });

    it('should handle invalid equipment ID format', async () => {
      const result = await executeStatusTransition(
        'invalid-id-format',
        'CHECKED_OUT',
        {
          equipmentId: 'invalid-id-format',
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId
        }
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('Equipment not found');
    });
  });

  describe('Multi-tenant Isolation', () => {
    it('should not allow workflow operations on equipment from different organization', async () => {
      const differentOrgEquipmentId = await createTestEquipment({
        name: 'Different Org Equipment',
        code: 'DOE-001',
        status: 'AVAILABLE',
        schoolId: 'different-school-id',
        organizationId: 'different-org-id',
        createdById: testUserId
      });

      const result = await executeStatusTransition(
        differentOrgEquipmentId,
        'CHECKED_OUT',
        {
          equipmentId: differentOrgEquipmentId,
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId
        }
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('Equipment not found');
    });

    it('should not return workflow history for equipment from different organization', async () => {
      const differentOrgEquipmentId = await createTestEquipment({
        name: 'Different Org Equipment 2',
        code: 'DOE-002',
        status: 'AVAILABLE',
        schoolId: 'different-school-id-2',
        organizationId: 'different-org-id-2',
        createdById: testUserId
      });

      const history = await getEquipmentWorkflowHistory(
        differentOrgEquipmentId,
        testSchoolId,
        testOrgId
      );

      expect(history).toHaveLength(0);
    });
  });
});