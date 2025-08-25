import { z } from 'zod';
import { prisma } from '@/index';
import { logger } from '@/utils/logger';
import { checkOutEquipment, checkInEquipment } from '@/services/transaction';
import { executeStatusTransition } from '@/services/workflow';

// Validation schemas
export const voiceCommandSchema = z.object({
  command: z.string().min(1, 'Command is required'),
  confidence: z.number().min(0).max(1).optional(),
  timestamp: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
});

export const voiceIntentSchema = z.object({
  intent: z.enum([
    'CHECKOUT_EQUIPMENT',
    'CHECKIN_EQUIPMENT', 
    'FIND_EQUIPMENT',
    'SET_STATUS',
    'GET_STATUS',
    'LIST_EQUIPMENT',
    'HELP',
    'UNKNOWN'
  ]),
  entities: z.record(z.any()).optional(),
  confidence: z.number().min(0).max(1),
  originalCommand: z.string(),
});

// Intent patterns and entities
const INTENT_PATTERNS = {
  CHECKOUT_EQUIPMENT: [
    /check\s+out\s+(.+)/i,
    /borrow\s+(.+)/i,
    /take\s+(.+)/i,
    /get\s+(.+)/i,
    /sign\s+out\s+(.+)/i
  ],
  CHECKIN_EQUIPMENT: [
    /check\s+in\s+(.+)/i,
    /return\s+(.+)/i,
    /give\s+back\s+(.+)/i,
    /sign\s+in\s+(.+)/i,
    /bring\s+back\s+(.+)/i
  ],
  FIND_EQUIPMENT: [
    /find\s+(.+)/i,
    /where\s+is\s+(.+)/i,
    /locate\s+(.+)/i,
    /search\s+for\s+(.+)/i,
    /look\s+for\s+(.+)/i
  ],
  SET_STATUS: [
    /set\s+(.+)\s+to\s+(.+)/i,
    /mark\s+(.+)\s+as\s+(.+)/i,
    /change\s+(.+)\s+to\s+(.+)/i,
    /update\s+(.+)\s+status\s+to\s+(.+)/i
  ],
  GET_STATUS: [
    /status\s+of\s+(.+)/i,
    /what\s+is\s+the\s+status\s+of\s+(.+)/i,
    /check\s+status\s+(.+)/i,
    /how\s+is\s+(.+)/i
  ],
  LIST_EQUIPMENT: [
    /list\s+all\s+equipment/i,
    /show\s+all\s+equipment/i,
    /what\s+equipment\s+do\s+we\s+have/i,
    /inventory\s+list/i
  ],
  HELP: [
    /help/i,
    /what\s+can\s+you\s+do/i,
    /commands/i,
    /assistance/i
  ]
};

const STATUS_MAPPING = {
  'available': 'AVAILABLE',
  'checked out': 'CHECKED_OUT',
  'maintenance': 'MAINTENANCE',
  'damaged': 'DAMAGED',
  'lost': 'LOST',
  'retired': 'RETIRED',
  'reserved': 'RESERVED',
  'overdue': 'OVERDUE'
};

interface VoiceCommandResult {
  success: boolean;
  message: string;
  data?: any;
  suggestions?: string[];
  followUp?: string;
}

interface ProcessedIntent {
  intent: string;
  entities: Record<string, any>;
  confidence: number;
  originalCommand: string;
}

/**
 * Voice Command Processing Service
 */
export class VoiceService {
  private static equipmentCache = new Map<string, any[]>();
  private static cacheExpiry = new Map<string, number>();
  private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Process voice command and return structured result
   */
  static async processVoiceCommand(
    command: string,
    userId: string,
    schoolId: string,
    organizationId: string,
    confidence?: number
  ): Promise<VoiceCommandResult> {
    try {
      // Parse and classify the command
      const intent = await this.parseIntent(command);
      
      if (intent.confidence < 0.5) {
        return {
          success: false,
          message: "I'm not sure what you meant. Could you please rephrase that?",
          suggestions: [
            "Try saying 'check out basketball'",
            "Or 'return tennis racket'",
            "Or 'find volleyball net'"
          ]
        };
      }

      // Process the intent
      const result = await this.executeIntent(intent, userId, schoolId, organizationId);

      // Log the voice command
      await this.logVoiceCommand(command, intent, result, userId, schoolId, organizationId);

      return result;
    } catch (error) {
      logger.error('Voice command processing error:', error);
      return {
        success: false,
        message: 'Sorry, I encountered an error processing your command. Please try again.',
      };
    }
  }

  /**
   * Parse natural language command into structured intent
   */
  private static async parseIntent(command: string): Promise<ProcessedIntent> {
    const normalizedCommand = command.toLowerCase().trim();
    
    // Try to match against known patterns
    for (const [intentName, patterns] of Object.entries(INTENT_PATTERNS)) {
      for (const pattern of patterns) {
        const match = normalizedCommand.match(pattern);
        if (match) {
          const entities = await this.extractEntities(match, intentName);
          return {
            intent: intentName,
            entities,
            confidence: 0.85, // High confidence for pattern matches
            originalCommand: command
          };
        }
      }
    }

    // Use fuzzy matching for equipment names
    const equipmentMatch = await this.fuzzyMatchEquipment(normalizedCommand);
    if (equipmentMatch.confidence > 0.7) {
      // Determine likely intent based on context words
      const intent = this.inferIntentFromContext(normalizedCommand);
      return {
        intent,
        entities: { equipment: equipmentMatch.equipment },
        confidence: equipmentMatch.confidence * 0.8, // Slightly lower for fuzzy matches
        originalCommand: command
      };
    }

    return {
      intent: 'UNKNOWN',
      entities: {},
      confidence: 0.1,
      originalCommand: command
    };
  }

  /**
   * Extract entities from matched patterns
   */
  private static async extractEntities(match: RegExpMatchArray, intentName: string): Promise<Record<string, any>> {
    const entities: Record<string, any> = {};

    switch (intentName) {
      case 'CHECKOUT_EQUIPMENT':
      case 'CHECKIN_EQUIPMENT':
      case 'FIND_EQUIPMENT':
        if (match[1]) {
          const equipmentMatch = await this.findBestEquipmentMatch(match[1]);
          if (equipmentMatch) {
            entities.equipment = equipmentMatch;
          } else {
            entities.equipmentQuery = match[1].trim();
          }
        }
        break;

      case 'SET_STATUS':
        if (match[1] && match[2]) {
          const equipmentMatch = await this.findBestEquipmentMatch(match[1]);
          if (equipmentMatch) {
            entities.equipment = equipmentMatch;
          }
          entities.status = this.normalizeStatus(match[2]);
        }
        break;

      case 'GET_STATUS':
        if (match[1]) {
          const equipmentMatch = await this.findBestEquipmentMatch(match[1]);
          if (equipmentMatch) {
            entities.equipment = equipmentMatch;
          }
        }
        break;
    }

    return entities;
  }

  /**
   * Execute the parsed intent
   */
  private static async executeIntent(
    intent: ProcessedIntent,
    userId: string,
    schoolId: string,
    organizationId: string
  ): Promise<VoiceCommandResult> {
    switch (intent.intent) {
      case 'CHECKOUT_EQUIPMENT':
        return await this.executeCheckout(intent, userId, schoolId, organizationId);
      
      case 'CHECKIN_EQUIPMENT':
        return await this.executeCheckin(intent, userId, schoolId, organizationId);
      
      case 'FIND_EQUIPMENT':
        return await this.executeFind(intent, schoolId, organizationId);
      
      case 'SET_STATUS':
        return await this.executeSetStatus(intent, userId, schoolId, organizationId);
      
      case 'GET_STATUS':
        return await this.executeGetStatus(intent, schoolId, organizationId);
      
      case 'LIST_EQUIPMENT':
        return await this.executeListEquipment(intent, schoolId, organizationId);
      
      case 'HELP':
        return this.executeHelp();
      
      default:
        return {
          success: false,
          message: "I don't understand that command. Say 'help' to see what I can do.",
          suggestions: [
            "Check out equipment",
            "Return equipment", 
            "Find equipment",
            "Get help"
          ]
        };
    }
  }

  /**
   * Execute equipment checkout
   */
  private static async executeCheckout(
    intent: ProcessedIntent,
    userId: string,
    schoolId: string,
    organizationId: string
  ): Promise<VoiceCommandResult> {
    if (!intent.entities.equipment && !intent.entities.equipmentQuery) {
      return {
        success: false,
        message: "What equipment would you like to check out?",
        followUp: "Please specify the equipment name or code."
      };
    }

    let equipment = intent.entities.equipment;
    
    if (!equipment && intent.entities.equipmentQuery) {
      const matches = await this.searchEquipment(intent.entities.equipmentQuery, schoolId, organizationId);
      if (matches.length === 0) {
        return {
          success: false,
          message: `I couldn't find any equipment matching "${intent.entities.equipmentQuery}".`,
          suggestions: ["Try using the equipment code", "Or be more specific with the name"]
        };
      } else if (matches.length > 1) {
        return {
          success: false,
          message: `I found ${matches.length} equipment items matching "${intent.entities.equipmentQuery}". Please be more specific.`,
          data: matches.slice(0, 5).map(e => ({ name: e.name, code: e.code }))
        };
      }
      equipment = matches[0];
    }

    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7); // Default 7 days

      const result = await checkOutEquipment(
        {
          equipmentId: equipment.id,
          userId,
          dueDate,
          notes: `Checked out via voice command: "${intent.originalCommand}"`
        },
        userId,
        schoolId,
        organizationId
      );

      return {
        success: true,
        message: `Successfully checked out ${equipment.name} (${equipment.code}). Due back in 7 days.`,
        data: { transaction: result }
      };
    } catch (error) {
      logger.error('Voice checkout error:', error);
      return {
        success: false,
        message: `I couldn't check out ${equipment.name}. It might already be checked out or unavailable.`
      };
    }
  }

  /**
   * Execute equipment checkin
   */
  private static async executeCheckin(
    intent: ProcessedIntent,
    userId: string,
    schoolId: string,
    organizationId: string
  ): Promise<VoiceCommandResult> {
    if (!intent.entities.equipment && !intent.entities.equipmentQuery) {
      return {
        success: false,
        message: "What equipment would you like to return?",
        followUp: "Please specify the equipment name or code."
      };
    }

    let equipment = intent.entities.equipment;
    
    if (!equipment && intent.entities.equipmentQuery) {
      const matches = await this.searchEquipment(intent.entities.equipmentQuery, schoolId, organizationId);
      if (matches.length === 0) {
        return {
          success: false,
          message: `I couldn't find any equipment matching "${intent.entities.equipmentQuery}".`
        };
      } else if (matches.length > 1) {
        return {
          success: false,
          message: `I found multiple equipment items. Please be more specific.`,
          data: matches.slice(0, 5).map(e => ({ name: e.name, code: e.code }))
        };
      }
      equipment = matches[0];
    }

    try {
      // Find active transaction
      const activeTransaction = await prisma.transaction.findFirst({
        where: {
          equipmentId: equipment.id,
          status: { in: ['CHECKED_OUT', 'OVERDUE'] }
        },
        orderBy: { checkedOutAt: 'desc' }
      });

      if (!activeTransaction) {
        return {
          success: false,
          message: `${equipment.name} is not currently checked out.`
        };
      }

      const result = await checkInEquipment(
        {
          transactionId: activeTransaction.id,
          returnNotes: `Returned via voice command: "${intent.originalCommand}"`
        },
        userId,
        schoolId,
        organizationId
      );

      return {
        success: true,
        message: `Successfully returned ${equipment.name} (${equipment.code}).`,
        data: { transaction: result }
      };
    } catch (error) {
      logger.error('Voice checkin error:', error);
      return {
        success: false,
        message: `I couldn't return ${equipment.name}. Please try again or check it in manually.`
      };
    }
  }

  /**
   * Execute equipment search/find
   */
  private static async executeFind(
    intent: ProcessedIntent,
    schoolId: string,
    organizationId: string
  ): Promise<VoiceCommandResult> {
    if (!intent.entities.equipment && !intent.entities.equipmentQuery) {
      return {
        success: false,
        message: "What equipment are you looking for?",
        followUp: "Please specify the equipment name or code."
      };
    }

    let equipment = intent.entities.equipment;
    
    if (!equipment && intent.entities.equipmentQuery) {
      const matches = await this.searchEquipment(intent.entities.equipmentQuery, schoolId, organizationId);
      if (matches.length === 0) {
        return {
          success: false,
          message: `I couldn't find any equipment matching "${intent.entities.equipmentQuery}".`
        };
      } else if (matches.length > 1) {
        return {
          success: false,
          message: `I found ${matches.length} equipment items:`,
          data: matches.slice(0, 10).map(e => ({
            name: e.name,
            code: e.code,
            status: e.status,
            location: e.location?.name
          }))
        };
      }
      equipment = matches[0];
    }

    // Get detailed equipment information
    const detailedEquipment = await prisma.equipment.findFirst({
      where: {
        id: equipment.id,
        OR: [{ schoolId }, { organizationId, schoolId: null }]
      },
      include: {
        location: { select: { name: true } },
        category: { select: { name: true } },
        transactions: {
          where: { status: { in: ['CHECKED_OUT', 'OVERDUE'] } },
          include: { user: { select: { firstName: true, lastName: true } } },
          take: 1
        }
      }
    });

    if (!detailedEquipment) {
      return {
        success: false,
        message: "I couldn't find that equipment."
      };
    }

    let statusMessage = `${detailedEquipment.name} (${detailedEquipment.code}) is currently ${detailedEquipment.status.toLowerCase()}`;
    
    if (detailedEquipment.location) {
      statusMessage += ` and located in ${detailedEquipment.location.name}`;
    }

    if (detailedEquipment.transactions.length > 0) {
      const transaction = detailedEquipment.transactions[0];
      statusMessage += `. It's checked out by ${transaction.user.firstName} ${transaction.user.lastName}`;
    }

    return {
      success: true,
      message: statusMessage,
      data: {
        equipment: {
          name: detailedEquipment.name,
          code: detailedEquipment.code,
          status: detailedEquipment.status,
          location: detailedEquipment.location?.name,
          category: detailedEquipment.category?.name,
          currentTransaction: detailedEquipment.transactions[0]
        }
      }
    };
  }

  /**
   * Execute status change
   */
  private static async executeSetStatus(
    intent: ProcessedIntent,
    userId: string,
    schoolId: string,
    organizationId: string
  ): Promise<VoiceCommandResult> {
    if (!intent.entities.equipment || !intent.entities.status) {
      return {
        success: false,
        message: "Please specify both the equipment and the status you want to set."
      };
    }

    const equipment = intent.entities.equipment;
    const newStatus = intent.entities.status;

    try {
      const result = await executeStatusTransition(equipment.id, newStatus, {
        equipmentId: equipment.id,
        userId,
        schoolId,
        organizationId,
        reason: `Status changed via voice command: "${intent.originalCommand}"`
      });

      if (!result.success) {
        return {
          success: false,
          message: result.message
        };
      }

      return {
        success: true,
        message: `Successfully set ${equipment.name} status to ${newStatus.toLowerCase()}.`,
        data: { newStatus: result.newStatus }
      };
    } catch (error) {
      logger.error('Voice status change error:', error);
      return {
        success: false,
        message: `I couldn't change the status of ${equipment.name}. Please try again.`
      };
    }
  }

  /**
   * Execute status check
   */
  private static async executeGetStatus(
    intent: ProcessedIntent,
    schoolId: string,
    organizationId: string
  ): Promise<VoiceCommandResult> {
    if (!intent.entities.equipment && !intent.entities.equipmentQuery) {
      return {
        success: false,
        message: "Which equipment's status do you want to check?"
      };
    }

    // Reuse the find logic
    return await this.executeFind(intent, schoolId, organizationId);
  }

  /**
   * Execute equipment listing
   */
  private static async executeListEquipment(
    intent: ProcessedIntent,
    schoolId: string,
    organizationId: string
  ): Promise<VoiceCommandResult> {
    try {
      const equipment = await prisma.equipment.findMany({
        where: {
          OR: [{ schoolId }, { organizationId, schoolId: null }],
          isDeleted: false
        },
        select: {
          name: true,
          code: true,
          status: true,
          category: { select: { name: true } }
        },
        orderBy: { name: 'asc' },
        take: 20 // Limit for voice response
      });

      const statusCounts = equipment.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const summary = Object.entries(statusCounts)
        .map(([status, count]) => `${count} ${status.toLowerCase()}`)
        .join(', ');

      return {
        success: true,
        message: `You have ${equipment.length} equipment items: ${summary}.`,
        data: {
          total: equipment.length,
          statusBreakdown: statusCounts,
          equipment: equipment.slice(0, 10) // First 10 for detailed view
        }
      };
    } catch (error) {
      logger.error('Voice list equipment error:', error);
      return {
        success: false,
        message: "I couldn't retrieve the equipment list. Please try again."
      };
    }
  }

  /**
   * Execute help command
   */
  private static executeHelp(): VoiceCommandResult {
    return {
      success: true,
      message: "I can help you manage equipment with voice commands. Here's what I can do:",
      data: {
        commands: [
          "Check out [equipment name] - Borrow equipment",
          "Return [equipment name] - Return equipment", 
          "Find [equipment name] - Locate equipment",
          "Status of [equipment name] - Check equipment status",
          "Set [equipment name] to [status] - Change equipment status",
          "List all equipment - Show inventory overview"
        ]
      },
      suggestions: [
        "Try saying 'check out basketball'",
        "Or 'where is the volleyball net'",
        "Or 'list all equipment'"
      ]
    };
  }

  /**
   * Find best equipment match using fuzzy matching
   */
  private static async findBestEquipmentMatch(query: string): Promise<any | null> {
    const fuzzyMatch = await this.fuzzyMatchEquipment(query);
    return fuzzyMatch.confidence > 0.6 ? fuzzyMatch.equipment : null;
  }

  /**
   * Fuzzy match equipment names and codes
   */
  private static async fuzzyMatchEquipment(query: string): Promise<{ equipment: any; confidence: number }> {
    // Get cached equipment or fetch from database
    const cacheKey = 'all_equipment';
    let equipment = this.equipmentCache.get(cacheKey);
    const now = Date.now();

    if (!equipment || (this.cacheExpiry.get(cacheKey) || 0) < now) {
      equipment = await prisma.equipment.findMany({
        where: { isDeleted: false },
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          schoolId: true,
          organizationId: true,
          location: { select: { name: true } }
        }
      });
      
      this.equipmentCache.set(cacheKey, equipment);
      this.cacheExpiry.set(cacheKey, now + this.CACHE_DURATION);
    }

    const normalizedQuery = query.toLowerCase().trim();
    let bestMatch: any = null;
    let bestScore = 0;

    for (const item of equipment) {
      // Exact code match gets highest score
      if (item.code.toLowerCase() === normalizedQuery) {
        return { equipment: item, confidence: 1.0 };
      }

      // Exact name match gets high score
      if (item.name.toLowerCase() === normalizedQuery) {
        return { equipment: item, confidence: 0.95 };
      }

      // Partial matches
      const codeScore = this.calculateSimilarity(normalizedQuery, item.code.toLowerCase());
      const nameScore = this.calculateSimilarity(normalizedQuery, item.name.toLowerCase());
      const maxScore = Math.max(codeScore, nameScore);

      if (maxScore > bestScore) {
        bestScore = maxScore;
        bestMatch = item;
      }
    }

    return {
      equipment: bestMatch,
      confidence: bestScore
    };
  }

  /**
   * Search equipment by query
   */
  private static async searchEquipment(query: string, schoolId: string, organizationId: string): Promise<any[]> {
    const normalizedQuery = query.toLowerCase();

    return await prisma.equipment.findMany({
      where: {
        OR: [{ schoolId }, { organizationId, schoolId: null }],
        isDeleted: false,
        OR: [
          { name: { contains: normalizedQuery, mode: 'insensitive' } },
          { code: { contains: normalizedQuery, mode: 'insensitive' } },
          { description: { contains: normalizedQuery, mode: 'insensitive' } }
        ]
      },
      include: {
        location: { select: { name: true } },
        category: { select: { name: true } }
      },
      take: 10
    });
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private static calculateSimilarity(str1: string, str2: string): number {
    const matrix: number[][] = [];
    const len1 = str1.length;
    const len2 = str2.length;

    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;

    // Initialize matrix
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    const maxLen = Math.max(len1, len2);
    const distance = matrix[len1][len2];
    return (maxLen - distance) / maxLen;
  }

  /**
   * Normalize status string to enum value
   */
  private static normalizeStatus(status: string): string {
    const normalized = status.toLowerCase().trim();
    return STATUS_MAPPING[normalized] || status.toUpperCase();
  }

  /**
   * Infer intent from context words when equipment is matched
   */
  private static inferIntentFromContext(command: string): string {
    const lowerCommand = command.toLowerCase();
    
    if (lowerCommand.includes('check out') || lowerCommand.includes('borrow') || lowerCommand.includes('take')) {
      return 'CHECKOUT_EQUIPMENT';
    }
    if (lowerCommand.includes('return') || lowerCommand.includes('check in') || lowerCommand.includes('give back')) {
      return 'CHECKIN_EQUIPMENT';
    }
    if (lowerCommand.includes('find') || lowerCommand.includes('where') || lowerCommand.includes('locate')) {
      return 'FIND_EQUIPMENT';
    }
    if (lowerCommand.includes('status')) {
      return 'GET_STATUS';
    }

    // Default to find if we can't determine intent
    return 'FIND_EQUIPMENT';
  }

  /**
   * Log voice command for analytics and debugging
   */
  private static async logVoiceCommand(
    command: string,
    intent: ProcessedIntent,
    result: VoiceCommandResult,
    userId: string,
    schoolId: string,
    organizationId: string
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action: 'VOICE_COMMAND',
          entityType: 'SYSTEM',
          entityId: 'voice_system',
          userId,
          schoolId,
          organizationId,
          details: {
            command,
            intent: intent.intent,
            confidence: intent.confidence,
            entities: intent.entities,
            success: result.success,
            message: result.message,
            timestamp: new Date().toISOString()
          }
        }
      });
    } catch (error) {
      logger.error('Failed to log voice command:', error);
    }
  }

  /**
   * Get voice command statistics
   */
  static async getVoiceStats(schoolId: string, organizationId: string) {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const stats = await prisma.auditLog.findMany({
        where: {
          action: 'VOICE_COMMAND',
          OR: [{ schoolId }, { organizationId, schoolId: null }],
          createdAt: { gte: thirtyDaysAgo }
        }
      });

      const intentCounts = stats.reduce((acc, log) => {
        const intent = log.details.intent;
        acc[intent] = (acc[intent] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const successRate = stats.length > 0 
        ? (stats.filter(log => log.details.success).length / stats.length) * 100 
        : 0;

      const avgConfidence = stats.length > 0
        ? stats.reduce((sum, log) => sum + (log.details.confidence || 0), 0) / stats.length
        : 0;

      return {
        totalCommands: stats.length,
        successRate: Math.round(successRate * 100) / 100,
        averageConfidence: Math.round(avgConfidence * 1000) / 1000,
        intentBreakdown: intentCounts,
        period: '30 days'
      };
    } catch (error) {
      logger.error('Voice stats error:', error);
      throw error;
    }
  }

  /**
   * Clear equipment cache (useful for testing or when data changes)
   */
  static clearCache(): void {
    this.equipmentCache.clear();
    this.cacheExpiry.clear();
  }
}