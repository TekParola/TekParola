import { 
  TekParolaClient, 
  TekParolaConfig,
  UserProfile,
  AuthTokens,
  LoginCredentials,
  TekParolaError,
  AuthenticationError,
  ValidationError,
  RateLimitError
} from 'tekparola-sdk';

// Initialize client with type-safe config
const config: TekParolaConfig = {
  baseUrl: 'http://localhost:3000',
  clientId: process.env.TEKPAROLA_CLIENT_ID,
  clientSecret: process.env.TEKPAROLA_CLIENT_SECRET,
  apiKey: process.env.TEKPAROLA_API_KEY,
  timeout: 30000,
  debug: process.env.NODE_ENV === 'development'
};

const client = new TekParolaClient(config);

// Type-safe authentication function
async function authenticateUser(
  credentials: LoginCredentials
): Promise<{ tokens: AuthTokens; user: UserProfile } | null> {
  try {
    const result = await client.auth.login(credentials);
    
    if (result.requiresTwoFactor && result.tempToken) {
      // Handle 2FA - in real app, get code from user input
      const code = await getUserInput('Enter 2FA code: ');
      
      const twoFactorResult = await client.auth.verifyTwoFactor({
        tempToken: result.tempToken,
        code
      });
      
      return twoFactorResult;
    }
    
    return {
      tokens: result.tokens,
      user: result.user
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      console.error('Authentication failed:', error.message);
      console.error('Error code:', error.code);
    } else if (error instanceof ValidationError) {
      console.error('Validation error:', error.message);
      console.error('Details:', error.details);
    } else if (error instanceof TekParolaError) {
      console.error('TekParola error:', error.message);
      console.error('Status code:', error.statusCode);
    } else {
      console.error('Unknown error:', error);
    }
    
    return null;
  }
}

// Type-safe user service
class UserService {
  private client: TekParolaClient;
  private currentUser: UserProfile | null = null;

  constructor(client: TekParolaClient) {
    this.client = client;
  }

  async login(email: string, password: string): Promise<boolean> {
    const result = await authenticateUser({ email, password });
    
    if (result) {
      this.currentUser = result.user;
      return true;
    }
    
    return false;
  }

  async updateProfile(updates: Partial<UserProfile>): Promise<UserProfile | null> {
    if (!this.currentUser) {
      throw new Error('No user logged in');
    }

    try {
      const updatedProfile = await this.client.user.updateProfile({
        firstName: updates.firstName,
        lastName: updates.lastName,
        phoneNumber: updates.phoneNumber,
        timezone: updates.timezone,
        language: updates.language
      });

      this.currentUser = updatedProfile;
      return updatedProfile;
    } catch (error) {
      console.error('Failed to update profile:', error);
      return null;
    }
  }

  getCurrentUser(): UserProfile | null {
    return this.currentUser;
  }
}

// Type-safe API client wrapper
class APIClient {
  private client: TekParolaClient;

  constructor(apiKey: string) {
    this.client = new TekParolaClient({
      baseUrl: config.baseUrl,
      apiKey
    });
  }

  async validateUserToken(token: string): Promise<{ valid: boolean; userId?: string }> {
    try {
      const result = await this.client.auth.validateToken(token);
      
      if (result.valid && result.user) {
        return {
          valid: true,
          userId: result.user.sub
        };
      }
      
      return { valid: false };
    } catch (error) {
      if (error instanceof RateLimitError) {
        console.error(`Rate limited. Retry after ${error.retryAfter} seconds`);
      }
      throw error;
    }
  }

  async getUserDetails(userId: string): Promise<UserProfile | null> {
    try {
      return await this.client.user.getUserById(userId);
    } catch (error) {
      if (error instanceof TekParolaError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }
}

// Express middleware with TypeScript
import { Request, Response, NextFunction } from 'express';

interface AuthenticatedRequest extends Request {
  user?: UserProfile;
  userId?: string;
}

function createAuthMiddleware(apiClient: APIClient) {
  return async (
    req: AuthenticatedRequest, 
    res: Response, 
    next: NextFunction
  ): Promise<void> => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'No token provided'
      });
      return;
    }

    try {
      const validation = await apiClient.validateUserToken(token);
      
      if (!validation.valid || !validation.userId) {
        res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
        return;
      }

      // Optionally fetch full user details
      const user = await apiClient.getUserDetails(validation.userId);
      
      if (user) {
        req.user = user;
        req.userId = validation.userId;
      }

      next();
    } catch (error) {
      if (error instanceof RateLimitError) {
        res.status(429).json({
          success: false,
          message: 'Rate limit exceeded',
          retryAfter: error.retryAfter
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Authentication error'
        });
      }
    }
  };
}

// Async/await error handling wrapper
function asyncHandler<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof TekParolaError) {
        console.error(`[${error.name}] ${error.message}`);
        if (error.details) {
          console.error('Details:', JSON.stringify(error.details, null, 2));
        }
      }
      throw error;
    }
  }) as T;
}

// Usage examples
async function main() {
  // Create services
  const userService = new UserService(client);
  const apiClient = new APIClient(config.apiKey!);

  // Login example
  const loginSuccess = await asyncHandler(async () => {
    return await userService.login('user@example.com', 'password123');
  })();

  if (loginSuccess) {
    console.log('Logged in as:', userService.getCurrentUser()?.email);
  }

  // API validation example
  const validation = await asyncHandler(async () => {
    return await apiClient.validateUserToken('some-access-token');
  })();

  console.log('Token valid:', validation.valid);
}

// Utility function to simulate user input
async function getUserInput(prompt: string): Promise<string> {
  // In a real application, this would get input from the user
  console.log(prompt);
  return '123456'; // Mock 2FA code
}

// Export for use in other modules
export { 
  UserService, 
  APIClient, 
  createAuthMiddleware,
  asyncHandler,
  AuthenticatedRequest
};

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}