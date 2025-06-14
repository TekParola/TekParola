# TekParola SSO - API Reference

## Base URL
```
https://sso.yourdomain.com/api/v1
```

## Authentication

Most endpoints require authentication using a Bearer token in the Authorization header:

```http
Authorization: Bearer <access_token>
```

## Response Format

All responses follow this format:

```json
{
  "success": true,
  "data": { ... },
  "message": "Success message",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

Error responses:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "errors": [ ... ],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Authentication Endpoints

### Register User

```http
POST /auth/register
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "password": "SecurePass123!",
  "username": "johndoe" // optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-123",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "username": "johndoe",
      "isEmailVerified": false,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  },
  "message": "Registration successful. Please check your email to verify your account."
}
```

### Login

```http
POST /auth/login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "remember": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-123",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "roles": ["user"],
      "permissions": ["read:profile", "update:profile"]
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
    },
    "sessionId": "session-123"
  }
}
```

### Refresh Token

```http
POST /auth/refresh-token
```

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
    }
  }
}
```

### Logout

```http
POST /auth/logout
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

### Get Profile

```http
GET /auth/profile
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-123",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "username": "johndoe",
      "isEmailVerified": true,
      "isActive": true,
      "roles": [
        {
          "id": "role-123",
          "name": "user",
          "description": "Default user role"
        }
      ],
      "permissions": [
        "read:profile",
        "update:profile"
      ],
      "createdAt": "2024-01-15T10:30:00Z",
      "lastLoginAt": "2024-01-15T10:30:00Z"
    }
  }
}
```

### Verify Email

```http
POST /auth/verify-email
```

**Request Body:**
```json
{
  "token": "verification-token-here"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

### Forgot Password

```http
POST /auth/forgot-password
```

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset instructions sent to your email"
}
```

### Reset Password

```http
POST /auth/reset-password
```

**Request Body:**
```json
{
  "token": "reset-token-here",
  "newPassword": "NewSecurePass123!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset successful"
}
```

### Change Password

```http
POST /auth/change-password
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewSecurePass123!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

## 2FA Endpoints

### Enable 2FA

```http
POST /auth/2fa/enable
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "secret": "ABCDEFGHIJKLMNOP",
    "qrCode": "data:image/png;base64,...",
    "backupCodes": [
      "ABC123",
      "DEF456",
      "GHI789"
    ]
  }
}
```

### Confirm 2FA

```http
POST /auth/2fa/confirm
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "code": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "2FA enabled successfully"
}
```

### Verify 2FA

```http
POST /auth/2fa/verify
```

**Request Body:**
```json
{
  "tempToken": "temp-token-from-login",
  "code": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": { ... },
    "tokens": {
      "accessToken": "...",
      "refreshToken": "..."
    },
    "sessionId": "session-123"
  }
}
```

### Disable 2FA

```http
POST /auth/2fa/disable
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "password": "YourPassword123!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "2FA disabled successfully"
}
```

## User Management Endpoints

### List Users

```http
GET /users
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20)
- `search` (string): Search query
- `isActive` (boolean): Filter by active status
- `isEmailVerified` (boolean): Filter by email verification status
- `roleId` (string): Filter by role ID

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "user-123",
        "email": "user@example.com",
        "firstName": "John",
        "lastName": "Doe",
        "isActive": true,
        "isEmailVerified": true,
        "roles": ["user"],
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

### Get User

```http
GET /users/:id
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user-123",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "username": "johndoe",
    "isActive": true,
    "isEmailVerified": true,
    "roles": [
      {
        "id": "role-123",
        "name": "user",
        "description": "Default user role",
        "permissions": [
          {
            "name": "read:profile",
            "description": "Read own profile"
          }
        ]
      }
    ],
    "createdAt": "2024-01-15T10:30:00Z",
    "lastLoginAt": "2024-01-15T10:30:00Z"
  }
}
```

### Create User

```http
POST /users
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "firstName": "Jane",
  "lastName": "Smith",
  "password": "SecurePass123!",
  "username": "janesmith",
  "roleIds": ["role-123"],
  "sendWelcomeEmail": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user-456",
    "email": "newuser@example.com",
    "firstName": "Jane",
    "lastName": "Smith",
    "username": "janesmith",
    "isActive": true,
    "isEmailVerified": false,
    "roles": ["user"],
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### Update User

```http
PUT /users/:id
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "username": "janedoe"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user-123",
    "email": "user@example.com",
    "firstName": "Jane",
    "lastName": "Doe",
    "username": "janedoe",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

### Delete User

```http
DELETE /users/:id
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "message": "User deleted successfully"
}
```

### Assign Roles to User

```http
POST /users/:id/roles
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "roleIds": ["role-123", "role-456"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Roles assigned successfully"
}
```

### Bulk Import Users

```http
POST /users/bulk/import
```

**Headers:**
```http
Authorization: Bearer <access_token>
Content-Type: multipart/form-data
```

**Form Data:**
- `file`: CSV file with users
- `skipDuplicates`: true/false
- `generatePasswords`: true/false
- `sendWelcomeEmails`: true/false

**Response:**
```json
{
  "success": true,
  "data": {
    "importId": "import-123",
    "totalRecords": 100,
    "successCount": 95,
    "errorCount": 5,
    "errors": [
      {
        "row": 3,
        "email": "invalid@email",
        "error": "Invalid email format"
      }
    ]
  }
}
```

## Role Management Endpoints

### List Roles

```http
GET /roles
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "role-123",
      "name": "admin",
      "description": "Administrator role",
      "isSystem": true,
      "permissions": [
        {
          "id": "perm-123",
          "name": "manage:users",
          "description": "Manage users"
        }
      ],
      "userCount": 5,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Get Role

```http
GET /roles/:id
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "role-123",
    "name": "admin",
    "description": "Administrator role",
    "isSystem": true,
    "permissions": [
      {
        "id": "perm-123",
        "name": "manage:users",
        "description": "Manage users",
        "resource": "users",
        "action": "manage"
      }
    ],
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

### Create Role

```http
POST /roles
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "name": "moderator",
  "description": "Moderator role with limited admin privileges",
  "permissions": ["read:users", "update:posts", "delete:comments"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "role-456",
    "name": "moderator",
    "description": "Moderator role with limited admin privileges",
    "isSystem": false,
    "permissions": [
      "read:users",
      "update:posts",
      "delete:comments"
    ],
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### Update Role

```http
PUT /roles/:id
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "description": "Updated moderator description",
  "permissions": ["read:users", "update:posts"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "role-456",
    "name": "moderator",
    "description": "Updated moderator description",
    "permissions": [
      "read:users",
      "update:posts"
    ],
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

### Delete Role

```http
DELETE /roles/:id
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Role deleted successfully"
}
```

### Clone Role

```http
POST /roles/:id/clone
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "name": "moderator-v2"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "role-789",
    "name": "moderator-v2",
    "description": "Moderator role with limited admin privileges",
    "permissions": [
      "read:users",
      "update:posts"
    ],
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

## Application Management Endpoints

### List Applications

```http
GET /applications
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "app-123",
      "name": "My Application",
      "description": "OAuth2 client application",
      "clientId": "client-123",
      "redirectUris": ["https://app.example.com/callback"],
      "scopes": ["read:profile", "write:profile"],
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Get Application

```http
GET /applications/:id
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "app-123",
    "name": "My Application",
    "description": "OAuth2 client application",
    "clientId": "client-123",
    "redirectUris": ["https://app.example.com/callback"],
    "scopes": ["read:profile", "write:profile"],
    "isActive": true,
    "apiKey": {
      "id": "key-123",
      "keyId": "ak_live_abc123",
      "lastUsedAt": "2024-01-15T10:30:00Z",
      "expiresAt": null
    },
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

### Create Application

```http
POST /applications
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "name": "New Application",
  "description": "My new OAuth2 application",
  "redirectUris": [
    "https://app.example.com/callback",
    "https://app.example.com/auth"
  ],
  "scopes": ["read:profile", "write:profile"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "app-456",
    "name": "New Application",
    "clientId": "client-456",
    "clientSecret": "secret-xyz789",
    "apiKey": {
      "id": "key-456",
      "keyId": "ak_live_def456",
      "keySecret": "sk_live_ghi789"
    },
    "redirectUris": [
      "https://app.example.com/callback",
      "https://app.example.com/auth"
    ],
    "scopes": ["read:profile", "write:profile"],
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### Update Application

```http
PUT /applications/:id
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "name": "Updated Application",
  "description": "Updated description",
  "redirectUris": [
    "https://newapp.example.com/callback"
  ],
  "scopes": ["read:profile"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "app-123",
    "name": "Updated Application",
    "description": "Updated description",
    "redirectUris": [
      "https://newapp.example.com/callback"
    ],
    "scopes": ["read:profile"],
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

### Rotate API Key

```http
POST /applications/:id/rotate-key
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "newKeyId": "ak_live_newkey123",
    "newKeySecret": "sk_live_newsecret456",
    "oldKeyId": "ak_live_oldkey789",
    "message": "API key rotated successfully. The old key will remain valid for 24 hours."
  }
}
```

### Delete Application

```http
DELETE /applications/:id
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Application deleted successfully"
}
```

## OAuth2 Endpoints

### Authorization Endpoint

```http
GET /oauth/authorize
```

**Query Parameters:**
- `client_id` (required): OAuth2 client ID
- `redirect_uri` (required): Redirect URI
- `response_type` (required): "code" or "token"
- `scope` (required): Space-separated scopes
- `state` (recommended): CSRF protection state

**Response:**
Redirects to authorization page or callback with code/token

### Token Endpoint

```http
POST /oauth/token
```

**Request Body (Authorization Code):**
```json
{
  "grant_type": "authorization_code",
  "code": "auth-code-here",
  "redirect_uri": "https://app.example.com/callback",
  "client_id": "client-123",
  "client_secret": "secret-xyz"
}
```

**Request Body (Refresh Token):**
```json
{
  "grant_type": "refresh_token",
  "refresh_token": "refresh-token-here",
  "client_id": "client-123",
  "client_secret": "secret-xyz"
}
```

**Response:**
```json
{
  "access_token": "access-token-here",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "refresh-token-here",
  "scope": "read:profile write:profile"
}
```

### Token Introspection

```http
POST /oauth/introspect
```

**Headers:**
```http
Authorization: Basic <base64(client_id:client_secret)>
```

**Request Body:**
```json
{
  "token": "access-token-to-introspect",
  "token_type_hint": "access_token"
}
```

**Response:**
```json
{
  "active": true,
  "scope": "read:profile write:profile",
  "client_id": "client-123",
  "username": "johndoe",
  "exp": 1642521600,
  "iat": 1642518000,
  "sub": "user-123",
  "aud": "https://sso.yourdomain.com"
}
```

### Well-Known Configuration

```http
GET /.well-known/oauth-authorization-server
```

**Response:**
```json
{
  "issuer": "https://sso.yourdomain.com",
  "authorization_endpoint": "https://sso.yourdomain.com/api/v1/oauth/authorize",
  "token_endpoint": "https://sso.yourdomain.com/api/v1/oauth/token",
  "introspection_endpoint": "https://sso.yourdomain.com/api/v1/oauth/introspect",
  "revocation_endpoint": "https://sso.yourdomain.com/api/v1/oauth/revoke",
  "response_types_supported": ["code", "token"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post"],
  "scopes_supported": ["read:profile", "write:profile", "read:users", "write:users"]
}
```

## Session Management Endpoints

### Get Active Sessions

```http
GET /auth/sessions
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "session-123",
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0...",
      "location": "New York, US",
      "device": "Chrome on Windows",
      "createdAt": "2024-01-15T10:30:00Z",
      "lastActivityAt": "2024-01-15T10:45:00Z",
      "isCurrent": true
    }
  ]
}
```

### Revoke Session

```http
DELETE /auth/sessions/:id
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Session revoked successfully"
}
```

### Logout All Sessions

```http
POST /auth/logout-all
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "message": "All sessions logged out successfully"
}
```

## Audit Log Endpoints

### Get Audit Logs

```http
GET /audit
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page
- `action` (string): Filter by action
- `userId` (string): Filter by user ID
- `startDate` (string): Filter by start date (ISO 8601)
- `endDate` (string): Filter by end date (ISO 8601)

**Response:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "log-123",
        "action": "user.login",
        "userId": "user-123",
        "userEmail": "user@example.com",
        "targetType": "user",
        "targetId": "user-123",
        "details": {
          "ipAddress": "192.168.1.100",
          "userAgent": "Mozilla/5.0..."
        },
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "total": 1000,
    "page": 1,
    "limit": 20,
    "totalPages": 50
  }
}
```

## Dashboard Endpoints

### Get Dashboard Stats

```http
GET /dashboard/stats
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "users": {
      "total": 1000,
      "active": 950,
      "verified": 900,
      "lastWeek": 50,
      "lastMonth": 200
    },
    "sessions": {
      "active": 250,
      "today": 500,
      "averageDuration": 1800
    },
    "applications": {
      "total": 25,
      "active": 20
    },
    "roles": {
      "total": 10,
      "custom": 7
    },
    "security": {
      "failedLogins24h": 45,
      "suspiciousActivities": 5,
      "blockedIPs": 12
    }
  }
}
```

### Get Activity Timeline

```http
GET /dashboard/activity
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Query Parameters:**
- `days` (number): Number of days to fetch (default: 7)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "date": "2024-01-15",
      "logins": 150,
      "registrations": 10,
      "passwordResets": 5,
      "apiCalls": 5000
    }
  ]
}
```

## Health & Monitoring Endpoints

### Health Check

```http
GET /health
```

**Response:**
```json
{
  "success": true,
  "message": "Service is healthy",
  "uptime": 86400,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Detailed Health Check

```http
GET /health/detailed
```

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "services": {
    "database": {
      "status": "healthy",
      "latency": 5
    },
    "redis": {
      "status": "healthy",
      "latency": 2
    },
    "email": {
      "status": "healthy",
      "latency": 50
    }
  },
  "metrics": {
    "cpu": 45.2,
    "memory": 62.8,
    "uptime": 86400
  }
}
```

### Prometheus Metrics

```http
GET /metrics
```

**Response:**
```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 12345
http_requests_total{method="POST",status="201"} 5678

# HELP http_request_duration_seconds HTTP request latency
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.1"} 10000
http_request_duration_seconds_bucket{le="0.5"} 12000
```

## Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Invalid input data |
| `AUTHENTICATION_ERROR` | Authentication failed |
| `AUTHORIZATION_ERROR` | Insufficient permissions |
| `NOT_FOUND_ERROR` | Resource not found |
| `CONFLICT_ERROR` | Resource already exists |
| `RATE_LIMIT_ERROR` | Too many requests |
| `INTERNAL_ERROR` | Internal server error |
| `SERVICE_UNAVAILABLE` | Service temporarily unavailable |

## Rate Limiting

- Default: 100 requests per 15 minutes per IP
- Authenticated: 1000 requests per 15 minutes per user
- OAuth2 clients: Configurable per application

Rate limit headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642521600
```

## Pagination

All list endpoints support pagination:

```http
GET /users?page=2&limit=50
```

Response includes pagination metadata:
```json
{
  "data": {
    "items": [...],
    "total": 1000,
    "page": 2,
    "limit": 50,
    "totalPages": 20,
    "hasNext": true,
    "hasPrev": true
  }
}
```

## Webhooks

Configure webhooks to receive real-time notifications:

### Events
- `user.created`
- `user.updated`
- `user.deleted`
- `user.login`
- `user.logout`
- `user.password_changed`
- `role.assigned`
- `role.removed`
- `application.created`
- `application.deleted`
- `security.suspicious_activity`

### Webhook Payload
```json
{
  "event": "user.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "userId": "user-123",
    "email": "user@example.com"
  },
  "signature": "sha256=abc123..."
}
```

## SDKs

- [Node.js SDK](https://github.com/tekparola/sso-node-sdk)
- [Python SDK](https://github.com/tekparola/sso-python-sdk)
- [Go SDK](https://github.com/tekparola/sso-go-sdk)
- [PHP SDK](https://github.com/tekparola/sso-php-sdk)

## Support

- API Status: https://status.tekparola.com
- Documentation: https://docs.tekparola.com
- Support: support@tekparola.com
