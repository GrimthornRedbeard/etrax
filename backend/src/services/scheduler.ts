import cron from 'node-cron';
import { logger } from '@/utils/logger';
import { processAutomaticTransitions } from '@/services/workflow';
import { prisma } from '@/index';

/**
 * Scheduler service for automated tasks
 */
export class SchedulerService {
  private static instance: SchedulerService;
  private tasks: Map<string, cron.ScheduledTask> = new Map();

  private constructor() {}

  public static getInstance(): SchedulerService {
    if (!SchedulerService.instance) {
      SchedulerService.instance = new SchedulerService();
    }
    return SchedulerService.instance;
  }

  /**
   * Initialize all scheduled tasks
   */
  public async initialize(): Promise<void> {
    logger.info('Initializing scheduler service...');

    try {
      // Schedule automatic workflow processing every hour
      this.scheduleWorkflowProcessing();

      // Schedule daily cleanup tasks
      this.scheduleDailyCleanup();

      // Schedule weekly reporting
      this.scheduleWeeklyReports();

      logger.info('Scheduler service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize scheduler service:', error);
      throw error;
    }
  }

  /**
   * Schedule automatic workflow processing
   * Runs every hour to check for overdue equipment and maintenance due
   */
  private scheduleWorkflowProcessing(): void {
    const task = cron.schedule('0 * * * *', async () => {
      try {
        logger.info('Starting automatic workflow processing...');

        // Get all active schools/organizations
        const schools = await prisma.school.findMany({
          where: { isActive: true },
          select: { id: true, organizationId: true, name: true }
        });

        let totalOverdue = 0;
        let totalMaintenance = 0;

        // Process workflows for each school
        for (const school of schools) {
          try {
            const result = await processAutomaticTransitions(school.id, school.organizationId);
            totalOverdue += result.overdueTransitions;
            totalMaintenance += result.maintenanceTransitions;

            if (result.overdueTransitions > 0 || result.maintenanceTransitions > 0) {
              logger.info(
                `Processed automatic transitions for ${school.name}: ${result.overdueTransitions} overdue, ${result.maintenanceTransitions} maintenance`
              );
            }
          } catch (error) {
            logger.error(`Failed to process workflows for school ${school.name}:`, error);
          }
        }

        logger.info(
          `Automatic workflow processing completed: ${totalOverdue} total overdue, ${totalMaintenance} total maintenance transitions`
        );
      } catch (error) {
        logger.error('Error in automatic workflow processing:', error);
      }
    }, {
      name: 'workflow-processing',
      timezone: 'UTC'
    });

    this.tasks.set('workflow-processing', task);
    logger.info('Scheduled automatic workflow processing (hourly)');
  }

  /**
   * Schedule daily cleanup tasks
   * Runs at 2 AM UTC daily
   */
  private scheduleDailyCleanup(): void {
    const task = cron.schedule('0 2 * * *', async () => {
      try {
        logger.info('Starting daily cleanup tasks...');

        // Clean up old audit logs (keep 90 days)
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const deletedAuditLogs = await prisma.auditLog.deleteMany({
          where: {
            createdAt: { lt: ninetyDaysAgo }
          }
        });

        logger.info(`Cleaned up ${deletedAuditLogs.count} old audit logs`);

        // Clean up old notifications (keep 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const deletedNotifications = await prisma.notification.deleteMany({
          where: {
            createdAt: { lt: thirtyDaysAgo },
            isRead: true
          }
        });

        logger.info(`Cleaned up ${deletedNotifications.count} old notifications`);

        // Clean up expired refresh tokens
        const expiredTokens = await prisma.refreshToken.deleteMany({
          where: {
            expiresAt: { lt: new Date() }
          }
        });

        logger.info(`Cleaned up ${expiredTokens.count} expired refresh tokens`);

        // Update equipment statistics cache
        await this.updateEquipmentStatistics();

        logger.info('Daily cleanup tasks completed');
      } catch (error) {
        logger.error('Error in daily cleanup tasks:', error);
      }
    }, {
      name: 'daily-cleanup',
      timezone: 'UTC'
    });

    this.tasks.set('daily-cleanup', task);
    logger.info('Scheduled daily cleanup tasks (2 AM UTC)');
  }

  /**
   * Schedule weekly reporting
   * Runs every Sunday at 6 AM UTC
   */
  private scheduleWeeklyReports(): void {
    const task = cron.schedule('0 6 * * 0', async () => {
      try {
        logger.info('Starting weekly report generation...');

        // Get all active schools
        const schools = await prisma.school.findMany({
          where: { isActive: true },
          select: { id: true, organizationId: true, name: true, settings: true }
        });

        for (const school of schools) {
          try {
            // Check if school has enabled weekly reports
            const settings = school.settings as any;
            if (settings?.notifications?.weeklyReports === false) {
              continue;
            }

            await this.generateWeeklyReport(school.id, school.organizationId, school.name);
          } catch (error) {
            logger.error(`Failed to generate weekly report for school ${school.name}:`, error);
          }
        }

        logger.info('Weekly report generation completed');
      } catch (error) {
        logger.error('Error in weekly report generation:', error);
      }
    }, {
      name: 'weekly-reports',
      timezone: 'UTC'
    });

    this.tasks.set('weekly-reports', task);
    logger.info('Scheduled weekly reports (Sunday 6 AM UTC)');
  }

  /**
   * Update equipment statistics cache
   */
  private async updateEquipmentStatistics(): Promise<void> {
    try {
      // Get statistics for all schools
      const schools = await prisma.school.findMany({
        where: { isActive: true },
        select: { id: true, organizationId: true }
      });

      for (const school of schools) {
        // Calculate equipment statistics
        const stats = await prisma.equipment.groupBy({
          by: ['status'],
          where: {
            OR: [
              { schoolId: school.id },
              { organizationId: school.organizationId, schoolId: null }
            ],
            isDeleted: false
          },
          _count: { status: true }
        });

        // Update or create statistics record
        const statsData = stats.reduce((acc, stat) => {
          acc[stat.status.toLowerCase()] = stat._count.status;
          return acc;
        }, {} as Record<string, number>);

        // Store in database or cache as needed
        logger.debug(`Updated statistics for school ${school.id}:`, statsData);
      }
    } catch (error) {
      logger.error('Error updating equipment statistics:', error);
    }
  }

  /**
   * Generate weekly report for a school
   */
  private async generateWeeklyReport(schoolId: string, organizationId: string, schoolName: string): Promise<void> {
    try {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Get weekly statistics
      const weeklyStats = {
        totalTransactions: await prisma.transaction.count({
          where: {
            schoolId,
            createdAt: { gte: oneWeekAgo }
          }
        }),

        newEquipment: await prisma.equipment.count({
          where: {
            OR: [
              { schoolId },
              { organizationId, schoolId: null }
            ],
            createdAt: { gte: oneWeekAgo },
            isDeleted: false
          }
        }),

        maintenanceRequests: await prisma.maintenanceRequest.count({
          where: {
            schoolId,
            createdAt: { gte: oneWeekAgo }
          }
        }),

        damageReports: await prisma.damageReport.count({
          where: {
            schoolId,
            createdAt: { gte: oneWeekAgo }
          }
        }),

        overdueItems: await prisma.equipment.count({
          where: {
            OR: [
              { schoolId },
              { organizationId, schoolId: null }
            ],
            status: 'OVERDUE'
          }
        })
      };

      // Send report to school administrators
      const admins = await prisma.user.findMany({
        where: {
          schoolId,
          role: { in: ['ADMIN', 'MANAGER'] },
          isActive: true
        },
        select: { id: true, email: true, firstName: true, lastName: true }
      });

      for (const admin of admins) {
        // Create notification for weekly report
        await prisma.notification.create({
          data: {
            title: `Weekly Report - ${schoolName}`,
            message: `Weekly statistics: ${weeklyStats.totalTransactions} transactions, ${weeklyStats.newEquipment} new equipment, ${weeklyStats.overdueItems} overdue items`,
            type: 'INFO',
            recipientId: admin.id,
            schoolId,
            organizationId,
            metadata: weeklyStats
          }
        });
      }

      logger.info(`Generated weekly report for ${schoolName}:`, weeklyStats);
    } catch (error) {
      logger.error(`Error generating weekly report for school ${schoolName}:`, error);
    }
  }

  /**
   * Start all scheduled tasks
   */
  public start(): void {
    this.tasks.forEach((task, name) => {
      task.start();
      logger.info(`Started scheduled task: ${name}`);
    });
  }

  /**
   * Stop all scheduled tasks
   */
  public stop(): void {
    this.tasks.forEach((task, name) => {
      task.stop();
      logger.info(`Stopped scheduled task: ${name}`);
    });
  }

  /**
   * Get status of all scheduled tasks
   */
  public getStatus(): Array<{ name: string; running: boolean }> {
    const status: Array<{ name: string; running: boolean }> = [];
    
    this.tasks.forEach((task, name) => {
      status.push({
        name,
        running: task.getStatus() === 'scheduled'
      });
    });

    return status;
  }

  /**
   * Manually trigger a specific task
   */
  public async triggerTask(taskName: string): Promise<void> {
    const task = this.tasks.get(taskName);
    if (!task) {
      throw new Error(`Task not found: ${taskName}`);
    }

    logger.info(`Manually triggering task: ${taskName}`);
    
    // Execute the task callback manually
    switch (taskName) {
      case 'workflow-processing':
        // Re-execute workflow processing logic
        const schools = await prisma.school.findMany({
          where: { isActive: true },
          select: { id: true, organizationId: true, name: true }
        });

        for (const school of schools) {
          await processAutomaticTransitions(school.id, school.organizationId);
        }
        break;
        
      default:
        logger.warn(`Manual trigger not implemented for task: ${taskName}`);
    }
  }

  /**
   * Add a custom scheduled task
   */
  public addCustomTask(name: string, cronPattern: string, callback: () => Promise<void>): void {
    if (this.tasks.has(name)) {
      throw new Error(`Task already exists: ${name}`);
    }

    const task = cron.schedule(cronPattern, callback, {
      name,
      timezone: 'UTC'
    });

    this.tasks.set(name, task);
    logger.info(`Added custom scheduled task: ${name} with pattern: ${cronPattern}`);
  }

  /**
   * Remove a scheduled task
   */
  public removeTask(name: string): void {
    const task = this.tasks.get(name);
    if (!task) {
      throw new Error(`Task not found: ${name}`);
    }

    task.stop();
    task.destroy();
    this.tasks.delete(name);
    logger.info(`Removed scheduled task: ${name}`);
  }
}

// Export singleton instance
export const scheduler = SchedulerService.getInstance();