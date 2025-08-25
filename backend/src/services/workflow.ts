import { EquipmentStatus, TransactionType, PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';
import { createNotification } from '@/services/notification';

const prisma = new PrismaClient();

// Status transition rules
export const ALLOWED_TRANSITIONS: Record<EquipmentStatus, EquipmentStatus[]> = {
  AVAILABLE: ['CHECKED_OUT', 'MAINTENANCE', 'DAMAGED', 'RESERVED'],
  CHECKED_OUT: ['AVAILABLE', 'OVERDUE', 'LOST', 'DAMAGED'],
  MAINTENANCE: ['AVAILABLE', 'DAMAGED', 'RETIRED'],
  DAMAGED: ['MAINTENANCE', 'RETIRED', 'AVAILABLE'],
  LOST: ['AVAILABLE', 'RETIRED'],
  RETIRED: [], // Terminal state
  RESERVED: ['AVAILABLE', 'CHECKED_OUT'],
  OVERDUE: ['AVAILABLE', 'LOST', 'DAMAGED']
};

// Automatic transition conditions
export const AUTO_TRANSITION_RULES = {
  OVERDUE_THRESHOLD_HOURS: 72, // 3 days
  MAINTENANCE_DUE_DAYS: 30,
  LOST_THRESHOLD_DAYS: 14
};

interface StatusTransitionResult {
  success: boolean;
  newStatus?: EquipmentStatus;
  message: string;
  requiresApproval?: boolean;
  notifications?: string[];
}

interface WorkflowContext {
  equipmentId: string;
  userId: string;
  schoolId: string;
  organizationId: string;
  reason?: string;
  metadata?: Record<string, any>;
}

/**
 * Validates if a status transition is allowed
 */
export const isTransitionAllowed = (
  currentStatus: EquipmentStatus,
  newStatus: EquipmentStatus
): boolean => {
  return ALLOWED_TRANSITIONS[currentStatus].includes(newStatus);
};

/**
 * Executes a status transition with workflow rules
 */
export const executeStatusTransition = async (
  equipmentId: string,
  newStatus: EquipmentStatus,
  context: WorkflowContext
): Promise<StatusTransitionResult> => {
  try {
    const equipment = await prisma.equipment.findFirst({
      where: {
        id: equipmentId,
        isDeleted: false,
        OR: [
          { schoolId: context.schoolId },
          { organizationId: context.organizationId, schoolId: null }
        ]
      },
      include: {
        transactions: {
          where: { status: { in: ['CHECKED_OUT', 'OVERDUE'] } },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!equipment) {
      return {
        success: false,
        message: 'Equipment not found'
      };
    }

    // Check if transition is allowed
    if (!isTransitionAllowed(equipment.status as EquipmentStatus, newStatus)) {
      return {
        success: false,
        message: `Transition from ${equipment.status} to ${newStatus} is not allowed`
      };
    }

    // Apply business rules
    const ruleCheck = await applyBusinessRules(equipment, newStatus, context);
    if (!ruleCheck.success) {
      return ruleCheck;
    }

    // Execute the transition
    const result = await prisma.$transaction(async (tx) => {
      // Update equipment status
      const updatedEquipment = await tx.equipment.update({
        where: { id: equipmentId },
        data: {
          status: newStatus,
          lastStatusChange: new Date(),
          updatedAt: new Date()
        }
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          action: 'STATUS_CHANGE',
          entityType: 'EQUIPMENT',
          entityId: equipmentId,
          userId: context.userId,
          schoolId: context.schoolId,
          organizationId: context.organizationId,
          details: {
            previousStatus: equipment.status,
            newStatus,
            reason: context.reason,
            metadata: context.metadata
          }
        }
      });

      // Handle status-specific logic
      await handleStatusSpecificLogic(updatedEquipment, newStatus, context, tx);

      return updatedEquipment;
    });

    // Send notifications
    const notifications = await generateStatusNotifications(result, equipment.status as EquipmentStatus, newStatus, context);

    return {
      success: true,
      newStatus,
      message: `Equipment status updated to ${newStatus}`,
      notifications
    };

  } catch (error) {
    logger.error('Status transition error:', error);
    return {
      success: false,
      message: 'Failed to update equipment status'
    };
  }
};

/**
 * Applies business rules for status transitions
 */
const applyBusinessRules = async (
  equipment: any,
  newStatus: EquipmentStatus,
  context: WorkflowContext
): Promise<StatusTransitionResult> => {
  
  // Rule: Can't check out equipment that's already checked out
  if (newStatus === 'CHECKED_OUT' && equipment.status === 'CHECKED_OUT') {
    return {
      success: false,
      message: 'Equipment is already checked out'
    };
  }

  // Rule: Can't return equipment that's not checked out
  if (newStatus === 'AVAILABLE' && equipment.status === 'AVAILABLE') {
    return {
      success: false,
      message: 'Equipment is already available'
    };
  }

  // Rule: Damaged equipment requires reason
  if (newStatus === 'DAMAGED' && !context.reason) {
    return {
      success: false,
      message: 'Reason is required when marking equipment as damaged'
    };
  }

  // Rule: Lost equipment requires approval for high-value items
  if (newStatus === 'LOST' && equipment.purchasePrice > 500) {
    return {
      success: true,
      message: 'High-value equipment marked as lost - requires management approval',
      requiresApproval: true
    };
  }

  // Rule: Retirement requires approval
  if (newStatus === 'RETIRED') {
    return {
      success: true,
      message: 'Equipment retirement requires approval',
      requiresApproval: true
    };
  }

  return { success: true, message: 'Business rules passed' };
};

/**
 * Handles status-specific logic after transition
 */
const handleStatusSpecificLogic = async (
  equipment: any,
  newStatus: EquipmentStatus,
  context: WorkflowContext,
  tx: any
) => {
  switch (newStatus) {
    case 'MAINTENANCE':
      // Schedule maintenance
      await tx.maintenanceRequest.create({
        data: {
          equipmentId: equipment.id,
          requestedById: context.userId,
          schoolId: context.schoolId,
          organizationId: context.organizationId,
          description: context.reason || 'Routine maintenance',
          priority: 'MEDIUM',
          status: 'PENDING'
        }
      });
      break;

    case 'DAMAGED':
      // Create damage report
      await tx.damageReport.create({
        data: {
          equipmentId: equipment.id,
          reportedById: context.userId,
          schoolId: context.schoolId,
          organizationId: context.organizationId,
          description: context.reason || 'Equipment damaged',
          severity: context.metadata?.severity || 'MEDIUM',
          repairRequired: true
        }
      });
      break;

    case 'RETIRED':
      // Update equipment lifecycle
      await tx.equipment.update({
        where: { id: equipment.id },
        data: {
          retiredAt: new Date(),
          retiredReason: context.reason
        }
      });
      break;

    case 'AVAILABLE':
      // Close any open transactions
      await tx.transaction.updateMany({
        where: {
          equipmentId: equipment.id,
          status: { in: ['CHECKED_OUT', 'OVERDUE'] }
        },
        data: {
          status: 'RETURNED',
          returnedAt: new Date(),
          returnedById: context.userId
        }
      });
      break;
  }
};

/**
 * Generates notifications for status changes
 */
const generateStatusNotifications = async (
  equipment: any,
  oldStatus: EquipmentStatus,
  newStatus: EquipmentStatus,
  context: WorkflowContext
): Promise<string[]> => {
  const notifications: string[] = [];

  try {
    // Notify on damage
    if (newStatus === 'DAMAGED') {
      await createNotification({
        title: 'Equipment Damaged',
        message: `${equipment.name} has been marked as damaged`,
        type: 'ALERT',
        recipientId: 'ADMINS',
        schoolId: context.schoolId,
        organizationId: context.organizationId,
        metadata: { equipmentId: equipment.id, oldStatus, newStatus }
      });
      notifications.push('Damage notification sent to administrators');
    }

    // Notify on loss
    if (newStatus === 'LOST') {
      await createNotification({
        title: 'Equipment Lost',
        message: `${equipment.name} has been reported as lost`,
        type: 'ALERT',
        recipientId: 'ADMINS',
        schoolId: context.schoolId,
        organizationId: context.organizationId,
        metadata: { equipmentId: equipment.id, oldStatus, newStatus }
      });
      notifications.push('Loss notification sent to administrators');
    }

    // Notify on maintenance
    if (newStatus === 'MAINTENANCE') {
      await createNotification({
        title: 'Equipment Under Maintenance',
        message: `${equipment.name} is now under maintenance`,
        type: 'INFO',
        recipientId: 'MAINTENANCE_TEAM',
        schoolId: context.schoolId,
        organizationId: context.organizationId,
        metadata: { equipmentId: equipment.id, oldStatus, newStatus }
      });
      notifications.push('Maintenance notification sent to maintenance team');
    }

  } catch (error) {
    logger.error('Error generating status notifications:', error);
  }

  return notifications;
};

/**
 * Automatically checks for equipment that needs status updates
 */
export const processAutomaticTransitions = async (schoolId: string, organizationId: string) => {
  try {
    const now = new Date();

    // Find overdue equipment
    const overdueThreshold = new Date(now.getTime() - (AUTO_TRANSITION_RULES.OVERDUE_THRESHOLD_HOURS * 60 * 60 * 1000));
    
    const overdueEquipment = await prisma.equipment.findMany({
      where: {
        status: 'CHECKED_OUT',
        OR: [{ schoolId }, { organizationId, schoolId: null }],
        transactions: {
          some: {
            status: 'CHECKED_OUT',
            dueDate: { lt: overdueThreshold }
          }
        }
      },
      include: {
        transactions: {
          where: { status: 'CHECKED_OUT' },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    // Transition overdue equipment
    for (const equipment of overdueEquipment) {
      await executeStatusTransition(equipment.id, 'OVERDUE', {
        equipmentId: equipment.id,
        userId: 'SYSTEM',
        schoolId,
        organizationId,
        reason: 'Automatic transition - equipment overdue',
        metadata: { autoTransition: true }
      });
    }

    // Find equipment due for maintenance
    const maintenanceDue = new Date(now.getTime() - (AUTO_TRANSITION_RULES.MAINTENANCE_DUE_DAYS * 24 * 60 * 60 * 1000));
    
    const maintenanceNeeded = await prisma.equipment.findMany({
      where: {
        status: 'AVAILABLE',
        OR: [{ schoolId }, { organizationId, schoolId: null }],
        lastMaintenanceDate: { lt: maintenanceDue }
      }
    });

    // Schedule maintenance for eligible equipment
    for (const equipment of maintenanceNeeded) {
      await executeStatusTransition(equipment.id, 'MAINTENANCE', {
        equipmentId: equipment.id,
        userId: 'SYSTEM',
        schoolId,
        organizationId,
        reason: 'Automatic transition - scheduled maintenance due',
        metadata: { autoTransition: true, maintenanceType: 'SCHEDULED' }
      });
    }

    logger.info(`Processed automatic transitions: ${overdueEquipment.length} overdue, ${maintenanceNeeded.length} maintenance due`);

    return {
      overdueTransitions: overdueEquipment.length,
      maintenanceTransitions: maintenanceNeeded.length
    };

  } catch (error) {
    logger.error('Error processing automatic transitions:', error);
    throw error;
  }
};

/**
 * Gets workflow history for equipment
 */
export const getEquipmentWorkflowHistory = async (equipmentId: string, schoolId: string, organizationId: string) => {
  return await prisma.auditLog.findMany({
    where: {
      entityType: 'EQUIPMENT',
      entityId: equipmentId,
      action: 'STATUS_CHANGE',
      OR: [{ schoolId }, { organizationId, schoolId: null }]
    },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
};

/**
 * Validates workflow configuration
 */
export const validateWorkflowRules = (): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  // Check for circular transitions
  for (const [status, allowedTransitions] of Object.entries(ALLOWED_TRANSITIONS)) {
    for (const transition of allowedTransitions) {
      if (ALLOWED_TRANSITIONS[transition as EquipmentStatus]?.includes(status as EquipmentStatus)) {
        errors.push(`Circular transition detected: ${status} <-> ${transition}`);
      }
    }
  }

  // Validate terminal states
  if (ALLOWED_TRANSITIONS.RETIRED.length > 0) {
    errors.push('RETIRED should be a terminal state with no outgoing transitions');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};