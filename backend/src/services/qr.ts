import QRCode from 'qrcode';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { prisma } from '@/index';
import { logger } from '@/utils/logger';
import { config } from '@/config/environment';

// Validation schemas
export const generateQRSchema = z.object({
  equipmentId: z.string().uuid('Invalid equipment ID'),
  size: z.number().min(100).max(2000).optional().default(300),
  errorCorrectionLevel: z.enum(['L', 'M', 'Q', 'H']).optional().default('M'),
  includeSchoolBranding: z.boolean().optional().default(true),
  format: z.enum(['PNG', 'SVG', 'PDF']).optional().default('PNG'),
});

export const bulkGenerateQRSchema = z.object({
  equipmentIds: z.array(z.string().uuid()).min(1).max(100),
  size: z.number().min(100).max(2000).optional().default(300),
  errorCorrectionLevel: z.enum(['L', 'M', 'Q', 'H']).optional().default('M'),
  includeSchoolBranding: z.boolean().optional().default(true),
  format: z.enum(['PNG', 'SVG', 'PDF']).optional().default('PNG'),
});

export const qrLookupSchema = z.object({
  qrCode: z.string().min(1, 'QR code is required'),
});

interface QRCodeGenerationResult {
  success: boolean;
  qrCodeUrl?: string;
  filePath?: string;
  error?: string;
  metadata?: {
    equipmentId: string;
    equipmentCode: string;
    equipmentName: string;
    size: number;
    format: string;
  };
}

interface BulkQRCodeResult {
  success: boolean;
  results: QRCodeGenerationResult[];
  totalGenerated: number;
  totalFailed: number;
  zipFilePath?: string;
}

/**
 * QR Code service for equipment tracking
 */
export class QRCodeService {
  private static readonly QR_CODES_DIR = 'uploads/qr-codes';
  private static readonly BRANDING_DIR = 'uploads/branding';

  /**
   * Initialize QR code service
   */
  static async initialize(): Promise<void> {
    try {
      // Ensure directories exist
      await fs.mkdir(this.QR_CODES_DIR, { recursive: true });
      await fs.mkdir(this.BRANDING_DIR, { recursive: true });
      
      logger.info('QR Code service initialized');
    } catch (error) {
      logger.error('Failed to initialize QR Code service:', error);
      throw error;
    }
  }

  /**
   * Generate QR code for equipment
   */
  static async generateQRCode(
    data: z.infer<typeof generateQRSchema>,
    schoolId: string,
    organizationId: string
  ): Promise<QRCodeGenerationResult> {
    try {
      const validatedData = generateQRSchema.parse(data);
      
      // Get equipment details
      const equipment = await prisma.equipment.findFirst({
        where: {
          id: validatedData.equipmentId,
          isDeleted: false,
          OR: [
            { schoolId },
            { organizationId, schoolId: null }
          ]
        },
        include: {
          school: { select: { name: true, logoUrl: true, primaryColor: true } },
          organization: { select: { name: true, logoUrl: true, primaryColor: true } }
        }
      });

      if (!equipment) {
        return { success: false, error: 'Equipment not found or not accessible' };
      }

      // Generate QR code data with equipment tracking URL
      const qrData = this.generateQRCodeData(equipment, schoolId, organizationId);
      
      // Generate base QR code
      let qrCodeBuffer: Buffer;
      
      if (validatedData.format === 'SVG') {
        const svgString = await QRCode.toString(qrData, {
          type: 'svg',
          width: validatedData.size,
          errorCorrectionLevel: validatedData.errorCorrectionLevel,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
        qrCodeBuffer = Buffer.from(svgString);
      } else {
        qrCodeBuffer = await QRCode.toBuffer(qrData, {
          type: 'png',
          width: validatedData.size,
          errorCorrectionLevel: validatedData.errorCorrectionLevel,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
      }

      // Apply school branding if requested and format is PNG
      if (validatedData.includeSchoolBranding && validatedData.format === 'PNG') {
        qrCodeBuffer = await this.applySchoolBranding(
          qrCodeBuffer, 
          equipment, 
          validatedData.size
        );
      }

      // Save QR code to file
      const filename = `${equipment.code}_${Date.now()}.${validatedData.format.toLowerCase()}`;
      const filePath = path.join(this.QR_CODES_DIR, filename);
      const fullPath = path.resolve(filePath);
      
      await fs.writeFile(fullPath, qrCodeBuffer);

      // Update equipment with QR code information
      await prisma.equipment.update({
        where: { id: validatedData.equipmentId },
        data: {
          qrCode: qrData,
          qrCodeUrl: `/uploads/qr-codes/${filename}`,
          qrCodeGenerated: true,
          qrCodeGeneratedAt: new Date()
        }
      });

      // Log QR code generation
      await prisma.auditLog.create({
        data: {
          action: 'QR_CODE_GENERATED',
          entityType: 'EQUIPMENT',
          entityId: equipment.id,
          userId: 'SYSTEM',
          schoolId,
          organizationId,
          details: {
            equipmentCode: equipment.code,
            qrCodeUrl: `/uploads/qr-codes/${filename}`,
            size: validatedData.size,
            format: validatedData.format,
            withBranding: validatedData.includeSchoolBranding
          }
        }
      });

      return {
        success: true,
        qrCodeUrl: `/uploads/qr-codes/${filename}`,
        filePath: fullPath,
        metadata: {
          equipmentId: equipment.id,
          equipmentCode: equipment.code,
          equipmentName: equipment.name,
          size: validatedData.size,
          format: validatedData.format
        }
      };

    } catch (error) {
      logger.error('QR code generation error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to generate QR code' 
      };
    }
  }

  /**
   * Bulk generate QR codes for multiple equipment
   */
  static async bulkGenerateQRCodes(
    data: z.infer<typeof bulkGenerateQRSchema>,
    schoolId: string,
    organizationId: string
  ): Promise<BulkQRCodeResult> {
    try {
      const validatedData = bulkGenerateQRSchema.parse(data);
      const results: QRCodeGenerationResult[] = [];

      // Process each equipment item
      for (const equipmentId of validatedData.equipmentIds) {
        const result = await this.generateQRCode(
          {
            equipmentId,
            size: validatedData.size,
            errorCorrectionLevel: validatedData.errorCorrectionLevel,
            includeSchoolBranding: validatedData.includeSchoolBranding,
            format: validatedData.format
          },
          schoolId,
          organizationId
        );
        
        results.push(result);
      }

      const successfulResults = results.filter(r => r.success);
      const failedResults = results.filter(r => !r.success);

      // If we have successful results, create a zip file for bulk download
      let zipFilePath: string | undefined;
      if (successfulResults.length > 1) {
        zipFilePath = await this.createQRCodeZip(successfulResults, schoolId);
      }

      return {
        success: successfulResults.length > 0,
        results,
        totalGenerated: successfulResults.length,
        totalFailed: failedResults.length,
        zipFilePath
      };

    } catch (error) {
      logger.error('Bulk QR code generation error:', error);
      return {
        success: false,
        results: [],
        totalGenerated: 0,
        totalFailed: data.equipmentIds?.length || 0
      };
    }
  }

  /**
   * Look up equipment by QR code
   */
  static async lookupEquipmentByQR(
    qrCode: string,
    schoolId: string,
    organizationId: string
  ) {
    try {
      const equipment = await prisma.equipment.findFirst({
        where: {
          qrCode,
          isDeleted: false,
          OR: [
            { schoolId },
            { organizationId, schoolId: null }
          ]
        },
        include: {
          category: { select: { name: true, code: true } },
          location: { select: { name: true, code: true } },
          school: { select: { name: true } },
          organization: { select: { name: true } },
          transactions: {
            where: { status: { in: ['CHECKED_OUT', 'OVERDUE'] } },
            include: {
              user: { select: { firstName: true, lastName: true, email: true } }
            },
            orderBy: { checkedOutAt: 'desc' },
            take: 1
          }
        }
      });

      if (!equipment) {
        return {
          success: false,
          error: 'Equipment not found or QR code invalid'
        };
      }

      // Log QR code lookup
      await prisma.auditLog.create({
        data: {
          action: 'QR_CODE_LOOKUP',
          entityType: 'EQUIPMENT',
          entityId: equipment.id,
          userId: 'SYSTEM',
          schoolId,
          organizationId,
          details: {
            qrCode,
            equipmentCode: equipment.code,
            lookupTime: new Date()
          }
        }
      });

      return {
        success: true,
        equipment: {
          id: equipment.id,
          name: equipment.name,
          code: equipment.code,
          status: equipment.status,
          description: equipment.description,
          category: equipment.category,
          location: equipment.location,
          school: equipment.school?.name,
          organization: equipment.organization?.name,
          currentTransaction: equipment.transactions[0] || null,
          lastUpdated: equipment.updatedAt,
          qrCodeGenerated: equipment.qrCodeGeneratedAt
        }
      };

    } catch (error) {
      logger.error('QR code lookup error:', error);
      return {
        success: false,
        error: 'Failed to lookup equipment'
      };
    }
  }

  /**
   * Regenerate QR code for equipment (e.g., if damaged)
   */
  static async regenerateQRCode(
    equipmentId: string,
    schoolId: string,
    organizationId: string,
    reason?: string
  ): Promise<QRCodeGenerationResult> {
    try {
      // Delete old QR code file if it exists
      const equipment = await prisma.equipment.findFirst({
        where: {
          id: equipmentId,
          OR: [{ schoolId }, { organizationId, schoolId: null }]
        }
      });

      if (!equipment) {
        return { success: false, error: 'Equipment not found' };
      }

      // Remove old QR code file
      if (equipment.qrCodeUrl) {
        try {
          const oldFilePath = path.join(process.cwd(), equipment.qrCodeUrl);
          await fs.unlink(oldFilePath);
        } catch (error) {
          logger.warn('Failed to delete old QR code file:', error);
        }
      }

      // Generate new QR code
      const result = await this.generateQRCode(
        { equipmentId },
        schoolId,
        organizationId
      );

      if (result.success) {
        // Log regeneration
        await prisma.auditLog.create({
          data: {
            action: 'QR_CODE_REGENERATED',
            entityType: 'EQUIPMENT',
            entityId: equipmentId,
            userId: 'SYSTEM',
            schoolId,
            organizationId,
            details: {
              reason: reason || 'QR code regeneration requested',
              oldQrCode: equipment.qrCode,
              newQrCodeUrl: result.qrCodeUrl
            }
          }
        });
      }

      return result;

    } catch (error) {
      logger.error('QR code regeneration error:', error);
      return { success: false, error: 'Failed to regenerate QR code' };
    }
  }

  /**
   * Get QR code statistics for school/organization
   */
  static async getQRCodeStats(schoolId: string, organizationId: string) {
    try {
      const [totalEquipment, withQRCodes, recentlyGenerated] = await Promise.all([
        // Total equipment count
        prisma.equipment.count({
          where: {
            OR: [{ schoolId }, { organizationId, schoolId: null }],
            isDeleted: false
          }
        }),

        // Equipment with QR codes
        prisma.equipment.count({
          where: {
            OR: [{ schoolId }, { organizationId, schoolId: null }],
            isDeleted: false,
            qrCodeGenerated: true
          }
        }),

        // Recently generated (last 30 days)
        prisma.equipment.count({
          where: {
            OR: [{ schoolId }, { organizationId, schoolId: null }],
            isDeleted: false,
            qrCodeGenerated: true,
            qrCodeGeneratedAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            }
          }
        })
      ]);

      return {
        totalEquipment,
        withQRCodes,
        withoutQRCodes: totalEquipment - withQRCodes,
        qrCodeCoverage: totalEquipment > 0 ? (withQRCodes / totalEquipment) * 100 : 0,
        recentlyGenerated
      };

    } catch (error) {
      logger.error('QR code stats error:', error);
      throw error;
    }
  }

  /**
   * Generate QR code data string
   */
  private static generateQRCodeData(equipment: any, schoolId: string, organizationId: string): string {
    // Create a tracking URL that includes equipment information
    const baseUrl = config.frontend.url || 'https://app.etrax.com';
    
    return JSON.stringify({
      type: 'ETRAX_EQUIPMENT',
      version: '1.0',
      equipmentId: equipment.id,
      code: equipment.code,
      name: equipment.name,
      schoolId,
      organizationId,
      trackingUrl: `${baseUrl}/equipment/${equipment.id}?qr=1`,
      generatedAt: new Date().toISOString()
    });
  }

  /**
   * Apply school branding to QR code
   */
  private static async applySchoolBranding(
    qrCodeBuffer: Buffer, 
    equipment: any, 
    size: number
  ): Promise<Buffer> {
    try {
      const school = equipment.school || equipment.organization;
      if (!school?.logoUrl || !school?.primaryColor) {
        return qrCodeBuffer;
      }

      // Create branded QR code with school logo and colors
      const brandedSize = Math.round(size * 1.2); // Make room for branding
      const logoSize = Math.round(size * 0.15); // Logo size
      
      let brandedQR = sharp({
        create: {
          width: brandedSize,
          height: brandedSize + 80, // Extra space for text
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      });

      // Composite QR code centered
      const qrOffset = Math.round((brandedSize - size) / 2);
      
      const pipeline = brandedQR.composite([
        {
          input: qrCodeBuffer,
          top: qrOffset,
          left: qrOffset
        }
      ]);

      // Add school logo if available
      if (school.logoUrl && await this.fileExists(school.logoUrl)) {
        try {
          const logoBuffer = await fs.readFile(school.logoUrl);
          const resizedLogo = await sharp(logoBuffer)
            .resize(logoSize, logoSize, { fit: 'inside' })
            .png()
            .toBuffer();

          pipeline.composite([
            {
              input: resizedLogo,
              top: brandedSize - logoSize - 10,
              left: 10
            }
          ]);
        } catch (error) {
          logger.warn('Failed to add logo to QR code:', error);
        }
      }

      return await pipeline.png().toBuffer();

    } catch (error) {
      logger.warn('Failed to apply school branding, using plain QR code:', error);
      return qrCodeBuffer;
    }
  }

  /**
   * Create zip file for bulk QR codes
   */
  private static async createQRCodeZip(
    results: QRCodeGenerationResult[], 
    schoolId: string
  ): Promise<string> {
    const archiver = require('archiver');
    const timestamp = Date.now();
    const zipFilename = `qr-codes-${schoolId}-${timestamp}.zip`;
    const zipPath = path.join(this.QR_CODES_DIR, zipFilename);
    
    return new Promise((resolve, reject) => {
      const output = require('fs').createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        resolve(`/uploads/qr-codes/${zipFilename}`);
      });

      archive.on('error', (err: Error) => {
        reject(err);
      });

      archive.pipe(output);

      // Add each QR code file to the zip
      results.forEach(result => {
        if (result.success && result.filePath && result.metadata) {
          const filename = `${result.metadata.equipmentCode}_qr.${result.metadata.format.toLowerCase()}`;
          archive.file(result.filePath, { name: filename });
        }
      });

      archive.finalize();
    });
  }

  /**
   * Check if file exists
   */
  private static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate QR code format
   */
  static validateQRCode(qrData: string): { isValid: boolean; error?: string; data?: any } {
    try {
      const parsed = JSON.parse(qrData);
      
      if (parsed.type !== 'ETRAX_EQUIPMENT') {
        return { isValid: false, error: 'Invalid QR code type' };
      }

      if (!parsed.equipmentId || !parsed.code) {
        return { isValid: false, error: 'Missing required equipment data' };
      }

      return { isValid: true, data: parsed };
    } catch (error) {
      return { isValid: false, error: 'Invalid QR code format' };
    }
  }

  /**
   * Clean up old QR code files
   */
  static async cleanupOldQRCodes(daysOld: number = 90): Promise<number> {
    try {
      const files = await fs.readdir(this.QR_CODES_DIR);
      const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
      let deletedCount = 0;

      for (const file of files) {
        if (file.endsWith('.zip')) continue; // Skip zip files
        
        const filePath = path.join(this.QR_CODES_DIR, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          // Check if QR code is still referenced in database
          const qrCodeUrl = `/uploads/qr-codes/${file}`;
          const equipment = await prisma.equipment.findFirst({
            where: { qrCodeUrl }
          });

          if (!equipment) {
            await fs.unlink(filePath);
            deletedCount++;
            logger.debug(`Deleted old QR code file: ${file}`);
          }
        }
      }

      logger.info(`Cleaned up ${deletedCount} old QR code files`);
      return deletedCount;

    } catch (error) {
      logger.error('QR code cleanup error:', error);
      return 0;
    }
  }
}