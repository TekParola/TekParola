import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
  compress?: boolean;
  serialize?: boolean;
}

export interface CacheKeyConfig {
  pattern: string;
  ttl: number;
  category: string;
}

export class CacheService {
  private readonly defaultTTL = 3600; // 1 hour
  private readonly compressionThreshold = 1024; // 1KB

  // Cache key patterns and configurations
  private readonly cacheKeys: Record<string, CacheKeyConfig> = {
    // User-related caches
    USER_BY_ID: { pattern: 'user:id:{id}', ttl: 1800, category: 'user' },
    USER_BY_EMAIL: { pattern: 'user:email:{email}', ttl: 1800, category: 'user' },
    USER_PERMISSIONS: { pattern: 'user:permissions:{userId}', ttl: 900, category: 'permissions' },
    USER_ROLES: { pattern: 'user:roles:{userId}', ttl: 900, category: 'permissions' },
    USER_SESSIONS: { pattern: 'user:sessions:{userId}', ttl: 300, category: 'session' },
    
    // Application-related caches
    APPLICATION_BY_ID: { pattern: 'app:id:{id}', ttl: 3600, category: 'application' },
    APPLICATION_BY_CLIENT_ID: { pattern: 'app:client:{clientId}', ttl: 3600, category: 'application' },
    API_KEY_BY_ID: { pattern: 'apikey:id:{keyId}', ttl: 1800, category: 'application' },
    
    // Role and permission caches
    ROLE_BY_ID: { pattern: 'role:id:{id}', ttl: 7200, category: 'permissions' },
    ROLE_PERMISSIONS: { pattern: 'role:permissions:{roleId}', ttl: 7200, category: 'permissions' },
    ALL_PERMISSIONS: { pattern: 'permissions:all', ttl: 7200, category: 'permissions' },
    
    // Settings caches
    SYSTEM_SETTINGS: { pattern: 'settings:system', ttl: 1800, category: 'settings' },
    USER_SETTINGS: { pattern: 'settings:user:{userId}', ttl: 900, category: 'settings' },
    EMAIL_TEMPLATES: { pattern: 'templates:email', ttl: 3600, category: 'settings' },
    
    // Statistics and metrics
    USER_STATS: { pattern: 'stats:users', ttl: 300, category: 'stats' },
    APPLICATION_STATS: { pattern: 'stats:applications', ttl: 300, category: 'stats' },
    AUDIT_STATS: { pattern: 'stats:audit', ttl: 300, category: 'stats' },
    
    // Security-related caches
    FAILED_LOGIN_ATTEMPTS: { pattern: 'security:failed:{identifier}', ttl: 3600, category: 'security' },
    RATE_LIMIT: { pattern: 'ratelimit:{key}', ttl: 3600, category: 'security' },
    SESSION_BLACKLIST: { pattern: 'security:blacklist:session:{sessionId}', ttl: 86400, category: 'security' },
    
    // Temporary data caches
    EMAIL_VERIFICATION: { pattern: 'temp:email:verify:{token}', ttl: 3600, category: 'temporary' },
    PASSWORD_RESET: { pattern: 'temp:password:reset:{token}', ttl: 3600, category: 'temporary' },
    MAGIC_LINK: { pattern: 'temp:magic:link:{token}', ttl: 900, category: 'temporary' },
  };

  /**
   * Get cached data
   */
  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    try {
      const finalKey = this.buildKey(key, options.prefix);
      const cached = await redisClient.get(finalKey);
      
      if (!cached) {
        return null;
      }

      // Handle serialization
      if (options.serialize !== false) {
        try {
          return JSON.parse(cached);
        } catch {
          return cached as T;
        }
      }

      return cached as T;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set cached data
   */
  async set(key: string, value: any, options: CacheOptions = {}): Promise<void> {
    try {
      const finalKey = this.buildKey(key, options.prefix);
      const ttl = options.ttl || this.defaultTTL;
      
      let serializedValue: string;
      
      // Handle serialization
      if (options.serialize !== false && typeof value !== 'string') {
        serializedValue = JSON.stringify(value);
      } else {
        serializedValue = String(value);
      }

      // Set with TTL
      await redisClient.setEx(finalKey, ttl, serializedValue);
      
      logger.debug(`Cache set: ${finalKey} (TTL: ${ttl}s)`);
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
    }
  }

  /**
   * Delete cached data
   */
  async del(key: string, options: CacheOptions = {}): Promise<void> {
    try {
      const finalKey = this.buildKey(key, options.prefix);
      await redisClient.del(finalKey);
      logger.debug(`Cache deleted: ${finalKey}`);
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string, options: CacheOptions = {}): Promise<boolean> {
    try {
      const finalKey = this.buildKey(key, options.prefix);
      const result = await redisClient.exists(finalKey);
      return result === 1;
    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get or set cached data with a function
   */
  async getOrSet<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    try {
      // Try to get from cache first
      const cached = await this.get<T>(key, options);
      if (cached !== null) {
        return cached;
      }

      // If not in cache, fetch the data
      const data = await fetchFunction();
      
      // Store in cache
      await this.set(key, data, options);
      
      return data;
    } catch (error) {
      logger.error(`Cache getOrSet error for key ${key}:`, error);
      // If cache fails, still return the fetched data
      return await fetchFunction();
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
        logger.debug(`Cache invalidated pattern: ${pattern} (${keys.length} keys)`);
      }
    } catch (error) {
      logger.error(`Cache invalidate pattern error for ${pattern}:`, error);
    }
  }

  /**
   * Invalidate cache by category
   */
  async invalidateCategory(category: string): Promise<void> {
    try {
      const patterns = Object.values(this.cacheKeys)
        .filter(config => config.category === category)
        .map(config => this.buildKey(config.pattern.replace(/\{[^}]+\}/g, '*')));

      for (const pattern of patterns) {
        await this.invalidatePattern(pattern);
      }
      
      logger.info(`Cache invalidated category: ${category}`);
    } catch (error) {
      logger.error(`Cache invalidate category error for ${category}:`, error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    memory: any;
    keyspace: any;
    hits: number;
    misses: number;
    hitRate: number;
  }> {
    try {
      const info = await redisClient.info();
      const memoryInfo = await redisClient.info('memory');
      const statsInfo = await redisClient.info('stats');
      
      // Parse Redis info
      const parseInfo = (infoString: string) => {
        const result: any = {};
        infoString.split('\r\n').forEach(line => {
          if (line.includes(':')) {
            const [key, value] = line.split(':');
            if (key) {
              result[key] = isNaN(Number(value)) ? value : Number(value);
            }
          }
        });
        return result;
      };

      const memory = parseInfo(memoryInfo);
      const stats = parseInfo(statsInfo);
      
      const hits = stats.keyspace_hits || 0;
      const misses = stats.keyspace_misses || 0;
      const hitRate = hits + misses > 0 ? (hits / (hits + misses)) * 100 : 0;

      return {
        memory: {
          used: memory.used_memory_human,
          peak: memory.used_memory_peak_human,
          rss: memory.used_memory_rss_human,
        },
        keyspace: parseInfo(info),
        hits,
        misses,
        hitRate: Math.round(hitRate * 100) / 100,
      };
    } catch (error) {
      logger.error('Failed to get cache stats:', error);
      throw error;
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    try {
      await redisClient.flushDb();
      logger.info('Cache cleared');
    } catch (error) {
      logger.error('Cache clear error:', error);
    }
  }

  /**
   * Cache with specific key configuration
   */
  async cacheWithConfig(
    keyType: keyof typeof this.cacheKeys,
    params: Record<string, string>,
    value?: any
  ): Promise<any> {
    const config = this.cacheKeys[keyType];
    if (!config) {
      throw new Error(`Cache key configuration not found: ${keyType}`);
    }

    let key = config.pattern;
    Object.entries(params).forEach(([param, val]) => {
      key = key.replace(`{${param}}`, val);
    });

    if (value !== undefined) {
      // Set operation
      await this.set(key, value, { ttl: config.ttl });
      return value;
    } else {
      // Get operation
      return await this.get(key, { ttl: config.ttl });
    }
  }

  /**
   * Invalidate specific cached item
   */
  async invalidateKey(
    keyType: keyof typeof this.cacheKeys,
    params: Record<string, string>
  ): Promise<void> {
    const config = this.cacheKeys[keyType];
    if (!config) {
      throw new Error(`Cache key configuration not found: ${keyType}`);
    }

    let key = config.pattern;
    Object.entries(params).forEach(([param, val]) => {
      key = key.replace(`{${param}}`, val);
    });

    await this.del(key);
  }

  /**
   * Warm up cache with frequently accessed data
   */
  async warmupCache(): Promise<void> {
    try {
      logger.info('Starting cache warmup...');

      // Import services dynamically to avoid circular dependencies
      const [
        { userService },
        { applicationService },
        { roleService: _roleService },
        { settingsService }
      ] = await Promise.all([
        import('./userService'),
        import('./applicationService'),
        import('./roleService'),
        import('./settingsService')
      ]);

      // Warm up system settings
      try {
        const settings = await settingsService.getAllSettings();
        await this.cacheWithConfig('SYSTEM_SETTINGS', {}, settings);
      } catch (error) {
        logger.warn('Failed to warm up system settings:', error);
      }

      // Warm up all permissions
      try {
        const permissions = await prisma.permission.findMany();
        await this.cacheWithConfig('ALL_PERMISSIONS', {}, permissions);
      } catch (error) {
        logger.warn('Failed to warm up permissions:', error);
      }

      // Warm up user and application stats
      try {
        const [userStats, appStats] = await Promise.all([
          userService.getUserStats(),
          applicationService.getApplicationStats()
        ]);
        
        await Promise.all([
          this.cacheWithConfig('USER_STATS', {}, userStats),
          this.cacheWithConfig('APPLICATION_STATS', {}, appStats)
        ]);
      } catch (error) {
        logger.warn('Failed to warm up stats:', error);
      }

      logger.info('Cache warmup completed');
    } catch (error) {
      logger.error('Cache warmup failed:', error);
    }
  }

  /**
   * Set up cache invalidation hooks
   */
  setupInvalidationHooks(): void {
    // This would typically be called when data changes
    // For now, we'll document the pattern
    logger.info('Cache invalidation hooks initialized');
  }

  /**
   * Build cache key with prefix
   */
  private buildKey(key: string, prefix?: string): string {
    const basePrefix = 'tekparola';
    const fullPrefix = prefix ? `${basePrefix}:${prefix}` : basePrefix;
    return `${fullPrefix}:${key}`;
  }

  /**
   * Get cache key configuration
   */
  getCacheKeyConfig(keyType: keyof typeof this.cacheKeys): CacheKeyConfig | undefined {
    return this.cacheKeys[keyType];
  }

  /**
   * List all cache key types and their configurations
   */
  getAllCacheConfigs(): Record<string, CacheKeyConfig> {
    return { ...this.cacheKeys };
  }
}

export const cacheService = new CacheService();