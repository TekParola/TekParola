import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create default permissions
  const permissions = [
    // User permissions
    { name: 'users:create', displayName: 'Create Users', resource: 'users', action: 'create', scope: 'all' },
    { name: 'users:read', displayName: 'Read Users', resource: 'users', action: 'read', scope: 'all' },
    { name: 'users:update', displayName: 'Update Users', resource: 'users', action: 'update', scope: 'all' },
    { name: 'users:delete', displayName: 'Delete Users', resource: 'users', action: 'delete', scope: 'all' },
    { name: 'users:read:own', displayName: 'Read Own Profile', resource: 'users', action: 'read', scope: 'own' },
    { name: 'users:update:own', displayName: 'Update Own Profile', resource: 'users', action: 'update', scope: 'own' },
    
    // Role permissions
    { name: 'roles:create', displayName: 'Create Roles', resource: 'roles', action: 'create', scope: 'all' },
    { name: 'roles:read', displayName: 'Read Roles', resource: 'roles', action: 'read', scope: 'all' },
    { name: 'roles:update', displayName: 'Update Roles', resource: 'roles', action: 'update', scope: 'all' },
    { name: 'roles:delete', displayName: 'Delete Roles', resource: 'roles', action: 'delete', scope: 'all' },
    { name: 'roles:assign', displayName: 'Assign Roles', resource: 'roles', action: 'assign', scope: 'all' },
    
    // Application permissions
    { name: 'applications:create', displayName: 'Create Applications', resource: 'applications', action: 'create', scope: 'all' },
    { name: 'applications:read', displayName: 'Read Applications', resource: 'applications', action: 'read', scope: 'all' },
    { name: 'applications:update', displayName: 'Update Applications', resource: 'applications', action: 'update', scope: 'all' },
    { name: 'applications:delete', displayName: 'Delete Applications', resource: 'applications', action: 'delete', scope: 'all' },
    
    // API Key permissions
    { name: 'apikeys:create', displayName: 'Create API Keys', resource: 'apikeys', action: 'create', scope: 'all' },
    { name: 'apikeys:read', displayName: 'Read API Keys', resource: 'apikeys', action: 'read', scope: 'all' },
    { name: 'apikeys:update', displayName: 'Update API Keys', resource: 'apikeys', action: 'update', scope: 'all' },
    { name: 'apikeys:delete', displayName: 'Delete API Keys', resource: 'apikeys', action: 'delete', scope: 'all' },
    
    // Settings permissions
    { name: 'settings:read', displayName: 'Read Settings', resource: 'settings', action: 'read', scope: 'all' },
    { name: 'settings:update', displayName: 'Update Settings', resource: 'settings', action: 'update', scope: 'all' },
    
    // Audit log permissions
    { name: 'audit:read', displayName: 'Read Audit Logs', resource: 'audit', action: 'read', scope: 'all' },
    { name: 'audit:read:own', displayName: 'Read Own Audit Logs', resource: 'audit', action: 'read', scope: 'own' },
  ];

  console.log('📝 Creating permissions...');
  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: {},
      create: {
        ...perm,
        description: `Permission to ${perm.action} ${perm.resource}`,
        isSystem: true,
      },
    });
  }

  // Create default roles
  console.log('👥 Creating default roles...');
  
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'super_admin' },
    update: {},
    create: {
      name: 'super_admin',
      displayName: 'Super Administrator',
      description: 'Full system access with all permissions',
      isSystem: true,
      isActive: true,
    },
  });

  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: {
      name: 'admin',
      displayName: 'Administrator',
      description: 'Administrative access with most permissions',
      isSystem: true,
      isActive: true,
    },
  });

  const userRole = await prisma.role.upsert({
    where: { name: 'user' },
    update: {},
    create: {
      name: 'user',
      displayName: 'User',
      description: 'Regular user with basic permissions',
      isSystem: true,
      isActive: true,
    },
  });

  // Assign permissions to roles
  console.log('🔐 Assigning permissions to roles...');
  
  // Super Admin gets all permissions
  const allPermissions = await prisma.permission.findMany();
  for (const permission of allPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superAdminRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: superAdminRole.id,
        permissionId: permission.id,
      },
    });
  }

  // Admin gets most permissions (exclude super admin specific ones)
  const adminPermissions = allPermissions.filter(p => 
    !p.name.includes('super') && p.scope !== 'own'
  );
  for (const permission of adminPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: permission.id,
      },
    });
  }

  // User gets basic permissions
  const userPermissions = allPermissions.filter(p => 
    p.scope === 'own' || p.name === 'audit:read:own'
  );
  for (const permission of userPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: userRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: userRole.id,
        permissionId: permission.id,
      },
    });
  }

  // Create default super admin user
  console.log('👤 Creating default super admin user...');
  const hashedPassword = await bcrypt.hash('Admin123!@#', 10);
  
  const superAdminUser = await prisma.user.upsert({
    where: { email: 'admin@tekparola.com' },
    update: {},
    create: {
      email: 'admin@tekparola.com',
      username: 'admin',
      firstName: 'System',
      lastName: 'Administrator',
      password: hashedPassword,
      isActive: true,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  // Assign super admin role
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: superAdminUser.id,
        roleId: superAdminRole.id,
      },
    },
    update: {},
    create: {
      userId: superAdminUser.id,
      roleId: superAdminRole.id,
    },
  });

  // Create system settings
  console.log('⚙️ Creating system settings...');
  const systemSettings = [
    // Security settings
    { key: 'security.password.minLength', value: '8', type: 'number', category: 'security', description: 'Minimum password length' },
    { key: 'security.password.requireUppercase', value: 'true', type: 'boolean', category: 'security', description: 'Require uppercase letters in password' },
    { key: 'security.password.requireLowercase', value: 'true', type: 'boolean', category: 'security', description: 'Require lowercase letters in password' },
    { key: 'security.password.requireNumbers', value: 'true', type: 'boolean', category: 'security', description: 'Require numbers in password' },
    { key: 'security.password.requireSpecialChars', value: 'true', type: 'boolean', category: 'security', description: 'Require special characters in password' },
    { key: 'security.session.timeout', value: '3600', type: 'number', category: 'security', description: 'Session timeout in seconds' },
    { key: 'security.maxLoginAttempts', value: '5', type: 'number', category: 'security', description: 'Maximum failed login attempts before lockout' },
    { key: 'security.lockoutDuration', value: '1800', type: 'number', category: 'security', description: 'Account lockout duration in seconds' },
    
    // Email settings
    { key: 'email.from.name', value: 'TekParola SSO', type: 'string', category: 'email', description: 'Default sender name for emails' },
    { key: 'email.from.address', value: 'noreply@tekparola.com', type: 'string', category: 'email', description: 'Default sender email address' },
    
    // System settings
    { key: 'system.maintenance.enabled', value: 'false', type: 'boolean', category: 'system', description: 'Enable maintenance mode' },
    { key: 'system.maintenance.message', value: 'System is under maintenance', type: 'string', category: 'system', description: 'Maintenance mode message' },
    { key: 'system.registration.enabled', value: 'true', type: 'boolean', category: 'system', description: 'Enable user registration' },
    { key: 'system.registration.requireEmailVerification', value: 'true', type: 'boolean', category: 'system', description: 'Require email verification for new users' },
    
    // Application settings
    { key: 'app.name', value: 'TekParola SSO', type: 'string', category: 'app', description: 'Application name', isPublic: true },
    { key: 'app.logo', value: '/assets/logo.png', type: 'string', category: 'app', description: 'Application logo URL', isPublic: true },
    { key: 'app.primaryColor', value: '#1976d2', type: 'string', category: 'app', description: 'Primary color', isPublic: true },
    { key: 'app.secondaryColor', value: '#dc004e', type: 'string', category: 'app', description: 'Secondary color', isPublic: true },
  ];

  for (const setting of systemSettings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  // Create email templates
  console.log('📧 Creating email templates...');
  const emailTemplates = [
    {
      name: 'welcome',
      subject: 'Welcome to {{appName}}',
      htmlContent: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f4f4f4; }
    .button { display: inline-block; padding: 10px 20px; background-color: #1976d2; color: white; text-decoration: none; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to {{appName}}</h1>
    </div>
    <div class="content">
      <h2>Hello {{firstName}},</h2>
      <p>Thank you for joining {{appName}}. Your account has been successfully created.</p>
      {{#if verificationUrl}}
      <p>Please verify your email address by clicking the button below:</p>
      <p style="text-align: center;">
        <a href="{{verificationUrl}}" class="button">Verify Email</a>
      </p>
      {{/if}}
      <p>If you have any questions, please contact our support team.</p>
      <p>Best regards,<br>The {{appName}} Team</p>
    </div>
  </div>
</body>
</html>`,
      textContent: `Welcome to {{appName}}

Hello {{firstName}},

Thank you for joining {{appName}}. Your account has been successfully created.

{{#if verificationUrl}}
Please verify your email address by visiting:
{{verificationUrl}}
{{/if}}

If you have any questions, please contact our support team.

Best regards,
The {{appName}} Team`,
      category: 'user',
      description: 'Welcome email sent to new users',
      variables: JSON.stringify(['appName', 'firstName', 'verificationUrl']),
    },
    {
      name: 'password-reset',
      subject: 'Password Reset Request - {{appName}}',
      htmlContent: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f4f4f4; }
    .button { display: inline-block; padding: 10px 20px; background-color: #1976d2; color: white; text-decoration: none; border-radius: 4px; }
    .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Password Reset Request</h1>
    </div>
    <div class="content">
      <h2>Hello {{firstName}},</h2>
      <p>We received a request to reset your password for your {{appName}} account.</p>
      <p style="text-align: center;">
        <a href="{{resetUrl}}" class="button">Reset Password</a>
      </p>
      <p>This link will expire in {{expiresIn}} minutes.</p>
      <div class="warning">
        <p><strong>Security Notice:</strong> If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
      </div>
      <p>Best regards,<br>The {{appName}} Team</p>
    </div>
  </div>
</body>
</html>`,
      textContent: `Password Reset Request

Hello {{firstName}},

We received a request to reset your password for your {{appName}} account.

Reset your password by visiting:
{{resetUrl}}

This link will expire in {{expiresIn}} minutes.

Security Notice: If you didn't request this password reset, please ignore this email. Your password will remain unchanged.

Best regards,
The {{appName}} Team`,
      category: 'security',
      description: 'Password reset email',
      variables: JSON.stringify(['appName', 'firstName', 'resetUrl', 'expiresIn']),
    },
    {
      name: 'magic-link',
      subject: 'Your login link - {{appName}}',
      htmlContent: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f4f4f4; }
    .button { display: inline-block; padding: 10px 20px; background-color: #1976d2; color: white; text-decoration: none; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Your Login Link</h1>
    </div>
    <div class="content">
      <p>Click the button below to securely log in to {{appName}}:</p>
      <p style="text-align: center;">
        <a href="{{magicLink}}" class="button">Log In</a>
      </p>
      <p>This link will expire in {{expiresIn}} minutes.</p>
      <p>If you didn't request this login link, you can safely ignore this email.</p>
      <p>Best regards,<br>The {{appName}} Team</p>
    </div>
  </div>
</body>
</html>`,
      textContent: `Your Login Link

Click the link below to securely log in to {{appName}}:
{{magicLink}}

This link will expire in {{expiresIn}} minutes.

If you didn't request this login link, you can safely ignore this email.

Best regards,
The {{appName}} Team`,
      category: 'authentication',
      description: 'Magic link login email',
      variables: JSON.stringify(['appName', 'magicLink', 'expiresIn']),
    },
  ];

  for (const template of emailTemplates) {
    await prisma.emailTemplate.upsert({
      where: { name: template.name },
      update: {},
      create: template,
    });
  }

  // Create a sample application
  console.log('🚀 Creating sample application...');
  const sampleApp = await prisma.application.upsert({
    where: { name: 'sample-app' },
    update: {},
    create: {
      name: 'sample-app',
      displayName: 'Sample Application',
      description: 'A sample application for testing SSO integration',
      clientId: uuidv4(),
      clientSecret: Buffer.from(uuidv4()).toString('base64'),
      redirectUris: ['http://localhost:3001/callback', 'http://localhost:3001/auth/callback'],
      scopes: ['openid', 'profile', 'email'],
      website: 'http://localhost:3001',
      contactEmail: 'contact@sampleapp.com',
      isActive: true,
      isFirstParty: true,
      allowedOrigins: ['http://localhost:3001'],
      tokenLifetime: 3600,
      refreshTokenLifetime: 604800,
    },
  });

  console.log('✅ Database seed completed successfully!');
  console.log('\n📋 Summary:');
  console.log(`- Permissions created: ${permissions.length}`);
  console.log('- Roles created: 3 (super_admin, admin, user)');
  console.log('- Default super admin user:');
  console.log('  Email: admin@tekparola.com');
  console.log('  Password: Admin123!@#');
  console.log(`- System settings created: ${systemSettings.length}`);
  console.log(`- Email templates created: ${emailTemplates.length}`);
  console.log('- Sample application created');
  console.log(`  Client ID: ${sampleApp.clientId}`);
  console.log(`  Client Secret: ${sampleApp.clientSecret}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });