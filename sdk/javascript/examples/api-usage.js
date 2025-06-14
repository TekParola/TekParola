const { TekParolaClient } = require('tekparola-sdk');

// Initialize client with API key for server-to-server communication
const client = new TekParolaClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'your-api-key-here',
  debug: true
});

async function apiUsageExamples() {
  try {
    // 1. Check API health
    console.log('1. Checking API health...');
    const health = await client.apiHealthCheck();
    console.log('API Status:', health.status);
    console.log('Rate Limit:', health.rateLimit);

    // 2. Get current application info
    console.log('\n2. Getting application info...');
    const { application, apiKey } = await client.application.getCurrentInfo();
    console.log('Application:', application.displayName);
    console.log('API Key permissions:', apiKey.permissions);
    console.log('Rate limit:', `${apiKey.rateLimit} requests per ${apiKey.rateLimitWindow}ms`);

    // 3. Validate SSO access token
    console.log('\n3. Validating access token...');
    const accessToken = 'user-access-token-here';
    const validation = await client.auth.validateToken(accessToken);
    
    if (validation.valid) {
      console.log('Token is valid');
      console.log('User:', validation.user);
    } else {
      console.log('Token is invalid:', validation.error);
    }

    // 4. Get user profile by ID
    console.log('\n4. Getting user profile...');
    const userId = 'user-id-here';
    const userProfile = await client.user.getUserById(userId);
    console.log('User:', userProfile.email);
    console.log('Roles:', userProfile.roles);

    // 5. Validate user credentials
    console.log('\n5. Validating user credentials...');
    const credValidation = await client.user.validateCredentials(
      'user@example.com',
      'password123'
    );
    
    if (credValidation.valid) {
      console.log('Credentials are valid');
      console.log('User ID:', credValidation.user.id);
    } else {
      console.log('Invalid credentials:', credValidation.reason);
    }

    // 6. Application management (admin operations)
    console.log('\n6. Managing applications...');
    
    // List applications
    const { items: apps } = await client.application.list({
      limit: 10,
      isActive: true
    });
    console.log(`Found ${apps.length} active applications`);

    // Create new application
    const { application: newApp, clientSecret } = await client.application.create({
      name: 'test-app',
      displayName: 'Test Application',
      description: 'A test application',
      redirectUris: ['http://localhost:8080/callback'],
      scopes: ['openid', 'profile', 'email'],
      tokenLifetime: 3600,
      refreshTokenLifetime: 86400
    });
    console.log('Created application:', newApp.id);
    console.log('Client ID:', newApp.clientId);
    console.log('Client Secret:', clientSecret);

    // Create API key for the application
    const { apiKey: newKey, key } = await client.application.createApiKey(newApp.id, {
      name: 'Production API Key',
      permissions: ['read:users', 'validate:tokens'],
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      rateLimit: 10000,
      rateLimitWindow: 60000 // 1 minute
    });
    console.log('Created API key:', newKey.keyId);
    console.log('Key:', key);

    // Get application statistics
    const stats = await client.application.getStatistics(newApp.id, {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      endDate: new Date()
    });
    console.log('Application statistics:', stats);

  } catch (error) {
    console.error('API Error:', error.message);
    
    if (error.name === 'RateLimitError') {
      console.error(`Rate limit exceeded. Retry after ${error.retryAfter} seconds`);
    } else if (error.name === 'AuthorizationError') {
      console.error('Insufficient permissions for this operation');
    }
  }
}

// Example: Implementing a validation endpoint in your API
async function validateUserEndpoint(req, res) {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }

    // Validate the token using TekParola
    const validation = await client.auth.validateToken(token);

    if (validation.valid) {
      // Token is valid, return user info
      res.json({
        success: true,
        user: validation.user
      });
    } else {
      // Token is invalid
      res.status(401).json({
        success: false,
        message: 'Invalid token',
        error: validation.error
      });
    }

  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Example: Middleware to protect API routes
function requireValidToken(permissions = []) {
  return async (req, res, next) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'No token provided'
        });
      }

      // Validate token
      const validation = await client.auth.validateToken(token);

      if (!validation.valid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      }

      // Check permissions if specified
      if (permissions.length > 0) {
        const userProfile = await client.user.getUserById(validation.user.sub);
        const userPermissions = userProfile.roles.flatMap(role => role.permissions || []);
        
        const hasPermission = permissions.every(perm => userPermissions.includes(perm));
        
        if (!hasPermission) {
          return res.status(403).json({
            success: false,
            message: 'Insufficient permissions'
          });
        }
      }

      // Attach user to request
      req.user = validation.user;
      next();

    } catch (error) {
      console.error('Auth middleware error:', error);
      res.status(500).json({
        success: false,
        message: 'Authentication error'
      });
    }
  };
}

// Run the examples
apiUsageExamples();

module.exports = {
  validateUserEndpoint,
  requireValidToken
};