import { logger } from './logger';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold: number; // Number of failures before opening circuit
  successThreshold: number; // Number of successes needed to close circuit in half-open state
  timeout: number; // Time to wait before transitioning from open to half-open (ms)
  resetTimeout: number; // Time to wait before resetting failure count (ms)
  monitoringWindow: number; // Time window for monitoring failures (ms)
  onStateChange?: (state: CircuitBreakerState, serviceName: string) => void;
  onFailure?: (error: Error, serviceName: string) => void;
}

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  uptime: number;
}

export class CircuitBreakerError extends Error {
  constructor(serviceName: string, state: CircuitBreakerState) {
    super(`Circuit breaker is ${state} for service: ${serviceName}`);
    this.name = 'CircuitBreakerError';
  }
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private totalRequests = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private createdAt = Date.now();
  private nextAttempt = 0;
  private readonly failures: number[] = []; // Sliding window of failure timestamps

  constructor(
    private readonly serviceName: string,
    private readonly options: CircuitBreakerOptions
  ) {
    // Set default values
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      successThreshold: options.successThreshold ?? 3,
      timeout: options.timeout ?? 60000, // 1 minute
      resetTimeout: options.resetTimeout ?? 300000, // 5 minutes
      monitoringWindow: options.monitoringWindow ?? 300000, // 5 minutes
    };

    logger.info(`Circuit breaker initialized for service: ${serviceName}`, {
      options: this.options,
    });
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const canExecute = this.canExecute();
    
    if (!canExecute) {
      this.totalRequests++;
      const error = new CircuitBreakerError(this.serviceName, this.state);
      this.options.onFailure?.(error, this.serviceName);
      throw error;
    }

    this.totalRequests++;
    const startTime = Date.now();

    try {
      const result = await fn();
      this.onSuccess();
      
      logger.debug(`Circuit breaker success for ${this.serviceName}`, {
        duration: Date.now() - startTime,
        state: this.state,
      });

      return result;
    } catch (error) {
      this.onFailure(error as Error);
      
      logger.warn(`Circuit breaker failure for ${this.serviceName}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        state: this.state,
        failureCount: this.failureCount,
      });

      throw error;
    }
  }

  /**
   * Check if the circuit breaker allows execution
   */
  private canExecute(): boolean {
    const now = Date.now();

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        return true;

      case CircuitBreakerState.OPEN:
        if (now >= this.nextAttempt) {
          this.setState(CircuitBreakerState.HALF_OPEN);
          this.successCount = 0;
          return true;
        }
        return false;

      case CircuitBreakerState.HALF_OPEN:
        return true;

      default:
        return false;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.totalSuccesses++;
    this.cleanupOldFailures();

    switch (this.state) {
      case CircuitBreakerState.HALF_OPEN:
        this.successCount++;
        if (this.successCount >= this.options.successThreshold) {
          this.setState(CircuitBreakerState.CLOSED);
          this.reset();
        }
        break;

      case CircuitBreakerState.CLOSED:
        // Reset failure count after successful execution in monitoring window
        if (this.shouldResetFailures()) {
          this.failureCount = 0;
        }
        break;
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: Error): void {
    const now = Date.now();
    this.lastFailureTime = now;
    this.totalFailures++;
    this.failures.push(now);
    this.cleanupOldFailures();

    this.options.onFailure?.(error, this.serviceName);

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
      case CircuitBreakerState.HALF_OPEN:
        this.failureCount++;
        if (this.shouldOpenCircuit()) {
          this.setState(CircuitBreakerState.OPEN);
          this.nextAttempt = now + this.options.timeout;
        }
        break;
    }
  }

  /**
   * Check if circuit should be opened based on failure threshold
   */
  private shouldOpenCircuit(): boolean {
    // Count failures in the monitoring window
    const now = Date.now();
    const recentFailures = this.failures.filter(
      timestamp => now - timestamp <= this.options.monitoringWindow
    );

    return recentFailures.length >= this.options.failureThreshold;
  }

  /**
   * Check if failures should be reset based on time and success
   */
  private shouldResetFailures(): boolean {
    if (this.lastSuccessTime && this.lastFailureTime) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      return timeSinceLastFailure >= this.options.resetTimeout;
    }
    return false;
  }

  /**
   * Clean up old failures outside the monitoring window
   */
  private cleanupOldFailures(): void {
    const now = Date.now();
    const cutoff = now - this.options.monitoringWindow;
    
    // Remove old failures
    let index = 0;
    while (index < this.failures.length && this.failures[index] !== undefined && this.failures[index]! < cutoff) {
      index++;
    }
    
    if (index > 0) {
      this.failures.splice(0, index);
    }
  }

  /**
   * Set the circuit breaker state and notify listeners
   */
  private setState(newState: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = newState;

    if (oldState !== newState) {
      logger.info(`Circuit breaker state changed for ${this.serviceName}: ${oldState} -> ${newState}`, {
        failureCount: this.failureCount,
        successCount: this.successCount,
        totalRequests: this.totalRequests,
      });

      this.options.onStateChange?.(newState, this.serviceName);
    }
  }

  /**
   * Reset the circuit breaker to initial state
   */
  private reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.failures.length = 0;
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      uptime: Date.now() - this.createdAt,
    };
  }

  /**
   * Get failure rate percentage
   */
  getFailureRate(): number {
    if (this.totalRequests === 0) {
      return 0;
    }
    return (this.totalFailures / this.totalRequests) * 100;
  }

  /**
   * Get success rate percentage
   */
  getSuccessRate(): number {
    if (this.totalRequests === 0) {
      return 0;
    }
    return (this.totalSuccesses / this.totalRequests) * 100;
  }

  /**
   * Check if circuit breaker is healthy
   */
  isHealthy(): boolean {
    return this.state === CircuitBreakerState.CLOSED && this.getFailureRate() < 10;
  }

  /**
   * Force reset the circuit breaker (for emergency situations)
   */
  forceReset(): void {
    logger.warn(`Force resetting circuit breaker for ${this.serviceName}`);
    this.setState(CircuitBreakerState.CLOSED);
    this.reset();
    this.nextAttempt = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
  }

  /**
   * Force open the circuit breaker (for maintenance)
   */
  forceOpen(): void {
    logger.warn(`Force opening circuit breaker for ${this.serviceName}`);
    this.setState(CircuitBreakerState.OPEN);
    this.nextAttempt = Date.now() + this.options.timeout;
  }
}

/**
 * Circuit breaker registry for managing multiple service circuit breakers
 */
export class CircuitBreakerRegistry {
  private static instance: CircuitBreakerRegistry;
  private circuitBreakers = new Map<string, CircuitBreaker>();

  static getInstance(): CircuitBreakerRegistry {
    if (!CircuitBreakerRegistry.instance) {
      CircuitBreakerRegistry.instance = new CircuitBreakerRegistry();
    }
    return CircuitBreakerRegistry.instance;
  }

  /**
   * Get or create a circuit breaker for a service
   */
  getCircuitBreaker(serviceName: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    if (!this.circuitBreakers.has(serviceName)) {
      const defaultOptions: CircuitBreakerOptions = {
        failureThreshold: 5,
        successThreshold: 3,
        timeout: 60000,
        resetTimeout: 300000,
        monitoringWindow: 300000,
        onStateChange: (state, service) => {
          logger.info(`Circuit breaker state change: ${service} -> ${state}`);
        },
        onFailure: (error, service) => {
          logger.warn(`Circuit breaker failure: ${service}`, {
            error: error.message,
          });
        },
        ...options,
      };

      const circuitBreaker = new CircuitBreaker(serviceName, defaultOptions);
      this.circuitBreakers.set(serviceName, circuitBreaker);
    }

    return this.circuitBreakers.get(serviceName)!;
  }

  /**
   * Get all circuit breakers
   */
  getAllCircuitBreakers(): Map<string, CircuitBreaker> {
    return new Map(this.circuitBreakers);
  }

  /**
   * Get health status of all circuit breakers
   */
  getHealthStatus(): Record<string, CircuitBreakerStats & { healthy: boolean }> {
    const status: Record<string, CircuitBreakerStats & { healthy: boolean }> = {};

    for (const [serviceName, circuitBreaker] of this.circuitBreakers) {
      const stats = circuitBreaker.getStats();
      status[serviceName] = {
        ...stats,
        healthy: circuitBreaker.isHealthy(),
      };
    }

    return status;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    logger.info('Resetting all circuit breakers');
    for (const circuitBreaker of this.circuitBreakers.values()) {
      circuitBreaker.forceReset();
    }
  }

  /**
   * Remove a circuit breaker
   */
  remove(serviceName: string): boolean {
    return this.circuitBreakers.delete(serviceName);
  }

  /**
   * Clear all circuit breakers
   */
  clear(): void {
    this.circuitBreakers.clear();
  }
}

// Export singleton instance
export const circuitBreakerRegistry = CircuitBreakerRegistry.getInstance();