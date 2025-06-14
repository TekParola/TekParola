import { Request, Response } from 'express';
import { emailTemplateService } from '../services/emailTemplateService';
import { asyncHandler } from '../middleware/errorHandler';
import { ValidationError } from '../utils/errors';

export class EmailTemplateController {
  // Get all email templates
  getAllTemplates = asyncHandler(async (req: Request, res: Response) => {
    const { includeInactive = false } = req.query;
    const isAdmin = req.user?.roles?.some((role: any) => role.name === 'admin' || role.name === 'super_admin');
    
    const shouldIncludeInactive = isAdmin && includeInactive === 'true';
    const templates = await emailTemplateService.getAllTemplates(shouldIncludeInactive);

    res.status(200).json({
      success: true,
      message: 'Email templates retrieved successfully',
      data: {
        templates: templates.map(template => ({
          name: template.name,
          subject: template.subject,
          category: template.category,
          description: template.description,
          variables: template.variables,
          isActive: template.isActive,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
          createdBy: template.createdBy,
          updatedBy: template.updatedBy,
        })),
      },
    });
  });

  // Get templates by category
  getTemplatesByCategory = asyncHandler(async (req: Request, res: Response) => {
    const { category } = req.params;
    const { includeInactive = false } = req.query;
    const isAdmin = req.user?.roles?.some((role: any) => role.name === 'admin' || role.name === 'super_admin');
    
    if (!category) {
      throw new ValidationError('Category is required');
    }
    
    const shouldIncludeInactive = isAdmin && includeInactive === 'true';
    const templates = await emailTemplateService.getTemplatesByCategory(category, shouldIncludeInactive);

    res.status(200).json({
      success: true,
      message: `Templates for category '${category}' retrieved successfully`,
      data: {
        category,
        templates: templates.map(template => ({
          name: template.name,
          subject: template.subject,
          description: template.description,
          variables: template.variables,
          isActive: template.isActive,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
        })),
      },
    });
  });

  // Get specific template
  getTemplate = asyncHandler(async (req: Request, res: Response) => {
    const { name } = req.params;
    const { includeContent = true } = req.query;
    
    if (!name) {
      throw new ValidationError('Template name is required');
    }
    
    const template = await emailTemplateService.findByName(name);
    if (!template) {
      res.status(404).json({
        success: false,
        message: 'Email template not found',
      });
      return;
    }

    const response: any = {
      name: template.name,
      subject: template.subject,
      category: template.category,
      description: template.description,
      variables: template.variables,
      isActive: template.isActive,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      createdBy: template.createdBy,
      updatedBy: template.updatedBy,
    };

    if (includeContent === 'true') {
      response.htmlContent = template.htmlContent;
      response.textContent = template.textContent;
    }

    res.status(200).json({
      success: true,
      message: 'Email template retrieved successfully',
      data: { template: response },
    });
  });

  // Create new template (admin only)
  createTemplate = asyncHandler(async (req: Request, res: Response) => {
    const {
      name,
      subject,
      htmlContent,
      textContent,
      category,
      description,
      variables,
      isActive,
    } = req.body;
    const adminUserId = req.user!.id;

    if (!name || !subject || !htmlContent || !category) {
      throw new ValidationError('Name, subject, htmlContent, and category are required');
    }

    const template = await emailTemplateService.createTemplate({
      name,
      subject,
      htmlContent,
      textContent,
      category,
      description,
      variables,
      isActive,
      createdBy: adminUserId,
    });

    res.status(201).json({
      success: true,
      message: 'Email template created successfully',
      data: {
        template: {
          name: template.name,
          subject: template.subject,
          category: template.category,
          description: template.description,
          variables: template.variables,
          isActive: template.isActive,
          createdAt: template.createdAt,
        },
      },
    });
  });

  // Update template (admin only)
  updateTemplate = asyncHandler(async (req: Request, res: Response) => {
    const { name } = req.params;
    const updateData = req.body;
    const adminUserId = req.user!.id;

    if (!name) {
      throw new ValidationError('Template name is required');
    }

    const template = await emailTemplateService.updateTemplate(name, {
      ...updateData,
      updatedBy: adminUserId,
    });

    res.status(200).json({
      success: true,
      message: 'Email template updated successfully',
      data: {
        template: {
          name: template.name,
          subject: template.subject,
          category: template.category,
          description: template.description,
          variables: template.variables,
          isActive: template.isActive,
          updatedAt: template.updatedAt,
        },
      },
    });
  });

  // Delete template (admin only)
  deleteTemplate = asyncHandler(async (req: Request, res: Response) => {
    const { name } = req.params;

    if (!name) {
      throw new ValidationError('Template name is required');
    }

    await emailTemplateService.deleteTemplate(name);

    res.status(200).json({
      success: true,
      message: 'Email template deleted successfully',
    });
  });

  // Duplicate template (admin only)
  duplicateTemplate = asyncHandler(async (req: Request, res: Response) => {
    const { name } = req.params;
    const { newName } = req.body;
    const adminUserId = req.user!.id;

    if (!name) {
      throw new ValidationError('Template name is required');
    }

    if (!newName) {
      throw new ValidationError('New name is required');
    }

    const template = await emailTemplateService.duplicateTemplate(name, newName, adminUserId);

    res.status(201).json({
      success: true,
      message: 'Email template duplicated successfully',
      data: {
        template: {
          name: template.name,
          subject: template.subject,
          category: template.category,
          description: template.description,
          isActive: template.isActive,
          createdAt: template.createdAt,
        },
      },
    });
  });

  // Preview template with sample data
  previewTemplate = asyncHandler(async (req: Request, res: Response) => {
    const { name } = req.params;
    const { data = {} } = req.body;

    if (!name) {
      throw new ValidationError('Template name is required');
    }

    const rendered = await emailTemplateService.previewTemplate(name, data);

    res.status(200).json({
      success: true,
      message: 'Email template preview generated successfully',
      data: {
        preview: rendered,
      },
    });
  });

  // Render template with data
  renderTemplate = asyncHandler(async (req: Request, res: Response) => {
    const { name } = req.params;
    const { data = {} } = req.body;

    if (!name) {
      throw new ValidationError('Template name is required');
    }

    const rendered = await emailTemplateService.renderTemplate(name, data);

    res.status(200).json({
      success: true,
      message: 'Email template rendered successfully',
      data: {
        rendered,
      },
    });
  });

  // Get template variables
  getTemplateVariables = asyncHandler(async (req: Request, res: Response) => {
    const { name } = req.params;

    if (!name) {
      throw new ValidationError('Template name is required');
    }

    const variables = await emailTemplateService.getTemplateVariables(name);

    res.status(200).json({
      success: true,
      message: 'Template variables retrieved successfully',
      data: {
        variables,
      },
    });
  });

  // Get template categories
  getCategories = asyncHandler(async (req: Request, res: Response) => {
    const categories = await emailTemplateService.getCategories();

    res.status(200).json({
      success: true,
      message: 'Template categories retrieved successfully',
      data: {
        categories,
      },
    });
  });

  // Bulk update template status (admin only)
  bulkUpdateStatus = asyncHandler(async (req: Request, res: Response) => {
    const { templateNames, isActive } = req.body;
    const adminUserId = req.user!.id;

    if (!Array.isArray(templateNames) || templateNames.length === 0) {
      throw new ValidationError('Template names array is required and must not be empty');
    }

    if (typeof isActive !== 'boolean') {
      throw new ValidationError('isActive must be a boolean');
    }

    await emailTemplateService.bulkUpdateStatus(templateNames, isActive, adminUserId);

    res.status(200).json({
      success: true,
      message: `${templateNames.length} templates ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: {
        updatedCount: templateNames.length,
        isActive,
      },
    });
  });

  // Initialize default templates (admin only)
  initializeDefaults = asyncHandler(async (req: Request, res: Response) => {
    const adminUserId = req.user!.id;

    const result = await emailTemplateService.initializeDefaultTemplates(adminUserId);

    res.status(200).json({
      success: true,
      message: 'Default email templates initialization completed',
      data: result,
    });
  });

  // Test template rendering (admin only)
  testTemplate = asyncHandler(async (req: Request, res: Response) => {
    const { name } = req.params;
    const { testData } = req.body;

    if (!name) {
      throw new ValidationError('Template name is required');
    }

    // Provide sample test data if none provided
    const defaultTestData = {
      companyName: 'TekParola',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      username: 'johndoe',
      loginUrl: 'https://example.com/login',
      resetUrl: 'https://example.com/reset-password?token=sample-token',
      verificationUrl: 'https://example.com/verify-email?token=sample-token',
      magicUrl: 'https://example.com/magic-login?token=sample-token',
      expirationTime: '15',
      lockoutDuration: '30',
      backupCodes: ['ABC123', 'DEF456', 'GHI789', 'JKL012'],
    };

    const data = { ...defaultTestData, ...testData };
    const rendered = await emailTemplateService.previewTemplate(name, data);

    res.status(200).json({
      success: true,
      message: 'Template test rendering completed',
      data: {
        testData: data,
        rendered,
      },
    });
  });
}

export const emailTemplateController = new EmailTemplateController();