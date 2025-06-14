# TekParola JavaScript/Node.js SDK

Official JavaScript/Node.js SDK for TekParola Enterprise SSO System.

## Installation

```bash
npm install tekparola-sdk
# or
yarn add tekparola-sdk
```

## Quick Start

### Initialize the Client

```javascript
const { TekParolaClient } = require('tekparola-sdk');
// or
import { TekParolaClient } from 'tekparola-sdk';

const client = new TekParolaClient({
  baseUrl: 'https://sso.yourdomain.com',
  clientId: 'your-client-id', // Optional - for SSO operations
  clientSecret: 'your-client-secret', // Optional - for SSO operations
  apiKey: 'your-api-key', // Optional - for API operations
  timeout: 30000, // Optional - request timeout in ms
  debug: false // Optional - enable debug logging
});
```

## Authentication

### Login with Email/Password

```javascript
try {
  const { tokens, user } = await client.auth.login({
    email: 'user@example.com',
    password: 'password123',
    rememberMe: true
  });

  console.log('Access Token:', tokens.accessToken);
  console.log('User:', user);
} catch (error) {
  if (error.code === 'INVALID_CREDENTIALS') {
    console.error('Invalid email or password');
  }
}
```

### Two-Factor Authentication

```javascript
// If login requires 2FA
const loginResult = await client.auth.login({
  email: 'user@example.com',
  password: 'password123'
});

if (loginResult.requiresTwoFactor) {
  // Verify with 2FA code
  const { tokens, user } = await client.auth.verifyTwoFactor({
    tempToken: loginResult.tempToken,
    code: '123456'
  });
}
```

### Magic Link Authentication

```javascript
// Request magic link
await client.auth.requestMagicLink({
  email: 'user@example.com',
  redirectUrl: 'https://app.example.com/auth/callback'
});

// Verify magic link token
const { tokens, user } = await client.auth.verifyMagicLink(token);
```

### SSO Flow

```javascript
// Initialize SSO
const { authorizationUrl, state } = await client.auth.initSSO({
  applicationId: 'app-id',
  redirectUri: 'https://app.example.com/callback',
  scope: 'openid profile email',
  state: 'random-state'
});

// Redirect user to authorizationUrl
window.location.href = authorizationUrl;

// After user authorizes, exchange code for tokens
const tokens = await client.auth.exchangeCodeForTokens({
  code: 'authorization-code',
  state: 'random-state'
});
```

### Token Management

```javascript
// Refresh access token
const newTokens = await client.auth.refreshToken(refreshToken);

// Validate token (API endpoint)
const { valid, user } = await client.auth.validateToken(accessToken);

// Logout
await client.auth.logout();
```

## User Management

### Profile Operations

```javascript
// Get current user profile
const profile = await client.user.getProfile();

// Update profile
const updatedProfile = await client.user.updateProfile({
  firstName: 'John',
  lastName: 'Doe',
  phoneNumber: '+1234567890',
  timezone: 'America/New_York',
  language: 'en'
});

// Change password
await client.user.changePassword('currentPassword', 'newPassword');
```

### Session Management

```javascript
// Get active sessions
const sessions = await client.user.getSessions();

// Revoke specific session
await client.user.revokeSession(sessionId);

// Revoke all sessions except current
await client.user.revokeAllSessions();
```

### User Data

```javascript
// Get audit logs
const logs = await client.user.getAuditLogs({
  limit: 50,
  offset: 0,
  action: 'login',
  startDate: new Date('2024-01-01'),
  endDate: new Date()
});

// Export user data
const { downloadUrl } = await client.user.exportData('json');

// Delete account
await client.user.deleteAccount('password');
```

## Application Management (Admin)

### Application Operations

```javascript
// List applications
const { items, total } = await client.application.list({
  limit: 20,
  offset: 0,
  search: 'app name',
  isActive: true
});

// Create application
const { application, clientSecret } = await client.application.create({
  name: 'my-app',
  displayName: 'My Application',
  redirectUris: ['https://app.example.com/callback'],
  scopes: ['openid', 'profile', 'email']
});

// Update application
await client.application.update(applicationId, {
  displayName: 'Updated Name',
  isActive: false
});
```

### API Key Management

```javascript
// Create API key
const { apiKey, key } = await client.application.createApiKey(applicationId, {
  name: 'Production API Key',
  permissions: ['read:users', 'validate:tokens'],
  expiresAt: new Date('2025-01-01'),
  rateLimit: 1000,
  rateLimitWindow: 60000 // 1 minute
});

// List API keys
const apiKeys = await client.application.listApiKeys(applicationId);

// Revoke API key
await client.application.revokeApiKey(applicationId, apiKeyId);
```

## API Endpoints

For server-to-server communication using API keys:

```javascript
// Set API key
client.setApiKey('your-api-key');

// Validate SSO token
const { valid, user } = await client.auth.validateToken(accessToken);

// Get user profile by ID
const userProfile = await client.user.getUserById(userId);

// Validate user credentials
const { valid, user } = await client.user.validateCredentials(
  'user@example.com',
  'password123'
);

// Get current application info
const { application, apiKey } = await client.application.getCurrentInfo();
```

## Error Handling

```javascript
try {
  await client.auth.login({ email, password });
} catch (error) {
  if (error instanceof TekParolaError) {
    console.error(`Error: ${error.message}`);
    console.error(`Code: ${error.code}`);
    console.error(`Status: ${error.statusCode}`);
    
    switch (error.name) {
      case 'AuthenticationError':
        // Handle authentication errors
        break;
      case 'ValidationError':
        // Handle validation errors
        console.error('Details:', error.details);
        break;
      case 'RateLimitError':
        // Handle rate limit
        console.error(`Retry after: ${error.retryAfter} seconds`);
        break;
      case 'NetworkError':
        // Handle network errors
        break;
    }
  }
}
```

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions:

```typescript
import { 
  TekParolaClient, 
  TekParolaConfig,
  UserProfile,
  AuthTokens,
  TekParolaError 
} from 'tekparola-sdk';

const config: TekParolaConfig = {
  baseUrl: 'https://sso.example.com',
  apiKey: 'your-api-key'
};

const client = new TekParolaClient(config);

// All methods are fully typed
const profile: UserProfile = await client.user.getProfile();
```

## Examples

Check the `examples/` directory for more detailed examples:

- Basic authentication
- SSO integration
- API key usage
- Error handling
- TypeScript usage

## License

MIT License - see LICENSE file for details.

## Support

For issues and feature requests, please visit our [GitHub repository](https://github.com/tekparola/sdk-javascript).