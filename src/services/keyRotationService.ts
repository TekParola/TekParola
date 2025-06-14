import * as cron from 'node-cron';
import { applicationService } from './applicationService';
import { emailService } from './emailService';
import { logger } from '../utils/logger';

export class KeyRotationService {
  private rotationJob: cron.ScheduledTask | null = null;
  private notificationJob: cron.ScheduledTask | null = null;

  /**
   * Start the key rotation scheduler
   */
  start(): void {
    try {
      // Run key rotation check every hour
      this.rotationJob = cron.schedule('0 * * * *', async () => {
        await this.processScheduledRotations();
      });

      // Send rotation notifications every day at 9 AM UTC
      this.notificationJob = cron.schedule('0 9 * * *', async () => {
        await this.sendRotationNotifications();
      });

      logger.info('Key rotation scheduler started');
    } catch (error) {
      logger.error('Failed to start key rotation scheduler:', error);
    }
  }

  /**
   * Stop the key rotation scheduler
   */
  stop(): void {
    try {
      if (this.rotationJob) {
        this.rotationJob.stop();
        this.rotationJob = null;
      }

      if (this.notificationJob) {
        this.notificationJob.stop();
        this.notificationJob = null;
      }

      logger.info('Key rotation scheduler stopped');
    } catch (error) {
      logger.error('Failed to stop key rotation scheduler:', error);
    }
  }

  /**
   * Process all API keys scheduled for rotation
   */
  async processScheduledRotations(): Promise<void> {
    try {
      const apiKeys = await applicationService.getApiKeysForRotation();
      
      if (apiKeys.length === 0) {
        logger.debug('No API keys scheduled for rotation');
        return;
      }

      logger.info(`Processing ${apiKeys.length} API keys for rotation`);

      const rotationResults = await Promise.allSettled(
        apiKeys.map(apiKey => this.rotateApiKey(apiKey))
      );

      // Count successful and failed rotations
      const successful = rotationResults.filter(result => result.status === 'fulfilled').length;
      const failed = rotationResults.filter(result => result.status === 'rejected').length;

      if (failed > 0) {
        logger.warn(`API key rotation completed: ${successful} successful, ${failed} failed`);
        
        // Log individual failures
        rotationResults.forEach((result, index) => {
          if (result.status === 'rejected') {
            logger.error(`Failed to rotate API key ${apiKeys[index]?.id}:`, result.reason);
          }
        });
      } else {
        logger.info(`Successfully rotated ${successful} API keys`);
      }

    } catch (error) {
      logger.error('Failed to process scheduled rotations:', error);
    }
  }

  /**
   * Send notifications about upcoming rotations
   */
  async sendRotationNotifications(): Promise<void> {
    try {
      const upcomingRotations = await this.getUpcomingRotations();
      
      if (upcomingRotations.length === 0) {
        return;
      }

      // Group rotations by application for notification
      const rotationsByApp = upcomingRotations.reduce((acc, rotation) => {
        const appId = rotation.applicationId;
        if (!acc[appId]) {
          acc[appId] = {
            application: rotation.application,
            apiKeys: [],
          };
        }
        acc[appId].apiKeys.push(rotation);
        return acc;
      }, {} as Record<string, any>);

      // Send notifications for each application
      for (const [_appId, rotationData] of Object.entries(rotationsByApp)) {
        await this.sendRotationNotification((rotationData as any).application, (rotationData as any).apiKeys);
      }

      logger.info(`Sent rotation notifications for ${Object.keys(rotationsByApp).length} applications`);
    } catch (error) {
      logger.error('Failed to send rotation notifications:', error);
    }
  }

  /**
   * Get API keys with upcoming rotations (within next 7 days)
   */
  private async getUpcomingRotations(): Promise<any[]> {
    try {
      const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const now = new Date();

      const { prisma } = await import('../config/database');
      
      return await prisma.apiKey.findMany({
        where: {
          AND: [
            { isActive: true },
            {
              OR: [
                {
                  scheduledRotationAt: {
                    gte: now,
                    lte: sevenDaysFromNow,
                  },
                },
                {
                  AND: [
                    { autoRotateAfterDays: { not: null } },
                    {
                      OR: [
                        {
                          lastRotatedAt: {
                            gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
                            lte: sevenDaysFromNow,
                          },
                        },
                        {
                          AND: [
                            { lastRotatedAt: null },
                            {
                              createdAt: {
                                gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
                                lte: sevenDaysFromNow,
                              },
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        include: {
          application: true,
        },
      });
    } catch (error) {
      logger.error('Failed to get upcoming rotations:', error);
      return [];
    }
  }

  /**
   * Rotate a single API key
   */
  private async rotateApiKey(apiKey: any): Promise<void> {
    try {
      const { apiKey: rotatedKey, keySecret: _keySecret, oldKeyId } = await applicationService.rotateApiKey(
        apiKey.id,
        'system_scheduler'
      );

      // Log successful rotation
      logger.info(`Automatically rotated API key: ${apiKey.id} (${oldKeyId} -> ${rotatedKey.keyId})`);

      // Send rotation notification email if contact email is available
      if (apiKey.application?.contactEmail) {
        try {
          await this.sendRotationCompletedEmail(
            apiKey.application.contactEmail,
            apiKey.application.name,
            apiKey.name,
            rotatedKey.keyId,
            oldKeyId
          );
        } catch (emailError) {
          logger.warn(`Failed to send rotation notification email for API key ${apiKey.id}:`, emailError);
        }
      }

    } catch (error) {
      logger.error(`Failed to rotate API key ${apiKey.id}:`, error);
      throw error;
    }
  }

  /**
   * Send rotation notification email for upcoming rotations
   */
  private async sendRotationNotification(application: any, apiKeys: any[]): Promise<void> {
    if (!application.contactEmail) {
      return;
    }

    try {
      const emailContent = this.generateRotationNotificationEmail(application, apiKeys);
      
      await emailService.sendEmail({
        to: application.contactEmail,
        subject: `API Key Rotation Scheduled - ${application.displayName}`,
        htmlContent: emailContent,
      });

    } catch (error) {
      logger.error(`Failed to send rotation notification for application ${application.id}:`, error);
    }
  }

  /**
   * Send rotation completed email
   */
  private async sendRotationCompletedEmail(
    email: string,
    applicationName: string,
    keyName: string,
    newKeyId: string,
    oldKeyId: string
  ): Promise<void> {
    try {
      const emailContent = this.generateRotationCompletedEmail(
        applicationName,
        keyName,
        newKeyId,
        oldKeyId
      );

      await emailService.sendEmail({
        to: email,
        subject: `API Key Rotated - ${applicationName}`,
        htmlContent: emailContent,
      });

    } catch (error) {
      logger.error('Failed to send rotation completed email:', error);
    }
  }

  /**
   * Generate email content for rotation notifications
   */
  private generateRotationNotificationEmail(application: any, apiKeys: any[]): string {
    const keysList = apiKeys.map(key => `
      <li>
        <strong>${key.name}</strong> (${key.keyId})<br>
        ${key.scheduledRotationAt ? 
          `Scheduled: ${new Date(key.scheduledRotationAt).toLocaleDateString()}` :
          `Auto-rotation: Every ${key.autoRotateAfterDays} days`
        }
      </li>
    `).join('');

    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2c3e50;">API Key Rotation Notification</h2>
            
            <p>Hello,</p>
            
            <p>This is a notification that the following API keys for your application <strong>${application.displayName}</strong> are scheduled for rotation within the next 7 days:</p>
            
            <ul style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #007bff;">
              ${keysList}
            </ul>
            
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <h4 style="color: #856404; margin-top: 0;">Action Required</h4>
              <p style="margin-bottom: 0;">Please ensure that you update your application configuration with the new API keys after rotation. The old keys will become invalid immediately after rotation.</p>
            </div>
            
            <p>If you need to postpone or reschedule any rotations, please contact your system administrator.</p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #666;">
              This is an automated notification from TekParola SSO System.<br>
              Application: ${application.displayName}<br>
              Time: ${new Date().toISOString()}
            </p>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate email content for completed rotations
   */
  private generateRotationCompletedEmail(
    applicationName: string,
    keyName: string,
    newKeyId: string,
    oldKeyId: string
  ): string {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #27ae60;">API Key Successfully Rotated</h2>
            
            <p>Hello,</p>
            
            <p>Your API key has been successfully rotated as scheduled:</p>
            
            <div style="background-color: #f8f9fa; padding: 15px; border: 1px solid #dee2e6; border-radius: 4px; margin: 20px 0;">
              <h4 style="margin-top: 0;">Rotation Details</h4>
              <p><strong>Application:</strong> ${applicationName}</p>
              <p><strong>Key Name:</strong> ${keyName}</p>
              <p><strong>Old Key ID:</strong> <code>${oldKeyId}</code></p>
              <p><strong>New Key ID:</strong> <code>${newKeyId}</code></p>
              <p><strong>Rotation Time:</strong> ${new Date().toISOString()}</p>
            </div>
            
            <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <h4 style="color: #155724; margin-top: 0;">Important</h4>
              <p style="margin-bottom: 0; color: #155724;">
                The old API key (<code>${oldKeyId}</code>) is now invalid. Please update your application configuration 
                to use the new key ID. You can retrieve the new key secret from your application dashboard.
              </p>
            </div>
            
            <p>If you have any questions or need assistance, please contact your system administrator.</p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #666;">
              This is an automated notification from TekParola SSO System.<br>
              Application: ${applicationName}<br>
              Time: ${new Date().toISOString()}
            </p>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Manually trigger rotation check (for testing)
   */
  async triggerRotationCheck(): Promise<{
    processedKeys: number;
    successful: number;
    failed: number;
  }> {
    try {
      const apiKeys = await applicationService.getApiKeysForRotation();
      
      if (apiKeys.length === 0) {
        return { processedKeys: 0, successful: 0, failed: 0 };
      }

      const rotationResults = await Promise.allSettled(
        apiKeys.map(apiKey => this.rotateApiKey(apiKey))
      );

      const successful = rotationResults.filter(result => result.status === 'fulfilled').length;
      const failed = rotationResults.filter(result => result.status === 'rejected').length;

      return {
        processedKeys: apiKeys.length,
        successful,
        failed,
      };
    } catch (error) {
      logger.error('Failed to trigger rotation check:', error);
      throw error;
    }
  }
}

export const keyRotationService = new KeyRotationService();