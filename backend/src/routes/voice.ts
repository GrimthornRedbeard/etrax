import express from 'express';
import {
  VoiceService,
  voiceCommandSchema,
  voiceIntentSchema
} from '@/services/voice';
import { authMiddleware } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { rateLimiter } from '@/middleware/rateLimiter';
import { ApiError } from '@/middleware/errorHandler';
import { z } from 'zod';

const router = express.Router();

// Validation schemas for route-specific data
const processCommandSchema = z.object({
  command: z.string().min(1, 'Command is required').max(500, 'Command too long'),
  confidence: z.number().min(0).max(1).optional(),
  timestamp: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
});

const batchProcessSchema = z.object({
  commands: z.array(processCommandSchema).min(1).max(10, 'Maximum 10 commands at once'),
});

// Apply authentication to all routes
router.use(authMiddleware);

/**
 * @route   POST /api/voice/process
 * @desc    Process single voice command
 * @access  Private
 */
router.post(
  '/process',
  rateLimiter.voice, // Special rate limiter for voice commands
  validateRequest(processCommandSchema),
  async (req, res, next) => {
    try {
      const { userId, schoolId, organizationId } = req.user!;
      const { command, confidence, timestamp, metadata } = req.body;

      const result = await VoiceService.processVoiceCommand(
        command,
        userId,
        schoolId!,
        organizationId!,
        confidence
      );

      // Include additional metadata in response
      const response = {
        ...result,
        processedAt: new Date().toISOString(),
        command: command,
        confidence: confidence,
        userId: userId
      };

      if (!result.success) {
        // Don't throw error for failed commands, just return the result
        res.status(200).json(response);
      } else {
        res.json(response);
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/voice/batch
 * @desc    Process multiple voice commands in batch
 * @access  Private (Admin/Manager/Staff only)
 */
router.post(
  '/batch',
  rateLimiter.api,
  validateRequest(batchProcessSchema),
  async (req, res, next) => {
    try {
      const { userId, role, schoolId, organizationId } = req.user!;
      const { commands } = req.body;

      // Check permissions for batch processing
      if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
        throw new ApiError('Insufficient permissions for batch voice processing', 403);
      }

      const results = [];
      let successCount = 0;
      let failureCount = 0;

      // Process each command
      for (const commandData of commands) {
        try {
          const result = await VoiceService.processVoiceCommand(
            commandData.command,
            userId,
            schoolId!,
            organizationId!,
            commandData.confidence
          );

          results.push({
            command: commandData.command,
            ...result,
            processedAt: new Date().toISOString()
          });

          if (result.success) {
            successCount++;
          } else {
            failureCount++;
          }
        } catch (error) {
          results.push({
            command: commandData.command,
            success: false,
            message: 'Failed to process command',
            error: error instanceof Error ? error.message : 'Unknown error',
            processedAt: new Date().toISOString()
          });
          failureCount++;
        }
      }

      res.json({
        message: `Batch processing completed: ${successCount} successful, ${failureCount} failed`,
        totalProcessed: commands.length,
        successCount,
        failureCount,
        results
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/voice/help
 * @desc    Get voice command help and available commands
 * @access  Private
 */
router.get('/help', rateLimiter.api, async (req, res, next) => {
  try {
    const helpInfo = {
      message: "Voice Command Help - Available Commands",
      categories: {
        equipment_management: {
          description: "Manage equipment checkout and returns",
          commands: [
            "Check out [equipment name]",
            "Borrow [equipment name]",
            "Return [equipment name]",
            "Check in [equipment name]"
          ],
          examples: [
            "Check out basketball",
            "Return tennis racket",
            "Borrow volleyball net"
          ]
        },
        equipment_search: {
          description: "Find and locate equipment",
          commands: [
            "Find [equipment name]",
            "Where is [equipment name]",
            "Locate [equipment name]",
            "Search for [equipment name]"
          ],
          examples: [
            "Find soccer ball",
            "Where is the gym mat",
            "Locate basketball hoop"
          ]
        },
        status_management: {
          description: "Check and update equipment status",
          commands: [
            "Status of [equipment name]",
            "What is the status of [equipment name]",
            "Set [equipment name] to [status]",
            "Mark [equipment name] as [status]"
          ],
          examples: [
            "Status of football",
            "Set tennis racket to maintenance",
            "Mark volleyball as damaged"
          ]
        },
        inventory: {
          description: "View inventory information",
          commands: [
            "List all equipment",
            "Show all equipment", 
            "What equipment do we have",
            "Inventory list"
          ]
        },
        general: {
          description: "General commands",
          commands: [
            "Help",
            "What can you do",
            "Commands"
          ]
        }
      },
      tips: [
        "Speak clearly and use the equipment name or code",
        "You can use natural language - I'll understand variations",
        "If I don't understand, I'll ask for clarification",
        "Equipment codes (like 'BBL-001') work well for precise matching"
      ],
      supported_statuses: [
        "Available",
        "Checked out", 
        "Maintenance",
        "Damaged",
        "Lost",
        "Retired",
        "Reserved"
      ]
    };

    res.json(helpInfo);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/voice/stats
 * @desc    Get voice command usage statistics
 * @access  Private (Admin/Manager only)
 */
router.get('/stats', rateLimiter.api, async (req, res, next) => {
  try {
    const { role, schoolId, organizationId } = req.user!;

    // Check permissions for voice statistics
    if (!['ADMIN', 'MANAGER'].includes(role)) {
      throw new ApiError('Insufficient permissions to view voice statistics', 403);
    }

    const stats = await VoiceService.getVoiceStats(schoolId!, organizationId!);

    res.json({
      message: 'Voice command statistics retrieved successfully',
      stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/voice/test
 * @desc    Test voice command processing (development/testing)
 * @access  Private (Admin only)
 */
const testCommandSchema = z.object({
  testCommands: z.array(z.string()).min(1).max(20),
  includeIntentAnalysis: z.boolean().optional().default(false)
});

router.post(
  '/test',
  rateLimiter.api,
  validateRequest(testCommandSchema),
  async (req, res, next) => {
    try {
      const { role, userId, schoolId, organizationId } = req.user!;
      const { testCommands, includeIntentAnalysis } = req.body;

      // Check permissions for testing
      if (role !== 'ADMIN') {
        throw new ApiError('Insufficient permissions for voice command testing', 403);
      }

      const testResults = [];

      for (const command of testCommands) {
        try {
          const result = await VoiceService.processVoiceCommand(
            command,
            userId,
            schoolId!,
            organizationId!,
            1.0 // Full confidence for testing
          );

          const testResult: any = {
            command,
            success: result.success,
            message: result.message,
            hasData: !!result.data,
            hasSuggestions: !!result.suggestions,
            hasFollowUp: !!result.followUp
          };

          if (includeIntentAnalysis) {
            // This would require exposing the parseIntent method
            testResult.intentAnalysis = {
              note: "Intent analysis requires additional implementation"
            };
          }

          testResults.push(testResult);
        } catch (error) {
          testResults.push({
            command,
            success: false,
            error: error instanceof Error ? error.message : 'Test failed',
            message: 'Command processing failed during test'
          });
        }
      }

      res.json({
        message: 'Voice command testing completed',
        totalTests: testCommands.length,
        results: testResults,
        summary: {
          successful: testResults.filter(r => r.success).length,
          failed: testResults.filter(r => !r.success).length
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/voice/cache
 * @desc    Clear voice service cache
 * @access  Private (Admin only)
 */
router.delete('/cache', rateLimiter.api, async (req, res, next) => {
  try {
    const { role } = req.user!;

    // Check permissions for cache clearing
    if (role !== 'ADMIN') {
      throw new ApiError('Insufficient permissions to clear voice cache', 403);
    }

    VoiceService.clearCache();

    res.json({
      message: 'Voice service cache cleared successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/voice/intents
 * @desc    Get available voice intents and their patterns
 * @access  Private (Admin/Manager only)
 */
router.get('/intents', rateLimiter.api, async (req, res, next) => {
  try {
    const { role } = req.user!;

    // Check permissions for intent information
    if (!['ADMIN', 'MANAGER'].includes(role)) {
      throw new ApiError('Insufficient permissions to view voice intents', 403);
    }

    const intentInfo = {
      availableIntents: [
        {
          intent: 'CHECKOUT_EQUIPMENT',
          description: 'Check out equipment to a user',
          patterns: [
            'check out {equipment}',
            'borrow {equipment}',
            'take {equipment}',
            'get {equipment}',
            'sign out {equipment}'
          ]
        },
        {
          intent: 'CHECKIN_EQUIPMENT',
          description: 'Return equipment from a user',
          patterns: [
            'check in {equipment}',
            'return {equipment}',
            'give back {equipment}',
            'sign in {equipment}',
            'bring back {equipment}'
          ]
        },
        {
          intent: 'FIND_EQUIPMENT',
          description: 'Locate equipment and get its information',
          patterns: [
            'find {equipment}',
            'where is {equipment}',
            'locate {equipment}',
            'search for {equipment}',
            'look for {equipment}'
          ]
        },
        {
          intent: 'SET_STATUS',
          description: 'Change equipment status',
          patterns: [
            'set {equipment} to {status}',
            'mark {equipment} as {status}',
            'change {equipment} to {status}',
            'update {equipment} status to {status}'
          ]
        },
        {
          intent: 'GET_STATUS',
          description: 'Check equipment status',
          patterns: [
            'status of {equipment}',
            'what is the status of {equipment}',
            'check status {equipment}',
            'how is {equipment}'
          ]
        },
        {
          intent: 'LIST_EQUIPMENT',
          description: 'List all available equipment',
          patterns: [
            'list all equipment',
            'show all equipment',
            'what equipment do we have',
            'inventory list'
          ]
        },
        {
          intent: 'HELP',
          description: 'Get help with voice commands',
          patterns: [
            'help',
            'what can you do',
            'commands',
            'assistance'
          ]
        }
      ],
      entityTypes: [
        {
          type: 'equipment',
          description: 'Equipment name or code',
          examples: ['basketball', 'tennis racket', 'BBL-001', 'gym mat']
        },
        {
          type: 'status',
          description: 'Equipment status',
          examples: ['available', 'maintenance', 'damaged', 'lost', 'retired']
        }
      ],
      confidenceThresholds: {
        high: 0.8,
        medium: 0.5,
        low: 0.2,
        rejected: 0.5
      }
    };

    res.json({
      message: 'Voice intent information retrieved successfully',
      ...intentInfo
    });
  } catch (error) {
    next(error);
  }
});

export default router;