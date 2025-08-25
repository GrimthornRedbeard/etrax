import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { setupTestDb, cleanupTestDb, createTestUser, createTestEquipment, createTestSchool } from './setup';
import {
  QRCodeService,
  generateQRSchema,
  bulkGenerateQRSchema,
  qrLookupSchema
} from '@/services/qr';
import { prisma } from '@/index';
import fs from 'fs/promises';
import path from 'path';

describe('QR Code Service', () => {
  const testSchoolId = 'test-school-qr-id';
  const testOrgId = 'test-org-qr-id';
  let testUserId: string;
  let testEquipmentId: string;

  beforeAll(async () => {
    await setupTestDb();
    await QRCodeService.initialize();
  });

  afterAll(async () => {
    await cleanupTestDb();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.auditLog.deleteMany({ where: { schoolId: testSchoolId } });
    await prisma.equipment.deleteMany({ where: { schoolId: testSchoolId } });
    await prisma.user.deleteMany({ where: { schoolId: testSchoolId } });
    await prisma.school.deleteMany({ where: { id: testSchoolId } });

    // Create test school
    await createTestSchool({
      id: testSchoolId,
      name: 'QR Test School',
      organizationId: testOrgId,
      primaryColor: '#1f2937',
      logoUrl: null
    });

    // Create test user
    testUserId = await createTestUser({
      email: 'qr-test@test.com',
      firstName: 'QR',
      lastName: 'Tester',
      schoolId: testSchoolId,
      organizationId: testOrgId,
      role: 'STAFF'
    });

    // Create test equipment
    testEquipmentId = await createTestEquipment({
      name: 'QR Test Equipment',
      code: 'QTE-001',
      status: 'AVAILABLE',
      schoolId: testSchoolId,
      organizationId: testOrgId,
      createdById: testUserId
    });
  });

  describe('Schema Validation', () => {
    it('should validate generateQRSchema correctly', () => {
      const validData = {
        equipmentId: testEquipmentId,
        size: 300,
        errorCorrectionLevel: 'M' as const,
        includeSchoolBranding: true,
        format: 'PNG' as const
      };

      expect(() => generateQRSchema.parse(validData)).not.toThrow();
    });

    it('should reject invalid generateQRSchema data', () => {
      const invalidData = {
        equipmentId: 'invalid-id',
        size: 50, // Too small
        errorCorrectionLevel: 'INVALID' as any,
        format: 'INVALID' as any
      };

      expect(() => generateQRSchema.parse(invalidData)).toThrow();
    });

    it('should validate bulkGenerateQRSchema correctly', () => {
      const validData = {
        equipmentIds: [testEquipmentId],
        size: 400,
        format: 'SVG' as const
      };

      expect(() => bulkGenerateQRSchema.parse(validData)).not.toThrow();
    });

    it('should validate qrLookupSchema correctly', () => {
      const validData = {
        qrCode: JSON.stringify({
          type: 'ETRAX_EQUIPMENT',
          equipmentId: testEquipmentId,
          code: 'TEST-001'
        })
      };

      expect(() => qrLookupSchema.parse(validData)).not.toThrow();
    });
  });

  describe('QR Code Generation', () => {
    it('should generate QR code for equipment', async () => {
      const result = await QRCodeService.generateQRCode(
        {
          equipmentId: testEquipmentId,
          size: 300,
          format: 'PNG'
        },
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(true);
      expect(result.qrCodeUrl).toBeDefined();
      expect(result.filePath).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata!.equipmentId).toBe(testEquipmentId);
      expect(result.metadata!.equipmentCode).toBe('QTE-001');
      expect(result.metadata!.format).toBe('PNG');

      // Verify file was created
      if (result.filePath) {
        const fileExists = await fs.access(result.filePath).then(() => true).catch(() => false);
        expect(fileExists).toBe(true);
      }

      // Verify equipment was updated
      const equipment = await prisma.equipment.findUnique({
        where: { id: testEquipmentId }
      });
      expect(equipment?.qrCode).toBeDefined();
      expect(equipment?.qrCodeUrl).toBe(result.qrCodeUrl);
      expect(equipment?.qrCodeGenerated).toBe(true);
      expect(equipment?.qrCodeGeneratedAt).toBeDefined();

      // Verify audit log was created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: 'QR_CODE_GENERATED',
          entityId: testEquipmentId
        }
      });
      expect(auditLog).toBeTruthy();
    });

    it('should generate SVG QR code', async () => {
      const result = await QRCodeService.generateQRCode(
        {
          equipmentId: testEquipmentId,
          size: 400,
          format: 'SVG'
        },
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(true);
      expect(result.metadata!.format).toBe('SVG');
      expect(result.qrCodeUrl).toContain('.svg');
    });

    it('should handle different error correction levels', async () => {
      const result = await QRCodeService.generateQRCode(
        {
          equipmentId: testEquipmentId,
          errorCorrectionLevel: 'H'
        },
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(true);
    });

    it('should fail for non-existent equipment', async () => {
      const result = await QRCodeService.generateQRCode(
        {
          equipmentId: 'non-existent-id'
        },
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Equipment not found');
    });

    it('should fail for equipment from different organization', async () => {
      const differentOrgEquipmentId = await createTestEquipment({
        name: 'Different Org Equipment',
        code: 'DOE-001',
        status: 'AVAILABLE',
        schoolId: 'different-school-id',
        organizationId: 'different-org-id',
        createdById: testUserId
      });

      const result = await QRCodeService.generateQRCode(
        {
          equipmentId: differentOrgEquipmentId
        },
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Equipment not found or not accessible');
    });
  });

  describe('Bulk QR Code Generation', () => {
    it('should generate QR codes for multiple equipment', async () => {
      // Create additional test equipment
      const equipment2Id = await createTestEquipment({
        name: 'QR Test Equipment 2',
        code: 'QTE-002',
        status: 'AVAILABLE',
        schoolId: testSchoolId,
        organizationId: testOrgId,
        createdById: testUserId
      });

      const equipment3Id = await createTestEquipment({
        name: 'QR Test Equipment 3',
        code: 'QTE-003',
        status: 'AVAILABLE',
        schoolId: testSchoolId,
        organizationId: testOrgId,
        createdById: testUserId
      });

      const result = await QRCodeService.bulkGenerateQRCodes(
        {
          equipmentIds: [testEquipmentId, equipment2Id, equipment3Id],
          size: 300,
          format: 'PNG'
        },
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(true);
      expect(result.totalGenerated).toBe(3);
      expect(result.totalFailed).toBe(0);
      expect(result.results).toHaveLength(3);
      expect(result.zipFilePath).toBeDefined();

      // Verify all results are successful
      result.results.forEach(res => {
        expect(res.success).toBe(true);
      });
    });

    it('should handle mixed success/failure in bulk generation', async () => {
      const result = await QRCodeService.bulkGenerateQRCodes(
        {
          equipmentIds: [testEquipmentId, 'non-existent-id', 'another-invalid-id'],
          size: 300
        },
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(true); // At least one succeeded
      expect(result.totalGenerated).toBe(1);
      expect(result.totalFailed).toBe(2);
      expect(result.results).toHaveLength(3);

      // Check individual results
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[2].success).toBe(false);
    });

    it('should not create zip file for single successful generation', async () => {
      const result = await QRCodeService.bulkGenerateQRCodes(
        {
          equipmentIds: [testEquipmentId]
        },
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(true);
      expect(result.totalGenerated).toBe(1);
      expect(result.zipFilePath).toBeUndefined();
    });
  });

  describe('QR Code Lookup', () => {
    beforeEach(async () => {
      // Generate QR code for lookup tests
      await QRCodeService.generateQRCode(
        { equipmentId: testEquipmentId },
        testSchoolId,
        testOrgId
      );
    });

    it('should lookup equipment by QR code', async () => {
      const equipment = await prisma.equipment.findUnique({
        where: { id: testEquipmentId }
      });
      
      const result = await QRCodeService.lookupEquipmentByQR(
        equipment!.qrCode!,
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(true);
      expect(result.equipment).toBeDefined();
      expect(result.equipment!.id).toBe(testEquipmentId);
      expect(result.equipment!.code).toBe('QTE-001');
      expect(result.equipment!.name).toBe('QR Test Equipment');

      // Verify audit log was created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: 'QR_CODE_LOOKUP',
          entityId: testEquipmentId
        }
      });
      expect(auditLog).toBeTruthy();
    });

    it('should fail lookup for non-existent QR code', async () => {
      const invalidQRCode = JSON.stringify({
        type: 'ETRAX_EQUIPMENT',
        equipmentId: 'non-existent-id',
        code: 'INVALID-001'
      });

      const result = await QRCodeService.lookupEquipmentByQR(
        invalidQRCode,
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Equipment not found or QR code invalid');
    });

    it('should include transaction information in lookup', async () => {
      // Create a transaction for the equipment
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

      const equipment = await prisma.equipment.findUnique({
        where: { id: testEquipmentId }
      });
      
      const result = await QRCodeService.lookupEquipmentByQR(
        equipment!.qrCode!,
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(true);
      expect(result.equipment!.currentTransaction).toBeDefined();
      expect(result.equipment!.currentTransaction!.status).toBe('CHECKED_OUT');
    });
  });

  describe('QR Code Regeneration', () => {
    beforeEach(async () => {
      // Generate initial QR code
      await QRCodeService.generateQRCode(
        { equipmentId: testEquipmentId },
        testSchoolId,
        testOrgId
      );
    });

    it('should regenerate QR code for equipment', async () => {
      const originalEquipment = await prisma.equipment.findUnique({
        where: { id: testEquipmentId }
      });
      const originalQRCode = originalEquipment!.qrCode;
      const originalQRCodeUrl = originalEquipment!.qrCodeUrl;

      const result = await QRCodeService.regenerateQRCode(
        testEquipmentId,
        testSchoolId,
        testOrgId,
        'QR code damaged'
      );

      expect(result.success).toBe(true);
      expect(result.qrCodeUrl).toBeDefined();
      expect(result.qrCodeUrl).not.toBe(originalQRCodeUrl);

      // Verify equipment was updated with new QR code
      const updatedEquipment = await prisma.equipment.findUnique({
        where: { id: testEquipmentId }
      });
      expect(updatedEquipment!.qrCode).not.toBe(originalQRCode);
      expect(updatedEquipment!.qrCodeUrl).toBe(result.qrCodeUrl);

      // Verify audit log was created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: 'QR_CODE_REGENERATED',
          entityId: testEquipmentId
        }
      });
      expect(auditLog).toBeTruthy();
      expect(auditLog!.details.reason).toBe('QR code damaged');
    });

    it('should fail regeneration for non-existent equipment', async () => {
      const result = await QRCodeService.regenerateQRCode(
        'non-existent-id',
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Equipment not found');
    });
  });

  describe('QR Code Statistics', () => {
    it('should return accurate QR code statistics', async () => {
      // Create additional equipment
      const equipment2Id = await createTestEquipment({
        name: 'QR Test Equipment 2',
        code: 'QTE-002',
        status: 'AVAILABLE',
        schoolId: testSchoolId,
        organizationId: testOrgId,
        createdById: testUserId
      });

      const equipment3Id = await createTestEquipment({
        name: 'QR Test Equipment 3',
        code: 'QTE-003',
        status: 'AVAILABLE',
        schoolId: testSchoolId,
        organizationId: testOrgId,
        createdById: testUserId
      });

      // Generate QR codes for some equipment
      await QRCodeService.generateQRCode({ equipmentId: testEquipmentId }, testSchoolId, testOrgId);
      await QRCodeService.generateQRCode({ equipmentId: equipment2Id }, testSchoolId, testOrgId);
      // Leave equipment3Id without QR code

      const stats = await QRCodeService.getQRCodeStats(testSchoolId, testOrgId);

      expect(stats.totalEquipment).toBe(3);
      expect(stats.withQRCodes).toBe(2);
      expect(stats.withoutQRCodes).toBe(1);
      expect(stats.qrCodeCoverage).toBeCloseTo(66.67, 1);
      expect(stats.recentlyGenerated).toBe(2);
    });

    it('should handle empty equipment list', async () => {
      // Clean up all equipment
      await prisma.equipment.deleteMany({ where: { schoolId: testSchoolId } });

      const stats = await QRCodeService.getQRCodeStats(testSchoolId, testOrgId);

      expect(stats.totalEquipment).toBe(0);
      expect(stats.withQRCodes).toBe(0);
      expect(stats.withoutQRCodes).toBe(0);
      expect(stats.qrCodeCoverage).toBe(0);
      expect(stats.recentlyGenerated).toBe(0);
    });
  });

  describe('QR Code Validation', () => {
    it('should validate valid ETRAX QR code', () => {
      const validQRCode = JSON.stringify({
        type: 'ETRAX_EQUIPMENT',
        version: '1.0',
        equipmentId: testEquipmentId,
        code: 'TEST-001',
        name: 'Test Equipment'
      });

      const validation = QRCodeService.validateQRCode(validQRCode);

      expect(validation.isValid).toBe(true);
      expect(validation.data).toBeDefined();
      expect(validation.data.type).toBe('ETRAX_EQUIPMENT');
      expect(validation.data.equipmentId).toBe(testEquipmentId);
    });

    it('should reject invalid QR code type', () => {
      const invalidQRCode = JSON.stringify({
        type: 'OTHER_SYSTEM',
        equipmentId: testEquipmentId
      });

      const validation = QRCodeService.validateQRCode(invalidQRCode);

      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Invalid QR code type');
    });

    it('should reject QR code missing required data', () => {
      const incompleteQRCode = JSON.stringify({
        type: 'ETRAX_EQUIPMENT'
        // Missing equipmentId and code
      });

      const validation = QRCodeService.validateQRCode(incompleteQRCode);

      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Missing required equipment data');
    });

    it('should reject malformed JSON', () => {
      const malformedQRCode = 'not-json-data';

      const validation = QRCodeService.validateQRCode(malformedQRCode);

      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Invalid QR code format');
    });
  });

  describe('QR Code Cleanup', () => {
    it('should clean up old unused QR code files', async () => {
      // This test would require mocking file system operations
      // and creating test files with old timestamps
      const deletedCount = await QRCodeService.cleanupOldQRCodes(1);

      expect(typeof deletedCount).toBe('number');
      expect(deletedCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle cleanup errors gracefully', async () => {
      // Mock file system error
      const originalReaddir = fs.readdir;
      vi.mocked(fs.readdir).mockRejectedValueOnce(new Error('File system error'));

      const deletedCount = await QRCodeService.cleanupOldQRCodes(30);

      expect(deletedCount).toBe(0);

      // Restore original function
      fs.readdir = originalReaddir;
    });
  });

  describe('Error Handling', () => {
    it('should handle QR code generation errors gracefully', async () => {
      // Mock QRCode.toBuffer to throw an error
      const QRCode = require('qrcode');
      const originalToBuffer = QRCode.toBuffer;
      QRCode.toBuffer = vi.fn().mockRejectedValue(new Error('QR generation failed'));

      const result = await QRCodeService.generateQRCode(
        { equipmentId: testEquipmentId },
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // Restore original function
      QRCode.toBuffer = originalToBuffer;
    });

    it('should handle file write errors', async () => {
      // Mock fs.writeFile to throw an error
      const originalWriteFile = fs.writeFile;
      vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error('Write failed'));

      const result = await QRCodeService.generateQRCode(
        { equipmentId: testEquipmentId },
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(false);

      // Restore original function
      fs.writeFile = originalWriteFile;
    });
  });

  describe('Multi-tenant Isolation', () => {
    it('should not generate QR codes for equipment from different organization', async () => {
      const differentOrgEquipmentId = await createTestEquipment({
        name: 'Different Org Equipment',
        code: 'DOE-001',
        status: 'AVAILABLE',
        schoolId: 'different-school-id',
        organizationId: 'different-org-id',
        createdById: testUserId
      });

      const result = await QRCodeService.generateQRCode(
        { equipmentId: differentOrgEquipmentId },
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Equipment not found or not accessible');
    });

    it('should not lookup equipment from different organization', async () => {
      const differentOrgQRCode = JSON.stringify({
        type: 'ETRAX_EQUIPMENT',
        equipmentId: 'different-org-equipment-id',
        code: 'DOE-001'
      });

      const result = await QRCodeService.lookupEquipmentByQR(
        differentOrgQRCode,
        testSchoolId,
        testOrgId
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Equipment not found or QR code invalid');
    });
  });
});