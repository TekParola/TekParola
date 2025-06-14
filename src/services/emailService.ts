import nodemailer from 'nodemailer';
import { prisma } from '../config/database';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { EmailError } from '../utils/errors';
import { emailTemplateService } from './emailTemplateService';
import { circuitBreakerRegistry } from '../utils/circuitBreaker';

export interface EmailData {
  to: string;
  subject: string;
  htmlContent?: string;
  textContent?: string;
  templateId?: string;
  templateName?: string;
  templateData?: Record<string, any>;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  variables?: Record<string, string>;
}

export class EmailService {
  private transporter: nodemailer.Transporter;
  private circuitBreaker;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.secure,
      auth: {
        user: config.email.smtp.user,
        pass: config.email.smtp.pass,
      },
    });

    // Initialize circuit breaker for email service
    this.circuitBreaker = circuitBreakerRegistry.getCircuitBreaker('email_smtp', {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 30000, // 30 seconds
      resetTimeout: 120000, // 2 minutes
      monitoringWindow: 300000, // 5 minutes
      onStateChange: (state, _serviceName) => {
        logger.warn(`Email service circuit breaker state changed to: ${state}`);
      },
      onFailure: (error, _serviceName) => {
        logger.error(`Email service failure:`, { error: error.message });
      },
    });
  }

  async sendEmail(emailData: EmailData): Promise<void> {
    try {
      let htmlContent = emailData.htmlContent;
      let textContent = emailData.textContent;
      let subject = emailData.subject;

      // If template is specified, process it
      if ((emailData.templateId || emailData.templateName) && emailData.templateData) {
        let template = null;
        
        if (emailData.templateName) {
          // Use new template service
          const rendered = await emailTemplateService.renderTemplate(emailData.templateName, emailData.templateData);
          htmlContent = rendered.htmlContent;
          textContent = rendered.textContent;
          subject = rendered.subject;
        } else if (emailData.templateId) {
          // Legacy template system
          template = await this.getTemplate(emailData.templateId);
          if (template) {
            htmlContent = this.processTemplate(template.htmlContent, emailData.templateData);
            textContent = template.textContent ? this.processTemplate(template.textContent, emailData.templateData) : undefined;
            subject = this.processTemplate(template.subject, emailData.templateData);
          }
        }
      }

      const mailOptions = {
        from: `${config.email.from.name} <${config.email.from.email}>`,
        to: emailData.to,
        subject,
        html: htmlContent,
        text: textContent,
      };

      // Use circuit breaker for email sending
      await this.circuitBreaker.execute(async () => {
        return await this.transporter.sendMail(mailOptions);
      });
      
      logger.info(`Email sent successfully to: ${emailData.to}`);

      // Log to email queue with sent status
      await this.logEmailToQueue({
        ...emailData,
        htmlContent: htmlContent || '',
        subject,
        status: 'sent',
        sentAt: new Date(),
      });
    } catch (error) {
      logger.error('Failed to send email:', error);
      
      // Log to email queue with failed status
      await this.logEmailToQueue({
        ...emailData,
        htmlContent: emailData.htmlContent || '',
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new EmailError(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async queueEmail(emailData: EmailData): Promise<void> {
    try {
      await this.logEmailToQueue({
        ...emailData,
        htmlContent: emailData.htmlContent || '',
        status: 'pending',
      });

      logger.info(`Email queued for: ${emailData.to}`);
    } catch (error) {
      logger.error('Failed to queue email:', error);
      throw new EmailError('Failed to queue email');
    }
  }

  private async logEmailToQueue(emailData: EmailData & { 
    status: string; 
    sentAt?: Date; 
    errorMessage?: string; 
  }): Promise<void> {
    try {
      await prisma.emailQueue.create({
        data: {
          to: emailData.to,
          subject: emailData.subject,
          htmlContent: emailData.htmlContent || '',
          textContent: emailData.textContent,
          templateId: emailData.templateId,
          templateData: emailData.templateData,
          status: emailData.status,
          sentAt: emailData.sentAt,
          errorMessage: emailData.errorMessage,
        },
      });
    } catch (error) {
      logger.error('Failed to log email to queue:', error);
    }
  }

  async processEmailQueue(): Promise<void> {
    try {
      const pendingEmails = await prisma.emailQueue.findMany({
        where: {
          status: 'pending',
          attempts: { lt: 3 },
        },
        take: 10,
        orderBy: { createdAt: 'asc' },
      });

      for (const email of pendingEmails) {
        try {
          await this.sendEmail({
            to: email.to,
            subject: email.subject,
            htmlContent: email.htmlContent,
            textContent: email.textContent || undefined,
            templateId: email.templateId || undefined,
            templateData: email.templateData as Record<string, any> || undefined,
          });

          await prisma.emailQueue.update({
            where: { id: email.id },
            data: {
              status: 'sent',
              sentAt: new Date(),
            },
          });
        } catch (error) {
          const attempts = email.attempts + 1;
          const status = attempts >= email.maxAttempts ? 'failed' : 'pending';

          await prisma.emailQueue.update({
            where: { id: email.id },
            data: {
              attempts,
              status,
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
            },
          });

          logger.error(`Failed to send queued email (attempt ${attempts}):`, error);
        }
      }
    } catch (error) {
      logger.error('Failed to process email queue:', error);
    }
  }

  private async getTemplate(templateId: string): Promise<EmailTemplate | null> {
    try {
      const template = await prisma.emailTemplate.findUnique({
        where: { id: templateId },
      });

      return template ? {
        id: template.id,
        name: template.name,
        subject: template.subject,
        htmlContent: template.htmlContent,
        textContent: template.textContent || undefined,
        variables: template.variables as Record<string, string> || undefined,
      } : null;
    } catch (error) {
      logger.error('Failed to get email template:', error);
      return null;
    }
  }

  private async getTemplateByName(name: string): Promise<EmailTemplate | null> {
    try {
      const template = await prisma.emailTemplate.findUnique({
        where: { name },
      });

      return template ? {
        id: template.id,
        name: template.name,
        subject: template.subject,
        htmlContent: template.htmlContent,
        textContent: template.textContent || undefined,
        variables: template.variables as Record<string, string> || undefined,
      } : null;
    } catch (error) {
      logger.error('Failed to get email template by name:', error);
      return null;
    }
  }

  private processTemplate(template: string, data: Record<string, any>): string {
    let processed = template;
    
    Object.keys(data).forEach(key => {
      const placeholder = `{{${key}}}`;
      const value = data[key]?.toString() || '';
      processed = processed.replace(new RegExp(placeholder, 'g'), value);
    });

    return processed;
  }

  async sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    const template = await this.getTemplateByName('welcome');
    if (!template) {
      logger.warn('Welcome email template not found');
      return;
    }

    await this.sendEmail({
      to: email,
      subject: template.subject,
      templateId: template.id,
      templateData: {
        firstName,
        email,
        company_name: config.app.companyName,
      },
    });
  }

  async sendPasswordResetEmail(email: string, firstName: string, resetToken: string): Promise<void> {
    const template = await this.getTemplateByName('password_reset');
    if (!template) {
      logger.warn('Password reset email template not found');
      return;
    }

    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    await this.sendEmail({
      to: email,
      subject: template.subject,
      templateId: template.id,
      templateData: {
        firstName,
        resetLink,
        expirationTime: 60, // 1 hour
        company_name: config.app.companyName,
      },
    });
  }

  async sendMagicLinkEmail(email: string, firstName: string, magicToken: string): Promise<void> {
    const template = await this.getTemplateByName('magic_link');
    if (!template) {
      logger.warn('Magic link email template not found');
      return;
    }

    const magicLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/magic-login?token=${magicToken}`;

    await this.sendEmail({
      to: email,
      subject: template.subject,
      templateId: template.id,
      templateData: {
        firstName,
        magicLink,
        expirationTime: 15, // 15 minutes
        company_name: config.app.companyName,
      },
    });
  }

  async sendTwoFactorEmail(email: string, firstName: string, code: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'Two-Factor Authentication Code',
      htmlContent: `
        <h1>Two-Factor Authentication</h1>
        <p>Hello ${firstName},</p>
        <p>Your two-factor authentication code is: <strong>${code}</strong></p>
        <p>This code will expire in 5 minutes.</p>
        <p>If you didn't request this code, please ignore this email.</p>
        <p>Best regards,<br>The ${config.app.companyName} Team</p>
      `,
      textContent: `Two-Factor Authentication\n\nHello ${firstName},\n\nYour two-factor authentication code is: ${code}\n\nThis code will expire in 5 minutes.\n\nIf you didn't request this code, please ignore this email.\n\nBest regards,\nThe ${config.app.companyName} Team`,
    });
  }

  async sendTwoFactorBackupCodesEmail(email: string, firstName: string, backupCodes: string[]): Promise<void> {
    const template = await this.getTemplateByName('two_factor_backup_codes');
    if (!template) {
      logger.warn('Two-factor backup codes email template not found, using fallback');
      
      // Fallback email if template not found
      const codesHtml = backupCodes.map(code => `<li><code>${code}</code></li>`).join('');
      const codesText = backupCodes.map((code, index) => `${index + 1}. ${code}`).join('\n');
      
      await this.sendEmail({
        to: email,
        subject: 'Two-Factor Authentication Backup Codes',
        htmlContent: `
          <h1>Two-Factor Authentication Backup Codes</h1>
          <p>Hello ${firstName},</p>
          <p>Your two-factor authentication backup codes have been generated. Please save these codes in a secure location:</p>
          <ul style="font-family: monospace; list-style-type: none; padding: 20px; background: #f5f5f5; border-radius: 5px;">
            ${codesHtml}
          </ul>
          <p><strong>Important:</strong></p>
          <ul>
            <li>Each backup code can only be used once</li>
            <li>Store these codes in a safe place</li>
            <li>You can use these codes instead of your authenticator app</li>
            <li>You can regenerate new codes at any time</li>
          </ul>
          <p>If you didn't request these backup codes, please contact our support team immediately.</p>
          <p>Best regards,<br>The ${config.app.companyName} Security Team</p>
        `,
        textContent: `Two-Factor Authentication Backup Codes\n\nHello ${firstName},\n\nYour two-factor authentication backup codes have been generated. Please save these codes in a secure location:\n\n${codesText}\n\nImportant:\n- Each backup code can only be used once\n- Store these codes in a safe place\n- You can use these codes instead of your authenticator app\n- You can regenerate new codes at any time\n\nIf you didn't request these backup codes, please contact our support team immediately.\n\nBest regards,\nThe ${config.app.companyName} Security Team`,
      });
      return;
    }

    await this.sendEmail({
      to: email,
      subject: template.subject,
      templateId: template.id,
      templateData: {
        firstName,
        backupCodes,
        company_name: config.app.companyName,
      },
    });
  }

  async sendSecurityAlertEmail(email: string, firstName: string, alertType: string, details: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: `Security Alert: ${alertType}`,
      htmlContent: `
        <h1>Security Alert</h1>
        <p>Hello ${firstName},</p>
        <p>We detected a security event on your account:</p>
        <p><strong>Alert Type:</strong> ${alertType}</p>
        <p><strong>Details:</strong> ${details}</p>
        <p>If this was you, no action is needed. If you don't recognize this activity, please contact our support team immediately.</p>
        <p>Best regards,<br>The ${config.app.companyName} Security Team</p>
      `,
      textContent: `Security Alert\n\nHello ${firstName},\n\nWe detected a security event on your account:\n\nAlert Type: ${alertType}\nDetails: ${details}\n\nIf this was you, no action is needed. If you don't recognize this activity, please contact our support team immediately.\n\nBest regards,\nThe ${config.app.companyName} Security Team`,
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      logger.info('Email service connection verified');
      return true;
    } catch (error) {
      logger.error('Email service connection failed:', error);
      return false;
    }
  }
}

export const emailService = new EmailService();