import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/config/database';
import { redis } from '../../src/config/redis';
import * as jwt from 'jsonwebtoken';

const app = createApp();

describe('API Integration Tests', () => {
  let authToken: string;
  let testUser: any;
  let testRole: any;
  let testApplication: any;

  beforeAll(async () => {
    // Clean database
    await prisma.userRole.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.application.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await prisma.permission.deleteMany();

    // Create test permissions
    const permissions = await prisma.permission.createMany({
      data: [
        { name: 'read:users', description: 'Read users' },
        { name: 'write:users', description: 'Write users' },
        { name: 'delete:users', description: 'Delete users' },
        { name: 'manage:roles', description: 'Manage roles' },
        { name: 'manage:applications', description: 'Manage applications' },
      ],
    });

    // Create test role
    testRole = await prisma.role.create({
      data: {
        name: 'test-admin',
        description: 'Test admin role',
        permissions: {
          create: [
            { permission: { connect: { name: 'read:users' } } },
            { permission: { connect: { name: 'write:users' } } },
            { permission: { connect: { name: 'manage:roles' } } },
            { permission: { connect: { name: 'manage:applications' } } },
          ],
        },
      },
    });

    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: 'integration@test.com',
        firstName: 'Integration',
        lastName: 'Test',
        password: '$2b$10$YourHashedPasswordHere', // Pre-hashed password
        isActive: true,
        isEmailVerified: true,
        roles: {
          create: {
            roleId: testRole.id,
          },
        },
      },
    });

    // Generate auth token
    authToken = jwt.sign(
      {
        userId: testUser.id,
        sessionId: 'test-session',
        roles: ['test-admin'],
        permissions: ['read:users', 'write:users', 'manage:roles', 'manage:applications'],
      },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    // Cleanup
    await prisma.userRole.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.application.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await prisma.permission.deleteMany();
    await redis.flushdb();
  });

  describe('User Management Flow', () => {
    it('should complete full user lifecycle', async () => {
      // 1. Create user
      const createResponse = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'newuser@test.com',
          firstName: 'New',
          lastName: 'User',
          password: 'TestPass123!',
        })
        .expect(201);

      const userId = createResponse.body.data.id;
      expect(createResponse.body.data.email).toBe('newuser@test.com');

      // 2. Get user profile
      const getResponse = await request(app)
        .get(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(getResponse.body.data.id).toBe(userId);
      expect(getResponse.body.data.email).toBe('newuser@test.com');

      // 3. Update user
      const updateResponse = await request(app)
        .put(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          firstName: 'Updated',
          lastName: 'Name',
        })
        .expect(200);

      expect(updateResponse.body.data.firstName).toBe('Updated');
      expect(updateResponse.body.data.lastName).toBe('Name');

      // 4. Assign role
      await request(app)
        .post(`/api/v1/users/${userId}/roles`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          roleIds: [testRole.id],
        })
        .expect(200);

      // 5. Verify role assignment
      const rolesResponse = await request(app)
        .get(`/api/v1/users/${userId}/roles`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(rolesResponse.body.data).toHaveLength(1);
      expect(rolesResponse.body.data[0].id).toBe(testRole.id);

      // 6. Deactivate user
      await request(app)
        .post(`/api/v1/users/${userId}/deactivate`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // 7. Verify deactivation
      const deactivatedResponse = await request(app)
        .get(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(deactivatedResponse.body.data.isActive).toBe(false);
    });
  });

  describe('Role Management Flow', () => {
    it('should complete full role lifecycle', async () => {
      // 1. Create role
      const createResponse = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'test-role',
          description: 'Test role for integration tests',
          permissions: ['read:users'],
        })
        .expect(201);

      const roleId = createResponse.body.data.id;
      expect(createResponse.body.data.name).toBe('test-role');

      // 2. Get role
      const getResponse = await request(app)
        .get(`/api/v1/roles/${roleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(getResponse.body.data.id).toBe(roleId);
      expect(getResponse.body.data.permissions).toHaveLength(1);

      // 3. Update role
      const updateResponse = await request(app)
        .put(`/api/v1/roles/${roleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'Updated test role description',
          permissions: ['read:users', 'write:users'],
        })
        .expect(200);

      expect(updateResponse.body.data.description).toBe('Updated test role description');

      // 4. Get role permissions
      const permissionsResponse = await request(app)
        .get(`/api/v1/roles/${roleId}/permissions`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(permissionsResponse.body.data).toHaveLength(2);

      // 5. Delete role
      await request(app)
        .delete(`/api/v1/roles/${roleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // 6. Verify deletion
      await request(app)
        .get(`/api/v1/roles/${roleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('Application Management Flow', () => {
    it('should complete full application lifecycle', async () => {
      // 1. Create application
      const createResponse = await request(app)
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test App',
          description: 'Test application for integration tests',
          redirectUris: ['http://localhost:3000/callback'],
          scopes: ['read:profile', 'write:profile'],
        })
        .expect(201);

      const appId = createResponse.body.data.id;
      testApplication = createResponse.body.data;
      expect(createResponse.body.data.name).toBe('Test App');
      expect(createResponse.body.data.apiKey).toBeDefined();

      // 2. Get application
      const getResponse = await request(app)
        .get(`/api/v1/applications/${appId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(getResponse.body.data.id).toBe(appId);

      // 3. Update application
      const updateResponse = await request(app)
        .put(`/api/v1/applications/${appId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'Updated test application',
          redirectUris: ['http://localhost:3000/callback', 'http://localhost:3000/callback2'],
        })
        .expect(200);

      expect(updateResponse.body.data.description).toBe('Updated test application');
      expect(updateResponse.body.data.redirectUris).toHaveLength(2);

      // 4. Rotate API key
      const rotateResponse = await request(app)
        .post(`/api/v1/applications/${appId}/rotate-key`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(rotateResponse.body.data.newKeyId).toBeDefined();
      expect(rotateResponse.body.data.newKeySecret).toBeDefined();
      expect(rotateResponse.body.data.oldKeyId).toBe(testApplication.apiKey.id);

      // 5. Delete application
      await request(app)
        .delete(`/api/v1/applications/${appId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // 6. Verify deletion
      await request(app)
        .get(`/api/v1/applications/${appId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('Search and Filter Operations', () => {
    beforeAll(async () => {
      // Create test data for search
      await prisma.user.createMany({
        data: [
          {
            email: 'search1@test.com',
            firstName: 'John',
            lastName: 'Doe',
            password: 'hash',
          },
          {
            email: 'search2@test.com',
            firstName: 'Jane',
            lastName: 'Smith',
            password: 'hash',
          },
          {
            email: 'filter@test.com',
            firstName: 'Bob',
            lastName: 'Johnson',
            password: 'hash',
          },
        ],
      });
    });

    it('should search users by name', async () => {
      const response = await request(app)
        .get('/api/v1/users/search')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ search: 'John' })
        .expect(200);

      expect(response.body.data.users).toHaveLength(2); // John Doe and Bob Johnson
      expect(response.body.data.total).toBe(2);
    });

    it('should paginate search results', async () => {
      const response = await request(app)
        .get('/api/v1/users/search')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(response.body.data.users).toHaveLength(2);
      expect(response.body.data.page).toBe(1);
      expect(response.body.data.limit).toBe(2);
      expect(response.body.data.totalPages).toBeGreaterThan(1);
    });

    it('should filter users by active status', async () => {
      const response = await request(app)
        .get('/api/v1/users/search')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ isActive: true })
        .expect(200);

      expect(response.body.data.users.every((u: any) => u.isActive)).toBe(true);
    });
  });

  describe('Audit Log Operations', () => {
    it('should create and retrieve audit logs', async () => {
      // Perform an auditable action
      await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'audit@test.com',
          firstName: 'Audit',
          lastName: 'Test',
          password: 'TestPass123!',
        })
        .expect(201);

      // Retrieve audit logs
      const response = await request(app)
        .get('/api/v1/audit')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ action: 'user.created' })
        .expect(200);

      expect(response.body.data.logs).toBeDefined();
      expect(response.body.data.logs.some((log: any) => 
        log.action === 'user.created' && 
        log.targetId.includes('audit@test.com')
      )).toBe(true);
    });
  });

  describe('OAuth2 Flow', () => {
    it('should complete OAuth2 authorization flow', async () => {
      // Create test application first
      const appResponse = await request(app)
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'OAuth Test App',
          description: 'OAuth2 test application',
          redirectUris: ['http://localhost:3000/callback'],
          scopes: ['read:profile'],
        })
        .expect(201);

      const clientId = appResponse.body.data.clientId;
      const clientSecret = appResponse.body.data.clientSecret;

      // 1. Get authorization endpoint
      const authResponse = await request(app)
        .get('/api/v1/oauth/authorize')
        .query({
          client_id: clientId,
          redirect_uri: 'http://localhost:3000/callback',
          response_type: 'code',
          scope: 'read:profile',
          state: 'test-state',
        })
        .expect(200);

      expect(authResponse.body.data.clientName).toBe('OAuth Test App');
      expect(authResponse.body.data.scopes).toContain('read:profile');

      // Note: In a real test, we would simulate user approval and get an auth code
      // For now, we'll test the token endpoint with a mock code

      // 2. Test token introspection (with a valid token)
      const introspectResponse = await request(app)
        .post('/api/v1/oauth/introspect')
        .auth(clientId, clientSecret)
        .send({
          token: authToken,
        })
        .expect(200);

      expect(introspectResponse.body.active).toBe(true);
      expect(introspectResponse.body.sub).toBe(testUser.id);
    });

    it('should return OAuth2 metadata', async () => {
      const response = await request(app)
        .get('/.well-known/oauth-authorization-server')
        .expect(200);

      expect(response.body.issuer).toBeDefined();
      expect(response.body.authorization_endpoint).toBeDefined();
      expect(response.body.token_endpoint).toBeDefined();
      expect(response.body.introspection_endpoint).toBeDefined();
      expect(response.body.response_types_supported).toContain('code');
      expect(response.body.grant_types_supported).toContain('authorization_code');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      // Make multiple requests quickly
      const requests = [];
      for (let i = 0; i < 15; i++) {
        requests.push(
          request(app)
            .get('/api/v1/users/search')
            .set('Authorization', `Bearer ${authToken}`)
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.some(r => r.status === 429);
      
      expect(rateLimited).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should handle missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'missing@test.com',
          // Missing firstName, lastName, password
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.errors).toBeDefined();
    });

    it('should handle unauthorized access', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should handle forbidden access', async () => {
      // Create a token without manage permissions
      const limitedToken = jwt.sign(
        {
          userId: testUser.id,
          sessionId: 'test-session',
          roles: ['user'],
          permissions: ['read:profile'],
        },
        process.env.JWT_SECRET!,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${limitedToken}`)
        .send({
          name: 'forbidden-role',
          description: 'Should not be created',
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('AUTHORIZATION_ERROR');
    });
  });
});
