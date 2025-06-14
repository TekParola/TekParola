import { EmailTemplate, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { NotFoundError, ValidationError } from '../utils/errors';
import Handlebars from 'handlebars';

export interface CreateEmailTemplateData {
  name: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  category: string;
  description?: string;
  variables?: string[];
  isActive?: boolean;
  createdBy: string;
}

export interface UpdateEmailTemplateData {
  subject?: string;
  htmlContent?: string;
  textContent?: string;
  category?: string;
  description?: string;
  variables?: string[];
  isActive?: boolean;
  updatedBy: string;
}

export interface EmailRenderData {
  [key: string]: any;
}

export interface RenderedEmail {
  subject: string;
  htmlContent: string;
  textContent?: string;
}

export class EmailTemplateService {
  private readonly CACHE_PREFIX = 'email_template:';
  private readonly CACHE_TTL = 600; // 10 minutes

  async createTemplate(templateData: CreateEmailTemplateData): Promise<EmailTemplate> {
    try {
      // Validate template syntax
      this.validateTemplate(templateData.htmlContent, templateData.subject);
      if (templateData.textContent) {
        this.validateTemplate(templateData.textContent, 'text content');
      }

      const template = await prisma.emailTemplate.create({
        data: {
          name: templateData.name,
          subject: templateData.subject,
          htmlContent: templateData.htmlContent,
          textContent: templateData.textContent,
          category: templateData.category,
          description: templateData.description,
          variables: templateData.variables || [],
          isActive: templateData.isActive !== false,
          createdBy: templateData.createdBy,
        },
      });

      // Clear cache
      await this.clearTemplateCache(template.name);
      
      logger.info(`Email template created: ${template.name}`);
      return template;
    } catch (error) {
      logger.error('Failed to create email template:', error);
      throw error;
    }
  }

  async updateTemplate(name: string, updateData: UpdateEmailTemplateData): Promise<EmailTemplate> {
    try {
      const existingTemplate = await this.findByName(name);
      if (!existingTemplate) {
        throw new NotFoundError('Email template not found');
      }

      // Validate template syntax if content is being updated
      if (updateData.htmlContent) {
        this.validateTemplate(updateData.htmlContent, updateData.subject || existingTemplate.subject);
      }
      if (updateData.textContent) {
        this.validateTemplate(updateData.textContent, 'text content');
      }

      const template = await prisma.emailTemplate.update({
        where: { name },
        data: {
          subject: updateData.subject,
          htmlContent: updateData.htmlContent,
          textContent: updateData.textContent,
          category: updateData.category,
          description: updateData.description,
          variables: updateData.variables,
          isActive: updateData.isActive,
          updatedBy: updateData.updatedBy,
          updatedAt: new Date(),
        },
      });

      // Clear cache
      await this.clearTemplateCache(name);

      logger.info(`Email template updated: ${template.name}`);
      return template;
    } catch (error) {
      logger.error('Failed to update email template:', error);
      throw error;
    }
  }

  async deleteTemplate(name: string): Promise<void> {
    try {
      const template = await this.findByName(name);
      if (!template) {
        throw new NotFoundError('Email template not found');
      }

      await prisma.emailTemplate.delete({
        where: { name },
      });

      // Clear cache
      await this.clearTemplateCache(name);

      logger.info(`Email template deleted: ${name}`);
    } catch (error) {
      logger.error('Failed to delete email template:', error);
      throw error;
    }
  }

  async findByName(name: string): Promise<EmailTemplate | null> {
    try {
      // Try cache first
      const cached = await this.getFromCache(name);
      if (cached) {
        return cached;
      }

      const template = await prisma.emailTemplate.findUnique({
        where: { name },
      });

      if (template) {
        await this.setCache(name, template);
      }

      return template;
    } catch (error) {
      logger.error('Failed to find email template:', error);
      throw error;
    }
  }

  async getAllTemplates(includeInactive = false): Promise<EmailTemplate[]> {
    try {
      const where: Prisma.EmailTemplateWhereInput = includeInactive ? {} : { isActive: true };

      return await prisma.emailTemplate.findMany({
        where,
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      });
    } catch (error) {
      logger.error('Failed to get all email templates:', error);
      throw error;
    }
  }

  async getTemplatesByCategory(category: string, includeInactive = false): Promise<EmailTemplate[]> {
    try {
      const where: Prisma.EmailTemplateWhereInput = {
        category,
        ...(includeInactive ? {} : { isActive: true }),
      };

      return await prisma.emailTemplate.findMany({
        where,
        orderBy: { name: 'asc' },
      });
    } catch (error) {
      logger.error('Failed to get templates by category:', error);
      throw error;
    }
  }

  async getCategories(): Promise<string[]> {
    try {
      const result = await prisma.emailTemplate.findMany({
        select: { category: true },
        distinct: ['category'],
        orderBy: { category: 'asc' },
      });

      return result.map(r => r.category);
    } catch (error) {
      logger.error('Failed to get template categories:', error);
      throw error;
    }
  }

  async renderTemplate(name: string, data: EmailRenderData = {}): Promise<RenderedEmail> {
    try {
      const template = await this.findByName(name);
      if (!template) {
        throw new NotFoundError(`Email template not found: ${name}`);
      }

      if (!template.isActive) {
        throw new ValidationError(`Email template is inactive: ${name}`);
      }

      // Compile and render templates
      const subjectTemplate = Handlebars.compile(template.subject);
      const htmlTemplate = Handlebars.compile(template.htmlContent);
      
      const rendered: RenderedEmail = {
        subject: subjectTemplate(data),
        htmlContent: htmlTemplate(data),
      };

      if (template.textContent) {
        const textTemplate = Handlebars.compile(template.textContent);
        rendered.textContent = textTemplate(data);
      }

      return rendered;
    } catch (error) {
      logger.error(`Failed to render email template ${name}:`, error);
      throw error;
    }
  }

  async previewTemplate(name: string, data: EmailRenderData = {}): Promise<RenderedEmail> {
    try {
      const template = await this.findByName(name);
      if (!template) {
        throw new NotFoundError(`Email template not found: ${name}`);
      }

      // Compile and render templates (even if inactive for preview)
      const subjectTemplate = Handlebars.compile(template.subject);
      const htmlTemplate = Handlebars.compile(template.htmlContent);
      
      const rendered: RenderedEmail = {
        subject: subjectTemplate(data),
        htmlContent: htmlTemplate(data),
      };

      if (template.textContent) {
        const textTemplate = Handlebars.compile(template.textContent);
        rendered.textContent = textTemplate(data);
      }

      return rendered;
    } catch (error) {
      logger.error(`Failed to preview email template ${name}:`, error);
      throw error;
    }
  }

  async duplicateTemplate(originalName: string, newName: string, createdBy: string): Promise<EmailTemplate> {
    try {
      const originalTemplate = await this.findByName(originalName);
      if (!originalTemplate) {
        throw new NotFoundError('Original email template not found');
      }

      // Check if new name already exists
      const existingTemplate = await this.findByName(newName);
      if (existingTemplate) {
        throw new ValidationError('Template with this name already exists');
      }

      const newTemplate = await this.createTemplate({
        name: newName,
        subject: originalTemplate.subject,
        htmlContent: originalTemplate.htmlContent,
        textContent: originalTemplate.textContent ?? undefined,
        category: originalTemplate.category,
        description: `Copy of ${originalTemplate.description || originalTemplate.name}`,
        variables: originalTemplate.variables as string[],
        isActive: false, // New duplicated templates start as inactive
        createdBy,
      });

      return newTemplate;
    } catch (error) {
      logger.error('Failed to duplicate email template:', error);
      throw error;
    }
  }

  async bulkUpdateStatus(templateNames: string[], isActive: boolean, updatedBy: string): Promise<void> {
    try {
      await prisma.emailTemplate.updateMany({
        where: {
          name: { in: templateNames },
        },
        data: {
          isActive,
          updatedBy,
          updatedAt: new Date(),
        },
      });

      // Clear cache for all updated templates
      for (const name of templateNames) {
        await this.clearTemplateCache(name);
      }

      logger.info(`Bulk updated ${templateNames.length} email templates status to ${isActive}`);
    } catch (error) {
      logger.error('Failed to bulk update template status:', error);
      throw error;
    }
  }

  async getTemplateVariables(name: string): Promise<string[]> {
    try {
      const template = await this.findByName(name);
      if (!template) {
        throw new NotFoundError('Email template not found');
      }

      // Extract variables from template content
      const extractedVars = this.extractVariablesFromContent(
        template.subject + ' ' + template.htmlContent + ' ' + (template.textContent || '')
      );

      // Merge with stored variables
      const storedVariables = Array.isArray(template.variables) ? 
        template.variables.filter((v): v is string => typeof v === 'string') : [];
      const allVariables = [...new Set([...storedVariables, ...extractedVars])];

      return allVariables.sort();
    } catch (error) {
      logger.error('Failed to get template variables:', error);
      throw error;
    }
  }

  async initializeDefaultTemplates(createdBy: string): Promise<{ created: number; skipped: number }> {
    try {
      const defaultTemplates = this.getDefaultTemplates();
      let created = 0;
      let skipped = 0;

      for (const templateData of defaultTemplates) {
        try {
          const existing = await this.findByName(templateData.name);
          if (!existing) {
            await this.createTemplate({
              ...templateData,
              createdBy,
            });
            created++;
          } else {
            skipped++;
          }
        } catch (error) {
          logger.warn(`Failed to create default template ${templateData.name}:`, error);
          skipped++;
        }
      }

      return { created, skipped };
    } catch (error) {
      logger.error('Failed to initialize default templates:', error);
      throw error;
    }
  }

  private validateTemplate(content: string, context: string): void {
    try {
      Handlebars.compile(content);
    } catch (error) {
      throw new ValidationError(`Invalid Handlebars template syntax in ${context}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private extractVariablesFromContent(content: string): string[] {
    const variables: string[] = [];
    const regex = /\{\{\s*([^}]+)\s*\}\}/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      const variable = match[1]?.trim();
      if (!variable) {
        continue;
      }
      // Remove Handlebars helpers and get just the variable name
      const cleanVariable = variable.split(' ')[0]?.replace(/[#/]/g, '') || '';
      if (cleanVariable && !variables.includes(cleanVariable)) {
        variables.push(cleanVariable);
      }
    }

    return variables;
  }

  private async getFromCache(name: string): Promise<EmailTemplate | null> {
    try {
      const cached = await redisClient.get(`${this.CACHE_PREFIX}${name}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.debug('Failed to get template from cache:', error);
      return null;
    }
  }

  private async setCache(name: string, template: EmailTemplate): Promise<void> {
    try {
      await redisClient.setEx(
        `${this.CACHE_PREFIX}${name}`,
        this.CACHE_TTL,
        JSON.stringify(template)
      );
    } catch (error) {
      logger.debug('Failed to set template in cache:', error);
    }
  }

  private async clearTemplateCache(name: string): Promise<void> {
    try {
      await redisClient.del(`${this.CACHE_PREFIX}${name}`);
    } catch (error) {
      logger.debug('Failed to clear template cache:', error);
    }
  }

  private getDefaultTemplates(): CreateEmailTemplateData[] {
    return [
      {
        name: 'welcome',
        subject: 'Welcome to {{companyName}}!',
        htmlContent: `
          <h1>Welcome to {{companyName}}, {{firstName}}!</h1>
          <p>Thank you for joining our platform. We're excited to have you on board.</p>
          <p>Here are your account details:</p>
          <ul>
            <li><strong>Email:</strong> {{email}}</li>
            <li><strong>Username:</strong> {{username}}</li>
          </ul>
          <p>To get started, please <a href="{{loginUrl}}">log in to your account</a>.</p>
          <p>If you have any questions, feel free to contact our support team.</p>
          <p>Best regards,<br>The {{companyName}} Team</p>
        `,
        textContent: `
          Welcome to {{companyName}}, {{firstName}}!
          
          Thank you for joining our platform. We're excited to have you on board.
          
          Here are your account details:
          - Email: {{email}}
          - Username: {{username}}
          
          To get started, please log in to your account: {{loginUrl}}
          
          If you have any questions, feel free to contact our support team.
          
          Best regards,
          The {{companyName}} Team
        `,
        category: 'authentication',
        description: 'Welcome email for new users',
        variables: ['companyName', 'firstName', 'email', 'username', 'loginUrl'],
        isActive: true,
        createdBy: 'system',
      },
      {
        name: 'password_reset',
        subject: 'Reset Your Password - {{companyName}}',
        htmlContent: `
          <h1>Password Reset Request</h1>
          <p>Hello {{firstName}},</p>
          <p>We received a request to reset your password for your {{companyName}} account.</p>
          <p>Click the button below to reset your password:</p>
          <p><a href="{{resetUrl}}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
          <p>This link will expire in {{expirationTime}} minutes.</p>
          <p>If you didn't request this password reset, please ignore this email or contact support if you have concerns.</p>
          <p>Best regards,<br>The {{companyName}} Team</p>
        `,
        textContent: `
          Password Reset Request
          
          Hello {{firstName}},
          
          We received a request to reset your password for your {{companyName}} account.
          
          Click the link below to reset your password:
          {{resetUrl}}
          
          This link will expire in {{expirationTime}} minutes.
          
          If you didn't request this password reset, please ignore this email or contact support if you have concerns.
          
          Best regards,
          The {{companyName}} Team
        `,
        category: 'authentication',
        description: 'Password reset email',
        variables: ['companyName', 'firstName', 'resetUrl', 'expirationTime'],
        isActive: true,
        createdBy: 'system',
      },
      {
        name: 'email_verification',
        subject: 'Verify Your Email - {{companyName}}',
        htmlContent: `
          <h1>Verify Your Email Address</h1>
          <p>Hello {{firstName}},</p>
          <p>Please verify your email address by clicking the button below:</p>
          <p><a href="{{verificationUrl}}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a></p>
          <p>This verification link will expire in {{expirationTime}} hours.</p>
          <p>If you didn't create an account with {{companyName}}, please ignore this email.</p>
          <p>Best regards,<br>The {{companyName}} Team</p>
        `,
        textContent: `
          Verify Your Email Address
          
          Hello {{firstName}},
          
          Please verify your email address by clicking the link below:
          {{verificationUrl}}
          
          This verification link will expire in {{expirationTime}} hours.
          
          If you didn't create an account with {{companyName}}, please ignore this email.
          
          Best regards,
          The {{companyName}} Team
        `,
        category: 'authentication',
        description: 'Email verification for new accounts',
        variables: ['companyName', 'firstName', 'verificationUrl', 'expirationTime'],
        isActive: true,
        createdBy: 'system',
      },
      {
        name: 'magic_link',
        subject: 'Your Magic Link - {{companyName}}',
        htmlContent: `
          <h1>Your Magic Login Link</h1>
          <p>Hello {{firstName}},</p>
          <p>Click the button below to log in to your {{companyName}} account:</p>
          <p><a href="{{magicUrl}}" style="background-color: #6f42c1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Log In</a></p>
          <p>This magic link will expire in {{expirationTime}} minutes.</p>
          <p>If you didn't request this magic link, please ignore this email or contact support.</p>
          <p>Best regards,<br>The {{companyName}} Team</p>
        `,
        textContent: `
          Your Magic Login Link
          
          Hello {{firstName}},
          
          Click the link below to log in to your {{companyName}} account:
          {{magicUrl}}
          
          This magic link will expire in {{expirationTime}} minutes.
          
          If you didn't request this magic link, please ignore this email or contact support.
          
          Best regards,
          The {{companyName}} Team
        `,
        category: 'authentication',
        description: 'Magic link login email',
        variables: ['companyName', 'firstName', 'magicUrl', 'expirationTime'],
        isActive: true,
        createdBy: 'system',
      },
      {
        name: 'account_locked',
        subject: 'Account Security Alert - {{companyName}}',
        htmlContent: `
          <h1>Account Temporarily Locked</h1>
          <p>Hello {{firstName}},</p>
          <p>Your {{companyName}} account has been temporarily locked due to multiple failed login attempts.</p>
          <p>Your account will be automatically unlocked in {{lockoutDuration}} minutes.</p>
          <p>If this wasn't you, please contact our support team immediately.</p>
          <p>Best regards,<br>The {{companyName}} Team</p>
        `,
        textContent: `
          Account Temporarily Locked
          
          Hello {{firstName}},
          
          Your {{companyName}} account has been temporarily locked due to multiple failed login attempts.
          
          Your account will be automatically unlocked in {{lockoutDuration}} minutes.
          
          If this wasn't you, please contact our support team immediately.
          
          Best regards,
          The {{companyName}} Team
        `,
        category: 'security',
        description: 'Account lockout notification',
        variables: ['companyName', 'firstName', 'lockoutDuration'],
        isActive: true,
        createdBy: 'system',
      },
      {
        name: 'two_factor_backup_codes',
        subject: 'Your Two-Factor Authentication Backup Codes - {{companyName}}',
        htmlContent: `
          <h1>Two-Factor Authentication Backup Codes</h1>
          <p>Hello {{firstName}},</p>
          <p>You have enabled two-factor authentication for your {{companyName}} account. Here are your backup codes:</p>
          <div style="background-color: #f8f9fa; padding: 15px; margin: 20px 0; font-family: monospace;">
            {{#each backupCodes}}
            <div>{{this}}</div>
            {{/each}}
          </div>
          <p><strong>Important:</strong></p>
          <ul>
            <li>Store these codes in a safe place</li>
            <li>Each code can only be used once</li>
            <li>Use these codes if you lose access to your authenticator app</li>
          </ul>
          <p>Best regards,<br>The {{companyName}} Team</p>
        `,
        textContent: `
          Two-Factor Authentication Backup Codes
          
          Hello {{firstName}},
          
          You have enabled two-factor authentication for your {{companyName}} account. Here are your backup codes:
          
          {{#each backupCodes}}
          {{this}}
          {{/each}}
          
          Important:
          - Store these codes in a safe place
          - Each code can only be used once
          - Use these codes if you lose access to your authenticator app
          
          Best regards,
          The {{companyName}} Team
        `,
        category: 'security',
        description: 'Two-factor authentication backup codes',
        variables: ['companyName', 'firstName', 'backupCodes'],
        isActive: true,
        createdBy: 'system',
      },
    ];
  }
}

export const emailTemplateService = new EmailTemplateService();