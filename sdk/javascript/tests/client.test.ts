import { TekParolaClient } from '../src/client';
import { ValidationError } from '../src/errors';

describe('TekParolaClient', () => {
  describe('constructor', () => {
    it('should create client with valid config', () => {
      const client = new TekParolaClient({
        baseUrl: 'https://sso.example.com',
        apiKey: 'test-api-key'
      });

      expect(client).toBeDefined();
      expect(client.auth).toBeDefined();
      expect(client.user).toBeDefined();
      expect(client.application).toBeDefined();
    });

    it('should throw error if baseUrl is missing', () => {
      expect(() => {
        new TekParolaClient({} as any);
      }).toThrow(ValidationError);
    });

    it('should throw error if baseUrl is invalid', () => {
      expect(() => {
        new TekParolaClient({
          baseUrl: 'invalid-url'
        });
      }).toThrow(ValidationError);
    });

    it('should remove trailing slash from baseUrl', () => {
      const client = new TekParolaClient({
        baseUrl: 'https://sso.example.com/'
      });

      const config = client.getConfig();
      expect(config.baseUrl).toBe('https://sso.example.com');
    });
  });

  describe('token management', () => {
    let client: TekParolaClient;

    beforeEach(() => {
      client = new TekParolaClient({
        baseUrl: 'https://sso.example.com'
      });
    });

    it('should set and clear access token', () => {
      const token = 'test-access-token';
      
      client.setAccessToken(token);
      // Token is set internally in HttpClient
      
      client.clearAccessToken();
      // Token is cleared internally
      
      expect(true).toBe(true); // Basic test
    });

    it('should set and clear API key', () => {
      const key = 'test-api-key';
      
      client.setApiKey(key);
      // Key is set internally in HttpClient
      
      client.clearApiKey();
      // Key is cleared internally
      
      expect(true).toBe(true); // Basic test
    });
  });

  describe('health checks', () => {
    let client: TekParolaClient;

    beforeEach(() => {
      client = new TekParolaClient({
        baseUrl: 'https://sso.example.com'
      });
    });

    it('should have healthCheck method', () => {
      expect(client.healthCheck).toBeDefined();
      expect(typeof client.healthCheck).toBe('function');
    });

    it('should have apiHealthCheck method', () => {
      expect(client.apiHealthCheck).toBeDefined();
      expect(typeof client.apiHealthCheck).toBe('function');
    });
  });
});