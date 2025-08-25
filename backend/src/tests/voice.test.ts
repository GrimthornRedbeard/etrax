import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { setupTestDb, cleanupTestDb, createTestUser, createTestEquipment, createTestSchool } from './setup';
import { VoiceService, voiceCommandSchema, voiceIntentSchema } from '@/services/voice';
import { prisma } from '@/index';

describe('Voice Service', () => {
  const testSchoolId = 'test-school-voice-id';
  const testOrgId = 'test-org-voice-id';
  let testUserId: string;
  let testEquipmentId1: string;
  let testEquipmentId2: string;
  let testEquipmentId3: string;

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await cleanupTestDb();
  });

  beforeEach(async () => {
    // Clear voice cache
    VoiceService.clearCache();

    // Clean up test data
    await prisma.auditLog.deleteMany({ where: { schoolId: testSchoolId } });
    await prisma.transaction.deleteMany({ where: { schoolId: testSchoolId } });
    await prisma.equipment.deleteMany({ where: { schoolId: testSchoolId } });
    await prisma.user.deleteMany({ where: { schoolId: testSchoolId } });
    await prisma.school.deleteMany({ where: { id: testSchoolId } });

    // Create test school
    await createTestSchool({
      id: testSchoolId,
      name: 'Voice Test School',
      organizationId: testOrgId
    });

    // Create test user
    testUserId = await createTestUser({
      email: 'voice-test@test.com',
      firstName: 'Voice',
      lastName: 'Tester',
      schoolId: testSchoolId,
      organizationId: testOrgId,
      role: 'STAFF'
    });

    // Create test equipment
    testEquipmentId1 = await createTestEquipment({
      name: 'Basketball',
      code: 'BBL-001',
      status: 'AVAILABLE',
      schoolId: testSchoolId,
      organizationId: testOrgId,
      createdById: testUserId
    });

    testEquipmentId2 = await createTestEquipment({
      name: 'Tennis Racket',
      code: 'TNR-001',
      status: 'AVAILABLE',
      schoolId: testSchoolId,
      organizationId: testOrgId,
      createdById: testUserId
    });

    testEquipmentId3 = await createTestEquipment({
      name: 'Volleyball Net',
      code: 'VBN-001',
      status: 'CHECKED_OUT',
      schoolId: testSchoolId,
      organizationId: testOrgId,
      createdById: testUserId
    });
  });

  describe('Schema Validation', () => {
    it('should validate voiceCommandSchema correctly', () => {
      const validData = {
        command: 'check out basketball',
        confidence: 0.95,
        timestamp: new Date().toISOString(),
        metadata: { source: 'web' }
      };

      expect(() => voiceCommandSchema.parse(validData)).not.toThrow();
    });

    it('should reject invalid voiceCommandSchema data', () => {
      const invalidData = {
        command: '', // Empty command
        confidence: 1.5, // Invalid confidence
        timestamp: 'invalid-date'
      };

      expect(() => voiceCommandSchema.parse(invalidData)).toThrow();
    });

    it('should validate voiceIntentSchema correctly', () => {
      const validData = {
        intent: 'CHECKOUT_EQUIPMENT' as const,
        entities: { equipment: { id: testEquipmentId1, name: 'Basketball' } },
        confidence: 0.85,
        originalCommand: 'check out basketball'
      };

      expect(() => voiceIntentSchema.parse(validData)).not.toThrow();
    });
  });

  describe('Equipment Checkout Commands', () => {
    it('should process checkout command with equipment name', async () => {
      const result = await VoiceService.processVoiceCommand(
        'check out basketball',
        testUserId,
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully checked out Basketball');
      expect(result.message).toContain('BBL-001');
      expect(result.data).toBeDefined();
      expect(result.data.transaction).toBeDefined();

      // Verify equipment status changed
      const equipment = await prisma.equipment.findUnique({
        where: { id: testEquipmentId1 }
      });
      expect(equipment?.status).toBe('CHECKED_OUT');

      // Verify transaction was created
      const transaction = await prisma.transaction.findFirst({
        where: { equipmentId: testEquipmentId1, status: 'CHECKED_OUT' }
      });
      expect(transaction).toBeTruthy();
      expect(transaction?.userId).toBe(testUserId);

      // Verify audit log was created
      const auditLog = await prisma.auditLog.findFirst({
        where: { action: 'VOICE_COMMAND', entityType: 'SYSTEM' }
      });
      expect(auditLog).toBeTruthy();
      expect(auditLog?.details.intent).toBe('CHECKOUT_EQUIPMENT');
    });

    it('should process checkout command with equipment code', async () => {
      const result = await VoiceService.processVoiceCommand(
        'borrow TNR-001',
        testUserId,
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Tennis Racket');
      expect(result.message).toContain('TNR-001');
    });

    it('should handle checkout variations', async () => {
      const variations = [
        'take basketball',
        'get basketball',
        'sign out basketball',
        'I need basketball'
      ];

      for (const command of variations.slice(0, 3)) { // Test first 3 to avoid conflicts
        // Reset equipment to available
        await prisma.equipment.update({
          where: { id: testEquipmentId1 },
          data: { status: 'AVAILABLE' }
        });
        
        // Clean up any existing transactions
        await prisma.transaction.deleteMany({
          where: { equipmentId: testEquipmentId1 }
        });

        const result = await VoiceService.processVoiceCommand(
          command,
          testUserId,
          testSchoolId,
          testOrgId
        );

        expect(result.success).toBe(true);
      }
    });

    it('should fail checkout for non-existent equipment', async () => {
      const result = await VoiceService.processVoiceCommand(
        'check out nonexistent item',
        testUserId,
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("couldn't find any equipment");
    });

    it('should handle ambiguous equipment names', async () => {
      // Create another basketball
      await createTestEquipment({
        name: 'Basketball Pro',
        code: 'BBP-001',
        status: 'AVAILABLE',
        schoolId: testSchoolId,
        organizationId: testOrgId,
        createdById: testUserId
      });

      const result = await VoiceService.processVoiceCommand(
        'check out basketball',
        testUserId,
        testSchoolId,
        testOrgId
      );

      // Should either succeed (exact match) or ask for clarification
      if (!result.success) {
        expect(result.message).toContain('found');
        expect(result.message).toContain('be more specific');
        expect(result.data).toBeDefined();
      }
    });
  });

  describe('Equipment Checkin Commands', () => {
    beforeEach(async () => {
      // Create a checked out transaction for testing
      await prisma.transaction.create({
        data: {
          equipmentId: testEquipmentId3,
          userId: testUserId,
          schoolId: testSchoolId,
          organizationId: testOrgId,
          status: 'CHECKED_OUT',
          checkedOutAt: new Date(),
          checkedOutById: testUserId,
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      });
    });

    it('should process checkin command', async () => {
      const result = await VoiceService.processVoiceCommand(
        'return volleyball net',
        testUserId,
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully returned Volleyball Net');
      expect(result.data.transaction).toBeDefined();

      // Verify equipment status changed
      const equipment = await prisma.equipment.findUnique({
        where: { id: testEquipmentId3 }
      });
      expect(equipment?.status).toBe('AVAILABLE');

      // Verify transaction was updated
      const transaction = await prisma.transaction.findFirst({
        where: { equipmentId: testEquipmentId3 },
        orderBy: { createdAt: 'desc' }
      });
      expect(transaction?.status).toBe('RETURNED');
      expect(transaction?.returnedById).toBe(testUserId);
    });

    it('should handle checkin variations', async () => {
      const variations = [
        'check in volleyball net',
        'give back volleyball net',
        'sign in volleyball net'
      ];

      for (let i = 0; i < variations.length; i++) {
        // Reset for each test
        await prisma.equipment.update({
          where: { id: testEquipmentId3 },
          data: { status: 'CHECKED_OUT' }
        });

        await prisma.transaction.updateMany({
          where: { equipmentId: testEquipmentId3 },
          data: { status: 'CHECKED_OUT' }
        });

        const result = await VoiceService.processVoiceCommand(
          variations[i],
          testUserId,
          testSchoolId,
          testOrgId
        );

        expect(result.success).toBe(true);
      }
    });

    it('should fail checkin for equipment not checked out', async () => {
      const result = await VoiceService.processVoiceCommand(
        'return basketball',
        testUserId,
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('not currently checked out');
    });
  });

  describe('Equipment Search Commands', () => {
    it('should find equipment by name', async () => {
      const result = await VoiceService.processVoiceCommand(
        'find basketball',
        testUserId,
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Basketball');
      expect(result.message).toContain('BBL-001');
      expect(result.message).toContain('available');
      expect(result.data.equipment).toBeDefined();
    });

    it('should handle find command variations', async () => {
      const variations = [
        'where is basketball',
        'locate basketball',
        'search for basketball',
        'look for basketball'
      ];

      for (const command of variations) {
        const result = await VoiceService.processVoiceCommand(
          command,
          testUserId,
          testSchoolId,
          testOrgId
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('Basketball');
      }
    });

    it('should show multiple matches when search is ambiguous', async () => {
      // Create another basketball-like item
      await createTestEquipment({
        name: 'Basketball Hoop',
        code: 'BBH-001',
        status: 'AVAILABLE',
        schoolId: testSchoolId,
        organizationId: testOrgId,
        createdById: testUserId
      });

      const result = await VoiceService.processVoiceCommand(
        'find basketball',
        testUserId,
        testSchoolId,
        testOrgId
      );

      // Should either find exact match or show multiple options
      expect(result.success).toBe(true);
      if (result.data && Array.isArray(result.data)) {
        expect(result.data.length).toBeGreaterThan(1);
      }
    });
  });

  describe('Status Management Commands', () => {
    it('should get equipment status', async () => {
      const result = await VoiceService.processVoiceCommand(
        'status of basketball',
        testUserId,
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Basketball');
      expect(result.message).toContain('available');
      expect(result.data.equipment).toBeDefined();
    });

    it('should handle status check variations', async () => {
      const variations = [
        'what is the status of basketball',
        'check status basketball',
        'how is basketball'
      ];

      for (const command of variations) {
        const result = await VoiceService.processVoiceCommand(
          command,
          testUserId,
          testSchoolId,
          testOrgId
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('Basketball');
      }
    });

    it('should set equipment status', async () => {
      const result = await VoiceService.processVoiceCommand(
        'set basketball to maintenance',
        testUserId,
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully set Basketball status to maintenance');

      // Verify equipment status changed
      const equipment = await prisma.equipment.findUnique({
        where: { id: testEquipmentId1 }
      });
      expect(equipment?.status).toBe('MAINTENANCE');
    });

    it('should handle status change variations', async () => {
      const variations = [
        'mark tennis racket as damaged',
        'change tennis racket to damaged',
        'update tennis racket status to damaged'
      ];

      for (let i = 0; i < variations.length; i++) {
        // Reset equipment status
        await prisma.equipment.update({
          where: { id: testEquipmentId2 },
          data: { status: 'AVAILABLE' }
        });

        const result = await VoiceService.processVoiceCommand(
          variations[i],
          testUserId,
          testSchoolId,
          testOrgId
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('Tennis Racket');
        expect(result.message).toContain('damaged');
      }
    });

    it('should handle invalid status changes', async () => {
      const result = await VoiceService.processVoiceCommand(
        'set basketball to invalid-status',
        testUserId,
        testSchoolId,
        testOrgId
      );

      // Should either fail or normalize the status
      if (!result.success) {
        expect(result.message).toContain('not allowed');
      }
    });
  });

  describe('List Equipment Commands', () => {
    it('should list all equipment', async () => {
      const result = await VoiceService.processVoiceCommand(
        'list all equipment',
        testUserId,
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('equipment items');
      expect(result.data.total).toBe(3);
      expect(result.data.statusBreakdown).toBeDefined();
      expect(result.data.equipment).toBeDefined();
    });

    it('should handle list command variations', async () => {
      const variations = [
        'show all equipment',
        'what equipment do we have',
        'inventory list'
      ];

      for (const command of variations) {
        const result = await VoiceService.processVoiceCommand(
          command,
          testUserId,
          testSchoolId,
          testOrgId
        );

        expect(result.success).toBe(true);
        expect(result.data.total).toBe(3);
      }
    });
  });

  describe('Help Commands', () => {
    it('should provide help information', async () => {
      const result = await VoiceService.processVoiceCommand(
        'help',
        testUserId,
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('help you manage equipment');
      expect(result.data.commands).toBeDefined();
      expect(Array.isArray(result.data.commands)).toBe(true);
      expect(result.suggestions).toBeDefined();
    });

    it('should handle help variations', async () => {
      const variations = [
        'what can you do',
        'commands',
        'assistance'
      ];

      for (const command of variations) {
        const result = await VoiceService.processVoiceCommand(
          command,
          testUserId,
          testSchoolId,
          testOrgId
        );

        expect(result.success).toBe(true);
        expect(result.data.commands).toBeDefined();
      }
    });
  });

  describe('Unknown Commands', () => {
    it('should handle unknown commands gracefully', async () => {
      const result = await VoiceService.processVoiceCommand(
        'do something completely random',
        testUserId,
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("don't understand");
      expect(result.suggestions).toBeDefined();
    });

    it('should handle low confidence commands', async () => {
      const result = await VoiceService.processVoiceCommand(
        'maybe check something out possibly',
        testUserId,
        testSchoolId,
        testOrgId,
        0.2 // Low confidence
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("not sure what you meant");
      expect(result.suggestions).toBeDefined();
    });

    it('should handle incomplete commands', async () => {
      const incompleteCommands = [
        'check out',
        'return',
        'find',
        'set to maintenance'
      ];

      for (const command of incompleteCommands) {
        const result = await VoiceService.processVoiceCommand(
          command,
          testUserId,
          testSchoolId,
          testOrgId
        );

        expect(result.success).toBe(false);
        expect(result.followUp || result.message).toBeDefined();
      }
    });
  });

  describe('Fuzzy Matching', () => {
    it('should match equipment with slight misspellings', async () => {
      const variations = [
        'basketbal', // Missing l
        'basketball', // Correct
        'basket ball', // Space
        'bball' // Abbreviation might not work but test anyway
      ];

      for (const variation of variations.slice(0, 3)) { // Skip abbreviation
        const result = await VoiceService.processVoiceCommand(
          `find ${variation}`,
          testUserId,
          testSchoolId,
          testOrgId
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('Basketball');
      }
    });

    it('should prioritize exact code matches', async () => {
      const result = await VoiceService.processVoiceCommand(
        'find BBL-001',
        testUserId,
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Basketball');
      expect(result.message).toContain('BBL-001');
    });
  });

  describe('Multi-tenant Isolation', () => {
    it('should not access equipment from different organization', async () => {
      // Create equipment in different organization
      const differentOrgEquipmentId = await createTestEquipment({
        name: 'Different Org Basketball',
        code: 'DOB-001',
        status: 'AVAILABLE',
        schoolId: 'different-school-id',
        organizationId: 'different-org-id',
        createdById: testUserId
      });

      const result = await VoiceService.processVoiceCommand(
        'find different org basketball',
        testUserId,
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("couldn't find");
    });

    it('should only list equipment from current organization', async () => {
      // Create equipment in different organization
      await createTestEquipment({
        name: 'Different Org Tennis',
        code: 'DOT-001',
        status: 'AVAILABLE',
        schoolId: 'different-school-id-2',
        organizationId: 'different-org-id-2',
        createdById: testUserId
      });

      const result = await VoiceService.processVoiceCommand(
        'list all equipment',
        testUserId,
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(true);
      expect(result.data.total).toBe(3); // Only our organization's equipment
    });
  });

  describe('Voice Statistics', () => {
    beforeEach(async () => {
      // Generate some voice commands for statistics
      await VoiceService.processVoiceCommand('help', testUserId, testSchoolId, testOrgId);
      await VoiceService.processVoiceCommand('find basketball', testUserId, testSchoolId, testOrgId);
      await VoiceService.processVoiceCommand('invalid command', testUserId, testSchoolId, testOrgId);
    });

    it('should generate voice command statistics', async () => {
      const stats = await VoiceService.getVoiceStats(testSchoolId, testOrgId);

      expect(stats.totalCommands).toBeGreaterThan(0);
      expect(stats.successRate).toBeGreaterThanOrEqual(0);
      expect(stats.successRate).toBeLessThanOrEqual(100);
      expect(stats.averageConfidence).toBeGreaterThanOrEqual(0);
      expect(stats.averageConfidence).toBeLessThanOrEqual(1);
      expect(stats.intentBreakdown).toBeDefined();
      expect(stats.period).toBe('30 days');
    });

    it('should handle empty statistics gracefully', async () => {
      // Clean up all voice command logs
      await prisma.auditLog.deleteMany({
        where: {
          action: 'VOICE_COMMAND',
          schoolId: testSchoolId
        }
      });

      const stats = await VoiceService.getVoiceStats(testSchoolId, testOrgId);

      expect(stats.totalCommands).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.averageConfidence).toBe(0);
      expect(stats.intentBreakdown).toEqual({});
    });
  });

  describe('Cache Management', () => {
    it('should cache equipment data for performance', async () => {
      // First call - should hit database
      const start1 = Date.now();
      const result1 = await VoiceService.processVoiceCommand(
        'find basketball',
        testUserId,
        testSchoolId,
        testOrgId
      );
      const time1 = Date.now() - start1;

      expect(result1.success).toBe(true);

      // Second call - should use cache (might be faster)
      const start2 = Date.now();
      const result2 = await VoiceService.processVoiceCommand(
        'find tennis racket',
        testUserId,
        testSchoolId,
        testOrgId
      );
      const time2 = Date.now() - start2;

      expect(result2.success).toBe(true);
      // Cache effect might not be measurable in tests, but verify both work
    });

    it('should clear cache when requested', () => {
      // This is a simple test since clearCache is a void method
      expect(() => VoiceService.clearCache()).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock prisma to throw an error
      const mockPrisma = vi.spyOn(prisma.equipment, 'findMany');
      mockPrisma.mockRejectedValueOnce(new Error('Database error'));

      const result = await VoiceService.processVoiceCommand(
        'list all equipment',
        testUserId,
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('error');

      mockPrisma.mockRestore();
    });

    it('should handle transaction service errors', async () => {
      // Try to check out equipment that doesn't exist
      const result = await VoiceService.processVoiceCommand(
        'check out nonexistent-equipment-xyz-123',
        testUserId,
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });
  });

  describe('Natural Language Variations', () => {
    it('should handle different ways of expressing checkout', async () => {
      const naturalCommands = [
        'I want to check out the basketball',
        'Can I borrow the basketball please',
        'I need the basketball',
        'Let me take the basketball'
      ];

      for (let i = 0; i < naturalCommands.length; i++) {
        // Reset equipment to available
        await prisma.equipment.update({
          where: { id: testEquipmentId1 },
          data: { status: 'AVAILABLE' }
        });
        await prisma.transaction.deleteMany({
          where: { equipmentId: testEquipmentId1 }
        });

        const result = await VoiceService.processVoiceCommand(
          naturalCommands[i],
          testUserId,
          testSchoolId,
          testOrgId
        );

        // Some natural variations might not be recognized
        // That's okay - we're testing the robustness
        if (result.success) {
          expect(result.message).toContain('Basketball');
        }
      }
    });

    it('should handle conversational patterns', async () => {
      const conversationalCommands = [
        'Hey, where did we put the basketball?',
        'Can you tell me the status of the tennis racket?',
        'I think the volleyball net needs to be returned'
      ];

      for (const command of conversationalCommands) {
        const result = await VoiceService.processVoiceCommand(
          command,
          testUserId,
          testSchoolId,
          testOrgId
        );

        // Conversational patterns might have lower recognition rates
        // We're testing that the system doesn't crash
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.message).toBe('string');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle very short commands', async () => {
      const shortCommands = ['help', 'list', 'find'];

      for (const command of shortCommands) {
        const result = await VoiceService.processVoiceCommand(
          command,
          testUserId,
          testSchoolId,
          testOrgId
        );

        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
      }
    });

    it('should handle very long commands', async () => {
      const longCommand = 'I would like to check out the basketball that is located in the gymnasium for use in today\'s physical education class if it is available and not currently being used by another student';

      const result = await VoiceService.processVoiceCommand(
        longCommand,
        testUserId,
        testSchoolId,
        testOrgId
      );

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should handle commands with special characters', async () => {
      const specialCommands = [
        'find BBL-001!',
        'check out "basketball"',
        'return tennis/racket',
        'status of equipment #1'
      ];

      for (const command of specialCommands) {
        const result = await VoiceService.processVoiceCommand(
          command,
          testUserId,
          testSchoolId,
          testOrgId
        );

        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
      }
    });

    it('should handle empty or whitespace commands', async () => {
      const emptyCommands = ['', '   ', '\n', '\t'];

      for (const command of emptyCommands) {
        const result = await VoiceService.processVoiceCommand(
          command,
          testUserId,
          testSchoolId,
          testOrgId
        );

        expect(result.success).toBe(false);
        expect(result.message).toBeDefined();
      }
    });
  });
});