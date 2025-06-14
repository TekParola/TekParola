import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TekParola SSO API',
      version: '1.0.0',
      description: `
        # TekParola SSO API Documentation
        
        Enterprise Single Sign-On System providing OAuth2/OpenID Connect authentication services.
        
        ## Features
        - OAuth2 Authorization Server (RFC 6749)
        - OpenID Connect 1.0 support
        - Role-Based Access Control (RBAC)
        - Two-Factor Authentication (TOTP)
        - API Key Management
        - Session Management
        - Comprehensive Audit Logging
        - Bulk User Operations
        
        ## Authentication
        This API supports multiple authentication methods:
        - **Bearer Token**: JWT tokens obtained from the login endpoint
        - **API Key**: Application-level authentication using X-API-Key header
        - **Session Cookie**: Browser-based session authentication
        
        ## Rate Limiting
        All endpoints are subject to rate limiting. Check the response headers for current limits.
        
        ## Error Handling
        All errors follow a consistent format with appropriate HTTP status codes.
      `,
      termsOfService: 'https://tekparola.com/terms',
      contact: {
        name: 'TekParola Support',
        url: 'https://tekparola.com/support',
        email: 'support@tekparola.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: `http://localhost:${config.port}/api/${config.api_version}`,
        description: 'Development server',
      },
      {
        url: `https://api.tekparola.com/api/${config.api_version}`,
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from login endpoint',
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for application authentication',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['success', 'message'],
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            message: {
              type: 'string',
              example: 'Error message',
            },
            code: {
              type: 'string',
              example: 'ERROR_CODE',
            },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'cm1xyz123abc',
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'user@example.com',
            },
            username: {
              type: 'string',
              example: 'johndoe',
            },
            firstName: {
              type: 'string',
              example: 'John',
            },
            lastName: {
              type: 'string',
              example: 'Doe',
            },
            phoneNumber: {
              type: 'string',
              example: '+1234567890',
            },
            isActive: {
              type: 'boolean',
              example: true,
            },
            isEmailVerified: {
              type: 'boolean',
              example: true,
            },
            twoFactorEnabled: {
              type: 'boolean',
              example: false,
            },
            lastLoginAt: {
              type: 'string',
              format: 'date-time',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Role: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'cm1xyz123abc',
            },
            name: {
              type: 'string',
              example: 'admin',
            },
            displayName: {
              type: 'string',
              example: 'Administrator',
            },
            description: {
              type: 'string',
              example: 'Administrative role with full access',
            },
            isSystem: {
              type: 'boolean',
              example: true,
            },
            isActive: {
              type: 'boolean',
              example: true,
            },
            parentId: {
              type: 'string',
              nullable: true,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Permission: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'cm1xyz123abc',
            },
            name: {
              type: 'string',
              example: 'users.read',
            },
            displayName: {
              type: 'string',
              example: 'Read Users',
            },
            description: {
              type: 'string',
              example: 'Permission to read user data',
            },
            resource: {
              type: 'string',
              example: 'users',
            },
            action: {
              type: 'string',
              example: 'read',
            },
            scope: {
              type: 'string',
              nullable: true,
              example: 'all',
            },
            isSystem: {
              type: 'boolean',
              example: true,
            },
          },
        },
        Application: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'cm1xyz123abc',
            },
            name: {
              type: 'string',
              example: 'my-app',
            },
            displayName: {
              type: 'string',
              example: 'My Application',
            },
            description: {
              type: 'string',
              example: 'Application description',
            },
            clientId: {
              type: 'string',
              example: 'app_1234567890abcdef',
            },
            isActive: {
              type: 'boolean',
              example: true,
            },
            isFirstParty: {
              type: 'boolean',
              example: false,
            },
            website: {
              type: 'string',
              format: 'uri',
              example: 'https://myapp.com',
            },
            contactEmail: {
              type: 'string',
              format: 'email',
              example: 'contact@myapp.com',
            },
            redirectUris: {
              type: 'array',
              items: {
                type: 'string',
                format: 'uri',
              },
              example: ['https://myapp.com/callback'],
            },
            scopes: {
              type: 'array',
              items: {
                type: 'string',
              },
              example: ['read', 'write'],
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        ApiKey: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'cm1xyz123abc',
            },
            name: {
              type: 'string',
              example: 'Production API Key',
            },
            keyId: {
              type: 'string',
              example: 'ak_1234567890abcdef',
            },
            permissions: {
              type: 'array',
              items: {
                type: 'string',
              },
              example: ['users.read', 'applications.read'],
            },
            isActive: {
              type: 'boolean',
              example: true,
            },
            lastUsedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            rateLimit: {
              type: 'integer',
              example: 1000,
            },
            rateLimitWindow: {
              type: 'integer',
              example: 3600,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Session: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'cm1xyz123abc',
            },
            sessionToken: {
              type: 'string',
              example: 'sess_1234567890abcdef',
            },
            ipAddress: {
              type: 'string',
              example: '192.168.1.1',
            },
            userAgent: {
              type: 'string',
              example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            country: {
              type: 'string',
              nullable: true,
              example: 'United States',
            },
            city: {
              type: 'string',
              nullable: true,
              example: 'New York',
            },
            device: {
              type: 'string',
              nullable: true,
              example: 'Desktop',
            },
            browser: {
              type: 'string',
              nullable: true,
              example: 'Chrome',
            },
            os: {
              type: 'string',
              nullable: true,
              example: 'Windows',
            },
            isActive: {
              type: 'boolean',
              example: true,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            lastActivityAt: {
              type: 'string',
              format: 'date-time',
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        TokenPair: {
          type: 'object',
          properties: {
            accessToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            refreshToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            expiresIn: {
              type: 'integer',
              example: 900,
              description: 'Token expiry time in seconds',
            },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'user@example.com',
            },
            password: {
              type: 'string',
              example: 'SecurePass123!',
            },
            twoFactorCode: {
              type: 'string',
              pattern: '^[0-9]{6}$',
              example: '123456',
              description: 'Six-digit TOTP code (required if 2FA is enabled)',
            },
            rememberMe: {
              type: 'boolean',
              example: false,
            },
          },
        },
        RegisterRequest: {
          type: 'object',
          required: ['email', 'firstName', 'lastName', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'user@example.com',
            },
            username: {
              type: 'string',
              pattern: '^[a-zA-Z0-9_-]+$',
              example: 'johndoe',
            },
            firstName: {
              type: 'string',
              example: 'John',
            },
            lastName: {
              type: 'string',
              example: 'Doe',
            },
            password: {
              type: 'string',
              pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$',
              example: 'SecurePass123!',
            },
            phoneNumber: {
              type: 'string',
              example: '+1234567890',
            },
          },
        },
      },
    },
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication, login, logout, and token management',
      },
      {
        name: 'Users',
        description: 'User management operations - create, read, update, delete users',
      },
      {
        name: 'Applications',
        description: 'OAuth2 application registration and API key management',
      },
      {
        name: 'Roles & Permissions',
        description: 'Role-based access control and permission management',
      },
      {
        name: 'OAuth2',
        description: 'OAuth2 authorization server endpoints (RFC 6749)',
      },
      {
        name: 'Two-Factor Auth',
        description: 'Two-factor authentication setup and verification',
      },
      {
        name: 'Sessions',
        description: 'Session management and monitoring',
      },
      {
        name: 'Audit & Monitoring',
        description: 'Audit logs, security events, and system monitoring',
      },
      {
        name: 'Dashboard',
        description: 'Administrative dashboard and analytics',
      },
      {
        name: 'Bulk Operations',
        description: 'Bulk user import/export and batch operations',
      },
      {
        name: 'Security',
        description: 'Security-related operations and configurations',
      },
      {
        name: 'System',
        description: 'System health checks and configuration',
      },
    ],
  },
  apis: [
    './src/routes/*.ts',
    './src/controllers/*.ts',
  ],
};

export const swaggerSpec = swaggerJsdoc(options);